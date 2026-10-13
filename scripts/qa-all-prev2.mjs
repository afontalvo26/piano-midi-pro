// ============================================================
// qa-all-prev2 — "canción anterior" con la actual en el índice 0: dónde
// funciona el arreglo b7b63a7 y dónde no llega.
//
// QUÉ HACE EL ARREGLO (leído en el código): cuando la actual es la PRIMERA de
// la cola, `previous()` busca en `library.history` la última canción que sonó
// que sea distinta de la actual y la inserta delante (`insertBeforeCurrent`).
// Si no encuentra ninguna, cae al comportamiento viejo: reiniciar la misma.
//
// LA CLAVE ESTÁ EN QUIÉN LLENA ESE HISTORIAL. `recordPlay` sólo se llama al
// reproducir de verdad (play/loadEntry), no al saltar de ranura en la cola. Así
// que hay dos montajes distintos y hay que medir los dos:
//
//   A. historial CON otra canción  → "anterior" debe volver a ella
//   B. historial SIN otra canción (sólo se saltó de ranura) → reinicia y se ve
//      como que el botón no hace nada  ← la limitación que queda
//
// Salida: .logs/qa/results-prev2.json  +  .logs/qa/prev2-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";

const qa = await openQA();
const { page } = qa;
const bar = () => page.evaluate(BAR_STATE);

const player = () =>
  page.evaluate(() => {
    const p = window.__PMP_PLAYER__;
    if (!p) return { disponible: false };
    const s = p.getSnapshot();
    const id = p.getCurrentTrackId();
    const meta = id ? p.getTrack(id) : null;
    const nombre = (tid) => p.getTrack(tid)?.title ?? "(sin metadatos)";
    return {
      disponible: true,
      indice: s.index,
      cola: s.queue.length,
      trackId: id,
      titulo: meta?.title ?? null,
      pausado: s.paused,
      historial: (s.library.history || []).map((h) => ({
        trackId: h.trackId,
        titulo: nombre(h.trackId),
        esLaActual: h.trackId === id,
      })),
      ranura0: s.queue[0] ? nombre(s.queue[0].trackId) : null,
      ranuraActual: s.queue[s.index] ? nombre(s.queue[s.index].trackId) : null,
    };
  });

/** Fuerza la posición por debajo del umbral de reinicio y pulsa "anterior". */
const anteriorConPosicionBaja = async () => {
  await page.locator(".pm-bar__range").evaluate((el) => {
    el.value = "0.4";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.waitForTimeout(800);
  const pos = (await bar()).seekerVal;
  await page.locator('.pm-bar button[aria-label="Canción anterior"]').click();
  await page.waitForTimeout(8000);
  return { posAlPulsar: pos, despues: { bar: await bar(), player: await player() } };
};

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(4000);

/* ══════════════════════════════════════════════════════════════════════════
   MONTAJE A — el historial SÍ tiene otra canción
   ══════════════════════════════════════════════════════════════════════════ */
console.log("################ A. historial CON otra canción ################");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(2500);

// Se eligen dos tarjetas DISTINTAS por texto, comprobando con elementFromPoint
// que el punto de click cae dentro de la tarjeta buscada.
const clickPorTitulo = async (titulo, indiceOcurrencia = 0) => {
  const cand = page.locator(".pm-card__info").filter({ hasText: titulo }).nth(indiceOcurrencia);
  await cand.scrollIntoViewIfNeeded();
  const b = await cand.boundingBox();
  const dentro = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return (el?.closest(".pm-card__info")?.querySelector(".pm-card__title")?.textContent || "").trim();
  }, { x: b.x + b.width / 2, y: b.y + b.height * 0.6 });
  if (dentro !== titulo) throw new Error(`el click apuntaría a "${dentro}", no a "${titulo}"`);
  await cand.click();
};

// 1) Tocar la canción X (queda en el índice 0 de su estantería).
const titulos = [...new Set(await page.$$eval(".pm-card__info .pm-card__title", (e) => e.map((x) => x.textContent.trim())))];
const X = titulos[0];
await clickPorTitulo(X);
await page.waitForTimeout(12000);
const a1 = { bar: await bar(), player: await player() };
console.log(`  1. "${X}" → índice ${a1.player.indice} · historial: ${a1.player.historial.map((h) => `"${h.titulo}"${h.esLaActual ? "(actual)" : ""}`).join(", ")}`);

// 2) Saltar a OTRA canción dentro de la misma cola, sin salir de la estantería.
const Y = titulos[1];
await clickPorTitulo(Y);
await page.waitForTimeout(12000);
const a2 = { bar: await bar(), player: await player() };
console.log(`  2. "${Y}" → índice ${a2.player.indice} · historial: ${a2.player.historial.map((h) => `"${h.titulo}"${h.esLaActual ? "(actual)" : ""}`).join(", ")}`);

// 3) Volver a la ranura 0 con "anterior" (posición baja) → la actual queda en 0
//    y el historial ya tiene DOS canciones distintas.
let a3 = { bar: await bar(), player: await player() };
const pasos = [];
for (let k = 0; k < 4 && a3.player.indice > 0; k++) {
  const r = await anteriorConPosicionBaja();
  pasos.push({ desde: a3.player.indice, hasta: r.despues.player.indice, posAlPulsar: r.posAlPulsar });
  a3 = r.despues;
}
console.log(`  3. retrocesos ${pasos.map((p) => `${p.desde}→${p.hasta}`).join(" ")} → actual "${a3.bar.title}" en el índice ${a3.player.indice}`);
console.log(`     historial ahora: ${a3.player.historial.map((h) => `"${h.titulo}"${h.esLaActual ? "(actual)" : ""}`).join(", ")}`);
await qa.shot("prev2-A-antes");

