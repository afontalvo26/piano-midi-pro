/**
 * Ráfagas de «siguiente»/«anterior»: ¿termina en la canción correcta y sonando?
 *
 * ── QUÉ MIDE ───────────────────────────────────────────────────────────────
 *
 * Una ráfaga es el caso donde varias cargas de canción están en vuelo a la vez.
 * Por cada ráfaga comprueba tres cosas que pueden romperse por separado:
 *
 *   1. **La canción final es la correcta.** Se calcula el índice que la cola
 *      DEBE tener después de N pulsaciones y se compara con el que tiene. Y se
 *      comprueba la coherencia que de verdad importa: el índice de la cola y la
 *      canción que el MOTOR tiene cargada tienen que ser la misma.
 *   2. **Suena.** Tap de RMS en la salida real del `AudioContext` (no el botón:
 *      que la UI diga "Pausar" no prueba que haya audio).
 *   3. **La app sigue viva.** Una acción de UI después de la ráfaga, y el
 *      contador de tareas largas.
 *
 * Uso: node scripts/qa-rafagas-cancion.mjs [puerto] [pestañas]
 *      el segundo argumento, si es `2`, abre una pestaña HERMANA que también
 *      reproduce — el escenario del dueño y el que hacía pelear por el audio.
 */

import { chromium } from "@playwright/test";

const PORT = process.argv[2] ?? "1235";
const PESTANAS = Number(process.argv[3] ?? 1);
const BASE = `http://localhost:${PORT}/`;

const TAP = `
(() => {
  let analyser = null, buf = null;
  const ensure = (ctx) => { if (analyser) return analyser; analyser = ctx.createAnalyser(); analyser.fftSize = 2048; buf = new Float32Array(analyser.fftSize); return analyser; };
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target && target.constructor && target.constructor.name === "AudioDestinationNode") {
      try { orig.call(this, ensure(this.context)); } catch {}
    }
    return orig.call(this, target, ...rest);
  };
  window.__RMS = () => { if (!analyser) return null; analyser.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]*buf[i]; const r = Math.sqrt(s/buf.length); return r > 0 ? 20*Math.log10(r) : -Infinity; };
  window.__LONG = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) window.__LONG++; }).observe({ entryTypes: ["longtask"] });
})();
`;

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addInitScript(TAP);

const errores = [];

async function abrir() {
  const p = await context.newPage();
  p.setDefaultTimeout(30000);
  p.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
  p.on("console", (m) => {
    if (m.type() === "error" && !/ERR_ABORTED|ERR_FILE_NOT_FOUND/.test(m.text())) {
      errores.push(`console: ${m.text().slice(0, 160)}`);
    }
  });
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".pm-bar", { timeout: 30000 });
  await p.waitForTimeout(4000);
  return p;
}

const page = await abrir();
if (PESTANAS === 2) {
  const otra = await abrir();
  const rail = otra.locator(".rail-item").filter({ hasText: "Canciones" }).first();
  if ((await rail.count()) > 0) {
    await rail.click();
    await otra.waitForTimeout(3500);
  }
  await otra.locator(".lib-card__play").first().click();
  await otra.waitForTimeout(6000);
  console.log(`  pestaña hermana sonando: ${((await otra.evaluate(() => window.__RMS())) ?? -999).toFixed(1)} dB`);
}

// Una canción al frente para tener cola (playTrack deja la biblioteca detrás).
const rail = page.locator(".rail-item").filter({ hasText: "Canciones" }).first();
if ((await rail.count()) > 0) {
  await rail.click();
  await page.waitForTimeout(3500);
}
await page.locator(".lib-card__play").first().click();
await page.waitForTimeout(7000);

/** Lo que dice la cola (asa de desarrollo) y lo que tiene el motor. */
const estado = () =>
  page.evaluate(() => {
    const store = window.__PMP_PLAYER__;
    const snap = store?.getSnapshot?.();
    const motor = window.__PLAYER__;
    const bar = document.querySelector(".pm-bar");
    const tiempos = [...(bar?.querySelectorAll(".pm-bar__time") ?? [])].map(
      (n) => (n.textContent ?? "").trim(),
    );
    return {
      indice: snap?.index ?? null,
      colaLargo: snap?.queue?.length ?? null,
      idEnCola: snap?.queue?.[snap.index]?.trackId ?? null,
      idEnMotor: motor?.loadedSongId?.() ?? null,
      posicion: motor?.position?.() ?? null,
      creeSonar: motor?.intendsToPlay?.() ?? null,
      titulo: bar?.querySelector(".pm-bar__title")?.textContent?.trim() ?? "",
      tiempos,
      pausar: [...(bar?.querySelectorAll("button") ?? [])].some(
        (b) => b.getAttribute("aria-label") === "Pausar",
      ),
      rms: window.__RMS(),
      longTasks: window.__LONG,
      cargando: document.querySelectorAll('[aria-label="Cargando"]').length > 0,
    };
  });

