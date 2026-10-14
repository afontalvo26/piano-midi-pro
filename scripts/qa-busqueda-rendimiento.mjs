/**
 * Mide qué pasa al ESCRIBIR en el buscador de canciones: nodos del DOM,
 * memoria, tareas largas y tiempo hasta que la lista se actualiza.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 *
 * El dueño reportó "cuando uso el buscador de canciones se cae la app". "Se cae"
 * puede ser tres cosas distintas y hay que separarlas con evidencia:
 *
 *   1. **Crash del renderer** -> Playwright emite `page.on("crash")` y la página
 *      deja de responder. Es lo más grave y NO deja error de JS.
 *   2. **Congelamiento** -> la página responde, pero cada tecla tarda cientos de
 *      milisegundos (tareas largas >50 ms encadenadas).
 *   3. **Error de JS** -> `page.on("pageerror")` con mensaje y stack.
 *
 * Mide las tres y guarda la serie completa: nodos, heap, tarea larga máxima y
 * latencia por tecla. Sin números, "se cae" no dice qué arreglar.
 *
 * Uso: node scripts/qa-busqueda-rendimiento.mjs [puerto] [consulta] [pantalla]
 *      pantalla = canciones (biblioteca .lib-*) | musica (Buscar .pm-*)
 */

import { chromium } from "@playwright/test";

const PORT = process.argv[2] ?? "1236";
const CONSULTA = process.argv[3] ?? "corazon";
const PANTALLA = process.argv[4] ?? "canciones";
const BASE = `http://localhost:${PORT}/`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--js-flags=--expose-gc"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);

const crashed = { value: false, at: null };
const pageErrors = [];
const consoleErrors = [];

page.on("crash", () => {
  crashed.value = true;
  crashed.at = new Date().toISOString();
  console.log("\n!!! CRASH DEL RENDERER (page.on('crash')) !!!\n");
});
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
});

const firmas =
  PANTALLA === "musica"
    ? { input: ".pm-search__input", resultados: ".pm-search-results, .pm-content", fila: ".pm-row" }
    : { input: ".lib-search__input", resultados: ".lib-results", fila: ".lib-card" };

/** Instrumentación en la página: tareas largas + latencia por tecla. */
async function instrumentar() {
  await page.evaluate((firmas) => {
    const w = window;
    w.__busq = { teclas: [], longTasks: [], picos: [] };

    // Tareas largas (>50 ms) durante toda la sesión.
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__busq.longTasks.push({
            start: Math.round(entry.startTime),
            dur: Math.round(entry.duration),
          });
        }
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch {
      /* el navegador no soporta longtask */
    }

    const input = document.querySelector(firmas.input);

    let pending = null;

    input?.addEventListener(
      "input",
      () => {
        pending = {
          valor: input.value,
          t0: performance.now(),
          nodosEnInput: document.querySelectorAll("*").length,
        };
        // El render de React es sincrónico dentro del evento discreto, pero el
        // montaje progresivo usa rAF: se esperan dos frames para ver el efecto.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (!pending) return;
            const t1 = performance.now();
            w.__busq.teclas.push({
              valor: pending.valor,
              ms: +(t1 - pending.t0).toFixed(1),
              nodos: document.querySelectorAll("*").length,
              nodosAlEscribir: pending.nodosEnInput,
              tarjetas: document.querySelectorAll(firmas.fila).length,
              heap: w.performance?.memory?.usedJSHeapSize ?? null,
            });
            pending = null;
          }),
        );
      },
      true,
    );

    // Muestreo de picos cada 60 ms, para ver si el DOM se dispara ENTRE teclas.
    w.__busqTimer = setInterval(() => {
      w.__busq.picos.push({
        nodos: document.querySelectorAll("*").length,
        heap: w.performance?.memory?.usedJSHeapSize ?? null,
      });
      if (w.__busq.picos.length > 4000) clearInterval(w.__busqTimer);
    }, 60);
  }, firmas);
}