const conHistorial = await anteriorConPosicionBaja();
await qa.shot("prev2-A-despues");
console.log(`  4. "anterior" con la actual en el índice 0 → "${conHistorial.despues.bar.title}" (índice ${conHistorial.despues.player.indice}, pos al pulsar ${conHistorial.posAlPulsar}s)`);

const A_ok = conHistorial.despues.player.trackId !== a3.player.trackId;
qa.add({
  control: 'C · "Canción anterior" en el índice 0 CON otra canción en el historial (arreglo b7b63a7)',
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: A_ok ? "OK" : "FAIL",
  evidence:
    `Se armó el historial tocando dos canciones distintas: "${a1.player.titulo}" (índice ${a1.player.indice}) → "${a2.player.titulo}" (índice ${a2.player.indice}), ` +
    `luego ${pasos.length} retroceso(s) de ranura con la posición forzada (${pasos.map((p) => `${p.desde}→${p.hasta} @${p.posAlPulsar}s`).join(", ")}) hasta dejar la actual en el índice **${a3.player.indice}** ("${a3.bar.title}"). ` +
    `Historial en ese momento: ${a3.player.historial.map((h) => `"${h.titulo}"${h.esLaActual ? " (actual)" : ""}`).join(", ")}. ` +
    `Al pulsar "anterior": "${a3.bar.title}" → **"${conHistorial.despues.bar.title}"** (índice ${conHistorial.despues.player.indice}). ¿Cambió de canción en vez de reiniciar? **${A_ok}**`,
  shot: `${OUT}/prev2-A-antes.png · ${OUT}/prev2-A-despues.png`,
  extra: { X, Y, a1, a2, a3, pasos, conHistorial, A_ok },
});

/* ══════════════════════════════════════════════════════════════════════════
   MONTAJE B — el historial NO tiene otra canción (sólo se saltó de ranura)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n################ B. historial SIN otra canción (sólo saltos de ranura) ################");
await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(4000);
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(2500);

// Tocar una sola canción y saltar de ranura SÓLO con "siguiente": `next()` usa
// setIndex y no llama a recordPlay, así que el historial se queda con una sola
// entrada (la de la canción que se tocó).
await page.locator(".pm-card__info").first().click();
await page.waitForTimeout(12000);
const b1 = { bar: await bar(), player: await player() };
console.log(`  tocada "${b1.bar.title}" → índice ${b1.player.indice} · historial: ${b1.player.historial.map((h) => `"${h.titulo}"${h.esLaActual ? "(actual)" : ""}`).join(", ")}`);

await page.locator('.pm-bar button[aria-label="Canción siguiente"]').click();
await page.waitForTimeout(9000);
const b2 = { bar: await bar(), player: await player() };
console.log(`  "siguiente" → "${b2.bar.title}" índice ${b2.player.indice} · historial: ${b2.player.historial.map((h) => `"${h.titulo}"${h.esLaActual ? "(actual)" : ""}`).join(", ")}`);

// Volver a la ranura 0 con "anterior" (posición baja).
const volver = await anteriorConPosicionBaja();
const b3 = volver.despues;
console.log(`  "anterior" para volver a la ranura 0 → "${b3.bar.title}" índice ${b3.player.indice} · historial: ${b3.player.historial.map((h) => `"${h.titulo}"${h.esLaActual ? "(actual)" : ""}`).join(", ")}`);
await qa.shot("prev2-B-antes");

const sinHistorial = await anteriorConPosicionBaja();
await qa.shot("prev2-B-despues");
const B_cambio = sinHistorial.despues.player.trackId !== b3.player.trackId;
console.log(`  "anterior" con la actual en el índice 0 → "${sinHistorial.despues.bar.title}" (índice ${sinHistorial.despues.player.indice}, pos al pulsar ${sinHistorial.posAlPulsar}s) · ¿cambió? ${B_cambio}`);

qa.add({
  control: 'C2 · "Canción anterior" en el índice 0 cuando el historial NO tiene otra canción',
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: B_cambio ? "OK" : "FAIL",
  evidence:
    `Se tocó una sola canción ("${b1.bar.title}", historial: ${b1.player.historial.map((h) => `"${h.titulo}"`).join(", ")}) y se cambió de ranura SÓLO con "siguiente", que no llama a recordPlay: ` +
    `"${b2.bar.title}" en el índice ${b2.player.indice} con el historial todavía en ${b2.player.historial.length} entrada(s). ` +
    `Se volvió a la ranura 0 y se pulsó "anterior" con la posición en ${sinHistorial.posAlPulsar}s: "${b3.bar.title}" → **"${sinHistorial.despues.bar.title}"**, índice ${sinHistorial.despues.player.indice}. ` +
    `¿Cambió de canción? **${B_cambio}**. Como el historial no tiene otra canción que ofrecer, cae al comportamiento viejo: reinicia la misma desde ~0,4 s, que a la vista es indistinguible de "el botón no hizo nada"`,
  shot: `${OUT}/prev2-B-antes.png · ${OUT}/prev2-B-despues.png`,
  extra: { b1, b2, b3, volver, sinHistorial, B_cambio },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.save("results-prev2");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-prev2.json`);
await qa.close();