const boton = (label) => page.locator(`.pm-bar button[aria-label="${label}"]`).first();

let fallos = 0;

for (const [label, tamano] of [
  ["siguiente", 5],
  ["siguiente", 10],
  ["anterior", 5],
  ["anterior", 10],
]) {
  const antes = await estado();
  // Índice esperado: la cola avanza/retrocede una ranura por pulsación, y en los
  // extremos se queda donde está (repeat en off).
  const paso = label === "siguiente" ? 1 : -1;
  const esperado = Math.min(
    Math.max((antes.indice ?? 0) + paso * tamano, 0),
    (antes.colaLargo ?? 1) - 1,
  );

  const nombreBoton = label === "siguiente" ? "Canción siguiente" : "Canción anterior";
  const t0 = Date.now();
  for (let i = 0; i < tamano; i++) {
    await boton(nombreBoton).click({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
  }

  /*
   * Asentarse son dos cosas distintas y hay que esperar las dos:
   *
   *   1. que la CARGA termine (sin spinner y con la cola y el motor de acuerdo), y
   *   2. que SUENE. El motor prepara el grafo y decodifica los samples DESPUÉS de
   *      cargar, así que un `!cargando` no prueba que haya audio — medir ahí da
   *      falsos negativos con la máquina cargada, que es justo el caso de una
   *      ráfaga.
   */
  let cargado = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(400);
    const e = await estado();
    if (!e.cargando && e.idEnCola === e.idEnMotor) {
      cargado = e;
      break;
    }
  }
  const msCarga = Date.now() - t0;

  let sono = null;
  for (let i = 0; i < 50; i++) {
    const e = await estado();
    if ((e.rms ?? -Infinity) > -40) {
      sono = e;
      break;
    }
    await page.waitForTimeout(500);
  }
  const ms = Date.now() - t0;
  const e = sono ?? cargado ?? (await estado());

  const problemas = [];
  if (e.indice !== esperado) problemas.push(`índice ${e.indice} ≠ esperado ${esperado}`);
  if (e.idEnCola !== e.idEnMotor) problemas.push(`cola "${e.idEnCola}" ≠ motor "${e.idEnMotor}"`);
  if (!sono) problemas.push(`no suena en 25 s (${(e.rms ?? -999).toFixed(1)} dB)`);
  if (!e.pausar) problemas.push("el botón no dice Pausar");
  if (e.cargando) problemas.push("quedó «Cargando…»");

  if (problemas.length) {
    fallos++;
    console.log(
      `  FALLO ráfaga de ${String(tamano).padStart(2)} × ${label.padEnd(9)} (carga ${(msCarga / 1000).toFixed(1)} s, total ${(ms / 1000).toFixed(1)} s): ${problemas.join(" · ")}`,
    );
    console.log(`        "${e.titulo}"  ${e.tiempos.join("/")}  pos=${e.posicion}  long=${e.longTasks}`);
  } else {
    console.log(
      `  OK    ráfaga de ${String(tamano).padStart(2)} × ${label.padEnd(9)} (carga ${(msCarga / 1000).toFixed(1)} s, suena en ${(ms / 1000).toFixed(1)} s): quedó "${e.titulo}"  ${e.tiempos.join("/")}  ${(e.rms ?? 0).toFixed(1)} dB  long=${e.longTasks}`,
    );
  }
}

// ¿La app sigue respondiendo?
const tResp = Date.now();
let responde = true;
try {
  await boton("Activar repetición").click({ timeout: 6000 });
} catch {
  responde = false;
}
const msRespuesta = Date.now() - tResp;
await page.waitForTimeout(2000);
const fin = await estado();

console.log("\n=== VEREDICTO ===");
console.log(`  ráfagas fallidas:        ${fallos} / 4`);
console.log(`  ¿la app responde?        ${responde ? `SÍ (${msRespuesta} ms)` : "NO"}`);
console.log(`  estado final:            "${fin.titulo}"  ${fin.tiempos.join("/")}  pos=${fin.posicion}  pausar=${fin.pausar}`);
console.log(`  rms final:               ${(fin.rms ?? -999).toFixed(1)} dB`);
console.log(`  tareas largas (>50 ms):  ${fin.longTasks}`);
console.log(`  errores JS:              ${errores.length}`);
for (const err of errores.slice(0, 5)) console.log(`     ${err.split("\n")[0]}`);

await browser.close();
if (fallos > 0 || errores.length > 0) process.exitCode = 1;