const resumen = (etiqueta) => ({ etiqueta, ...crashed, pageErrors: [...pageErrors] });
const fallos = [];

console.log(`\n=== BUSCADOR: puerto ${PORT}, pantalla ${PANTALLA}, consulta "${CONSULTA}" ===`);

await page.goto(BASE, { waitUntil: "domcontentloaded" });

if (PANTALLA === "musica") {
  // Música -> Buscar: el buscador vive dentro de la vista "search".
  await page.getByRole("button", { name: /^Música$/ }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^Buscar$/ }).first().click();
  await page.waitForSelector(".pm-search__input", { timeout: 60000 });
} else {
  // La biblioteca vive en la pestaña "Canciones".
  await page.getByRole("button", { name: /Canciones/ }).first().click();
  await page.waitForSelector(".lib-card", { timeout: 60000 });
}
await page.waitForTimeout(2500); // que termine el montaje progresivo

const search = page.locator(firmas.input).first();
if ((await search.count()) === 0) {
  console.error(`FALLO: no encontré el buscador (${firmas.input}).`);
  await browser.close();
  process.exit(1);
}

await instrumentar();

const antes = await page.evaluate(
  (firmas) => ({
    nodos: document.querySelectorAll("*").length,
    tarjetas: document.querySelectorAll(firmas.fila).length,
    heap: performance?.memory?.usedJSHeapSize ?? null,
    canciones:
      document.querySelector(".lib-hero__count")?.textContent ??
      document.querySelector(".pm-hero__sub")?.textContent ??
      document.querySelector(".pm-page-sub")?.textContent ??
      "?",
  }),
  firmas,
);
console.log(
  `\nAntes de escribir: ${antes.nodos} nodos, ${antes.tarjetas} tarjetas, ` +
    `heap ${antes.heap ? (antes.heap / 1048576).toFixed(1) + " MB" : "n/d"}, ` +
    `catálogo ${String(antes.canciones).trim().slice(0, 60)}`,
);

// ── Escribir letra por letra, como un usuario ─────────────────────────────
console.log(`\nEscribiendo "${CONSULTA}" letra por letra…`);
await search.click();
for (const ch of CONSULTA) {
  if (crashed.value) {
    console.log(`  !! la pestaña se cayó tras escribir "${ch}"`);
    break;
  }
  await search.press(ch).catch(() => {});
  await page.waitForTimeout(220);
}
await page.waitForTimeout(800);

