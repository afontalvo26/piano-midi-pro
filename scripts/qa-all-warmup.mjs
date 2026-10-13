// ============================================================
// qa-all-warmup — cuánto tarda en sonar la primera nota tras pulsar
// "Reproducir" en el Studio (arranque en frío) y cuánto en el segundo intento.
//
// Contexto: el primer pase midió RMS −inf en "Bolero_-_Besame_Mucho.kar"
// durante 11 s y lo reportó como fallo; el diagnóstico con más muestras mostró
// que el audio SÍ aparece, pero sólo después de varios segundos construyendo el
// motor. Este script data ese retardo con una resolución de 200 ms.
//
// Salida: .logs/qa/results-warmup.json  +  .logs/qa/warmup-*.png
// ============================================================

import { openQA, URL, OUT } from "./qa-all-lib.mjs";

const SONG = "app/public/demo/Bolero_-_Besame_Mucho.kar";

const qa = await openQA();
const { page } = qa;

const estado = () =>
  page.evaluate(() => {
    const seek = document.querySelector('.seeker-container input[type="range"]');
    return {
      pos: seek ? Number(seek.value) : null,
      boton: (document.querySelector(".playback-bar .btn.primary")?.textContent || "").trim(),
      discapacitado: document.querySelector(".playback-bar .btn.primary")?.disabled ?? null,
      pildora: (document.querySelector(".status-pill:last-child")?.textContent || "").trim(),
      cargandoSpinner: !!document.querySelector(".playback-bar .spinner"),
    };
  });

/** Espera a que la señal de audio cruce un nivel, midiendo el tiempo. */
const esperarAudio = async (umbral = -70, maxMs = 30000) => {
  const t0 = Date.now();
  const traza = [];
  let primero = null;
  while (Date.now() - t0 < maxMs) {
    const v = await page.evaluate(() => window.__RMS());
    traza.push({ ms: Date.now() - t0, db: v });
    if (primero === null && v !== null && v > umbral) primero = Date.now() - t0;
    if (primero !== null && Date.now() - t0 > primero + 1500) break;
    await page.waitForTimeout(200);
  }
  return { primero, traza };
};

const picoDe = (traza) => Math.max(...traza.map((t) => t.db));

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3000);
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(SONG);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.waitForTimeout(2000);
await page.locator('.seeker-container input[type="range"]').evaluate((el) => {
  el.value = String(Number(el.max) * 0.25);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1000);

// ── arranque en frío ────────────────────────────────────────────────────────
console.log("### 1. Arranque EN FRÍO (el motor de audio aún no existe)");
const pre = await estado();
const antesCtx = await page.evaluate(() => (window.__CTXSTATE ? window.__CTXSTATE() : "sin contextos"));
console.log(`  antes: botón="${pre.boton}" deshabilitado=${pre.discapacitado} píldora="${pre.pildora}" audioContexts=${JSON.stringify(antesCtx)}`);
await qa.shot("warmup-01-antes");
const tBoton = Date.now();
await page.locator(".playback-bar .btn.primary").click();
const frio = await esperarAudio(-70, 30000);
const msFrio = frio.primero;
await qa.shot("warmup-02-frio-sonando");
const postFrio = await estado();
console.log(`  primera señal audible a los ${msFrio === null ? ">30000" : msFrio} ms (pico ${picoDe(frio.traza).toFixed(1)} dB); botón al detectarla="${postFrio.boton}"`);
console.log(`  traza: ${frio.traza.filter((_, i) => i % 5 === 0).map((t) => `${(t.ms / 1000).toFixed(1)}s:${t.db === -Infinity ? "-inf" : t.db.toFixed(1)}`).join(" ")}`);
void tBoton;
qa.add({
  control: "Studio: tiempo hasta la primera señal audible en arranque EN FRÍO",
  selector: ".playback-bar .btn.primary",
  result: msFrio === null ? "FAIL" : msFrio < 4000 ? "OK" : "FAIL",
  evidence:
    `desde el click hasta que la salida cruza −70 dB: ${msFrio === null ? "más de 30 s (nunca)" : `${msFrio} ms`}; pico alcanzado ${picoDe(frio.traza).toFixed(1)} dB. ` +
    `Antes del click no existía ningún AudioContext (${JSON.stringify(antesCtx)}); la píldora de estado decía "${pre.pildora}" y el botón "${pre.boton}" (deshabilitado=${pre.discapacitado})`,
  shot: `${OUT}/warmup-01-antes.png · ${OUT}/warmup-02-frio-sonando.png`,
  extra: { msFrio, pre, antesCtx, traza: frio.traza },
});

// ── tras Detener, segundo arranque (motor ya construido) ────────────────────
console.log("\n### 2. Segundo arranque (motor ya construido)");
await page.locator('.playback-bar button:has-text("Detener")').click();
await page.waitForTimeout(3500);
const antes2 = await estado();
console.log(`  antes: botón="${antes2.boton}" posición=${antes2.pos}`);
await page.locator(".playback-bar .btn.primary").click();
const caliente = await esperarAudio(-70, 20000);
const msCaliente = caliente.primero;
await qa.shot("warmup-03-caliente-sonando");
console.log(`  primera señal audible a los ${msCaliente === null ? ">20000" : msCaliente} ms (pico ${picoDe(caliente.traza).toFixed(1)} dB)`);
qa.add({
  control: "Studio: tiempo hasta la primera señal audible con el motor YA construido",
  selector: ".playback-bar .btn.primary",
  result: msCaliente === null ? "FAIL" : msCaliente < 4000 ? "OK" : "FAIL",
  evidence:
    `segundo arranque (tras Detener, misma canción y misma sesión): primera señal a los ${msCaliente === null ? ">20 s" : `${msCaliente} ms`}; ` +
    `pico ${picoDe(caliente.traza).toFixed(1)} dB. La diferencia con el arranque en frío (${msFrio === null ? ">30 s" : `${msFrio} ms`}) es el coste de construir el grafo y bajar las muestras`,
  shot: `${OUT}/warmup-03-caliente-sonando.png`,
  extra: { msCaliente, traza: caliente.traza },
});
await page.locator('.playback-bar button:has-text("Detener")').click();
await page.waitForTimeout(2000);

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.save("results-warmup");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-warmup.json`);
await qa.close();