if (!crashed.value) {
  // Borrar todo, que es el otro camino que reporta el dueño.
  for (let i = 0; i < CONSULTA.length; i++) {
    if (crashed.value) break;
    await search.press("Backspace").catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
}

// ── Casos extra ───────────────────────────────────────────────────────────
const casos = [
  { nombre: "con tilde", valor: "corazón" },
  { nombre: "sin tilde", valor: "corazon" },
  { nombre: "dos palabras al revés", valor: "mucho besame" },
  { nombre: "una letra", valor: "c" },
  { nombre: "dos letras", valor: "co" },
  { nombre: "sin resultados", valor: "zzzzqqqq" },
  { nombre: "vaciar", valor: "" },
];

console.log("\n=== CASOS ===");
for (const caso of casos) {
  if (crashed.value) {
    console.log(`  ${caso.nombre}: SALTEADO (pestaña caída)`);
    break;
  }
  const t0 = Date.now();
  let estado = "ok";
  try {
    await search.fill("");
    await page.waitForTimeout(250);
    if (caso.valor) {
      await search.fill(caso.valor);
    }
    await page.waitForTimeout(900);
    const info = await page.evaluate(
      (firmas) => ({
        nodos: document.querySelectorAll("*").length,
        tarjetas: document.querySelectorAll(firmas.fila).length,
        titulos: [...document.querySelectorAll(".lib-card__title, .pm-row__title")]
          .slice(0, 3)
          .map((n) => (n.textContent ?? "").trim()),
      }),
      firmas,
    );
    console.log(
      `  ${caso.nombre.padEnd(24)} "${caso.valor}" -> ${info.tarjetas} tarjetas, ` +
        `${info.nodos} nodos, ${Date.now() - t0} ms  ${JSON.stringify(info.titulos)}`,
    );
  } catch (error) {
    estado = String(error).slice(0, 120);
    console.log(`  ${caso.nombre.padEnd(24)} -> FALLO: ${estado}`);
  }
}

// ── Números finales ───────────────────────────────────────────────────────
let datos = { teclas: [], longTasks: [], picos: [] };
let finales = {};
if (!crashed.value) {
  try {
    datos = await page.evaluate(() => {
      clearInterval(window.__busqTimer);
      return window.__busq;
    });
    finales = await page.evaluate(() => ({
      nodos: document.querySelectorAll("*").length,
      heap: performance?.memory?.usedJSHeapSize ?? null,
    }));
  } catch (error) {
    console.log(`  (no se pudieron leer las métricas: ${String(error).slice(0, 80)})`);
  }
}

console.log("\n=== TECLA POR TECLA ===");
console.log("  valor            ms     nodos   tarjetas   heap(MB)");
for (const t of datos.teclas) {
  console.log(
    `  ${String(t.valor).padEnd(14)} ${String(t.ms).padStart(6)}  ` +
      `${String(t.nodos).padStart(6)}  ${String(t.tarjetas).padStart(8)}   ` +
      `${t.heap ? (t.heap / 1048576).toFixed(1) : "n/d"}`,
  );
}
if (datos.teclas.length) {
  const ms = datos.teclas.map((t) => t.ms);
  const nodos = datos.teclas.map((t) => t.nodos);
  console.log(
    `  latencia por tecla: min ${Math.min(...ms)} ms · mediana ${
      ms.slice().sort((a, b) => a - b)[Math.floor(ms.length / 2)]
    } ms · max ${Math.max(...ms)} ms`,
  );
  console.log(`  nodos: min ${Math.min(...nodos)} · max ${Math.max(...nodos)}`);
}

const picos = datos.picos.map((p) => p.nodos);
if (picos.length) {
  console.log(`  nodos muestreados: min ${Math.min(...picos)} · max ${Math.max(...picos)}`);
}
const heaps = datos.picos.map((p) => p.heap).filter(Boolean);
if (heaps.length) {
  console.log(
    `  heap muestreado: min ${(Math.min(...heaps) / 1048576).toFixed(1)} MB · ` +
      `max ${(Math.max(...heaps) / 1048576).toFixed(1)} MB`,
  );
}

const largas = datos.longTasks.filter((t) => t.dur > 50);
console.log(`\n=== TAREAS LARGAS (>50 ms): ${largas.length} ===`);
for (const t of largas.slice(0, 12)) {
  console.log(`  ${t.start} ms → ${t.dur} ms`);
}
if (largas.length > 12) console.log(`  … y ${largas.length - 12} más`);

console.log("\n=== ERRORES ===");
console.log(`  page.on("crash")      : ${crashed.value ? "SÍ — la pestaña se cayó" : "no"}`);
console.log(`  errores de JS         : ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 5)) console.log(`    ${e}`);
console.log(`  errores de consola    : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 5)) console.log(`    ${e}`);

console.log(`\n  nodos finales: ${finales.nodos ?? "n/d"}`);
if (finales.heap) console.log(`  heap final: ${(finales.heap / 1048576).toFixed(1)} MB`);

if (crashed.value) fallos.push("crash del renderer");
if (pageErrors.length) fallos.push(`${pageErrors.length} error(es) de JS`);

try {
  await browser.close();
} catch {
  /* la pestaña ya no está */
}

console.log("");
if (fallos.length) {
  console.error(`FALLO: ${fallos.join(", ")}.`);
  process.exitCode = 1;
} else {
  console.log("OK: no hubo crash ni errores de JS al buscar.");
}
void resumen;
