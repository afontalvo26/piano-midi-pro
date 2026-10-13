// ============================================================
// qa-all-cola — consecuencia real del efecto lateral del input del Studio.
//
// EL EFECTO: cargar archivos por el input del Studio los agrega a la cola del
// reproductor y deja el índice en 0, así que la barra muestra el archivo
// recién cargado pero la cola conserva todo lo anterior.
//
// LA PREGUNTA QUE DECIDE SI ES COSMÉTICO O GRAVE (pedido del dueño/coordinador):
//   después de cargar 3 archivos por el Studio, ¿qué hace "Canción siguiente"?
//     a) reproduce una canción vieja de la cola  → bug real
//     b) salta a otra cosa predecible            → a documentar
//     c) no hace nada                            → bug real de otra forma
//
// Se mide leyendo el índice y la cola REALES con `window.__PMP_PLAYER__`, no
// deduciéndolos del DOM.
//
// Salida: .logs/qa/results-cola.json  +  .logs/qa/cola-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";

const DEMO = "app/public/demo";
const ARCHIVOS = [
  `${DEMO}/Bolero_-_Besame_Mucho.kar`,
  `${DEMO}/Beethoven_-_Moonlight_Sonata_1st.mid`,
  `${DEMO}/Scott_Joplin_-_The_Entertainer.mid`,
];

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
    const run = (from, n) =>
      s.queue.slice(from, from + n).map((e) => {
        const m = p.getTrack(e.trackId);
        return { uid: e.uid, trackId: e.trackId, titulo: m?.title ?? "(sin metadatos)" };
      });
    return {
      disponible: true,
      indice: s.index,
      cola: s.queue.length,
      pausado: s.paused,
      trackId: id,
      titulo: meta?.title ?? null,
      origen: s.origin ? `${s.origin.kind}:${s.origin.label}` : null,
      // Ventana alrededor del índice actual: lo que "siguiente" va a tocar.
      desdeIndice: s.index >= 0 ? run(s.index, 5) : [],
      // Primeras entradas de la cola, para ver si quedaron las viejas.
      cabeza: run(0, 5),
      historial: (s.library.history || []).length,
    };
  });

const studio = () =>
  page.evaluate(() => ({
    topbar: (document.querySelector(".topbar-header p")?.textContent || "").replace(/\s+/g, " ").trim(),
    reloj: (document.querySelector(".time-display")?.textContent || "").trim(),
    boton: (document.querySelector(".playback-bar .btn.primary")?.textContent || "").trim(),
  }));

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(4000);
await qa.shot("cola-00-inicio");

const inicio = { bar: await bar(), player: await player() };
console.log(`### estado inicial: barra="${inicio.bar.title}" cola=${inicio.player.cola} índice=${inicio.player.indice}`);

// ── Cargar 3 archivos por el input del Studio, sin tocar nada más ───────────
console.log("\n### cargando 3 archivos por el input del Studio");
const trasCadaUno = [];
for (const [i, ruta] of ARCHIVOS.entries()) {
  await page.locator('.rail-item[title="Studio"]').click();
  await page.waitForTimeout(1200);
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(ruta);
  await page.waitForFunction(
    () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
    { timeout: 40000 },
  );
  await page.waitForTimeout(2500);
  const st = { bar: await bar(), player: await player(), studio: await studio() };
  trasCadaUno.push({ n: i + 1, archivo: ruta.split("/").pop(), ...st });
  console.log(
    `  ${i + 1}. ${ruta.split("/").pop()} → barra="${st.bar.title}" índice=${st.player.indice} cola=${st.player.cola} pausado=${st.player.pausado} origen=${st.player.origen}`,
  );
  await qa.shot(`cola-0${i + 1}-tras-cargar-${i + 1}`);
}

const final = trasCadaUno[trasCadaUno.length - 1];
console.log(`\n  cola final: ${final.player.cola} entradas · índice ${final.player.indice}`);
console.log(`  primeras 5 de la cola: ${final.player.cabeza.map((c) => `"${c.titulo}"`).join(" | ")}`);
console.log(`  desde el índice ${final.player.indice}: ${final.player.desdeIndice.map((c) => `"${c.titulo}"`).join(" | ")}`);

qa.add({
  control: "BUG 5 (a) · Cargar 3 archivos por el input del Studio acumula la cola",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: final.player.cola > inicio.player.cola ? "FAIL" : "OK",
  evidence:
    `cola ${inicio.player.cola} → ${trasCadaUno.map((t) => t.player.cola).join(" → ")} tras cargar ${ARCHIVOS.length} archivos (${ARCHIVOS.map((a) => a.split("/").pop()).join(", ")}); ` +
    `el índice se queda en **${final.player.indice}** en las ${trasCadaUno.length} cargas y la barra muestra "${final.bar.title}", así que la canción cargada entra en la ranura 0 ` +
    `y las anteriores quedan empujadas hacia atrás. Primeras 5 de la cola: ${final.player.cabeza.map((c) => `"${c.titulo}"`).join(" | ")}`,
  shot: `${OUT}/cola-01-tras-cargar-1.png · ${OUT}/cola-02-tras-cargar-2.png · ${OUT}/cola-03-tras-cargar-3.png`,
  extra: { inicio, trasCadaUno },
});

/* ══════════════════════════════════════════════════════════════════════════
   LA PREGUNTA: ¿qué hace "Canción siguiente" con 3 archivos recién cargados?
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n################ ¿QUÉ HACE "CANCIÓN SIGUIENTE"? ################');
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(2000);

const antesSig = { bar: await bar(), player: await player(), studio: await studio() };
console.log(`  antes: barra="${antesSig.bar.title}" índice=${antesSig.player.indice} cola=${antesSig.player.cola} botón central="${antesSig.bar.centralLabel}"`);
await qa.shot("cola-04-antes-de-siguiente");

await page.locator('.pm-bar button[aria-label="Canción siguiente"]').click();
await page.waitForTimeout(9000);

const despSig = { bar: await bar(), player: await player(), studio: await studio() };
const rmsSig = await qa.rms(10, 140);
await qa.shot("cola-05-despues-de-siguiente");
console.log(
  `  después: barra="${despSig.bar.title}" índice=${despSig.player.indice} (antes ${antesSig.player.indice}) · ` +
    `topbar="${despSig.studio.topbar}" · botón="${despSig.studio.boton}" · RMS ${rmsSig === -Infinity ? "-inf" : rmsSig.toFixed(1)} dB`,
);
console.log(`  desde el índice nuevo: ${despSig.player.desdeIndice.map((c) => `"${c.titulo}"`).join(" | ")}`);

const cambio = despSig.player.indice !== antesSig.player.indice;
const cambioTrack = despSig.player.trackId !== antesSig.player.trackId;
const esVieja = !ARCHIVOS.some((a) => despSig.bar.title === a.split("/").pop().replace(/\.[^.]+$/, ""));
const suena = rmsSig > -70;

let veredicto;
if (!cambio && !cambioTrack) veredicto = "c) NO HACE NADA: el índice y la canción quedan iguales";
else if (esVieja && suena) veredicto = "a) REPRODUCE UNA CANCIÓN VIEJA DE LA COLA (que el usuario no pidió): bug real";
else if (esVieja) veredicto = "a') PASA A UNA CANCIÓN VIEJA pero sin audio audible en la ventana medida";
else veredicto = "b) avanza a otra canción, predecible";
console.log(`  VEREDICTO: ${veredicto}`);

qa.add({
  control: 'BUG 5 (b) · ¿Qué hace "Canción siguiente" después de cargar 3 archivos por el Studio?',
  selector: '.pm-bar button[aria-label="Canción siguiente"]',
  result: !cambio && !cambioTrack ? "FAIL" : esVieja && suena ? "FAIL" : "OK",
  evidence:
    `antes: "${antesSig.bar.title}" en el índice **${antesSig.player.indice}** de una cola de ${antesSig.player.cola} (botón central "${antesSig.bar.centralLabel}"); ` +
    `después de pulsar "siguiente": "${despSig.bar.title}" en el índice **${despSig.player.indice}**, topbar del Studio "${despSig.studio.topbar}", botón central "${despSig.studio.boton}", RMS ${rmsSig === -Infinity ? "-inf" : rmsSig.toFixed(1)} dB. ` +
    `¿Cambió el índice? ${cambio} · ¿cambió la canción? ${cambioTrack} · ¿la que quedó NO es ninguna de las 3 recién cargadas? ${esVieja}. ` +
    `Ranura que sigue en la cola: ${despSig.player.desdeIndice.map((c) => `"${c.titulo}"`).join(" | ")}. VEREDICTO: ${veredicto}`,
  shot: `${OUT}/cola-04-antes-de-siguiente.png · ${OUT}/cola-05-despues-de-siguiente.png`,
  extra: { antesSig, despSig, rmsSig, cambio, cambioTrack, esVieja, veredicto },
});

// ── Segundo "siguiente", para ver si sigue avanzando por canciones viejas ───
await page.locator('.pm-bar button[aria-label="Canción siguiente"]').click();
await page.waitForTimeout(9000);
const despSig2 = { bar: await bar(), player: await player(), studio: await studio() };
const rmsSig2 = await qa.rms(10, 140);
await qa.shot("cola-06-segundo-siguiente");
console.log(`  2.º siguiente: barra="${despSig2.bar.title}" índice=${despSig2.player.indice} RMS ${rmsSig2 === -Infinity ? "-inf" : rmsSig2.toFixed(1)} dB`);
qa.add({
  control: 'BUG 5 (c) · Segundo "Canción siguiente": ¿sigue avanzando?',
  selector: '.pm-bar button[aria-label="Canción siguiente"]',
  result: despSig2.player.indice !== despSig.player.indice ? "OK" : "FAIL",
  evidence:
    `índice ${despSig.player.indice} → **${despSig2.player.indice}**; barra "${despSig.bar.title}" → "${despSig2.bar.title}"; ` +
    `RMS ${rmsSig2 === -Infinity ? "-inf" : rmsSig2.toFixed(1)} dB; topbar del Studio "${despSig2.studio.topbar}"`,
  shot: `${OUT}/cola-06-segundo-siguiente.png`,
  extra: { despSig2, rmsSig2 },
});

// ── ¿Y el chip "Juego" / "Studio" apuntan a la canción correcta? ────────────
const chipStudio = await page.locator('.pm-bar button[title="Practicar esta canción en el Studio"]').isDisabled();
qa.add({
  control: "BUG 5 (d) · Estado de la barra después de navegar la cola acumulada",
  selector: ".pm-bar",
  result: chipStudio ? "FAIL" : "OK",
  evidence:
    `con "${despSig2.bar.title}" en la barra (índice ${despSig2.player.indice}), el chip Studio está deshabilitado=${chipStudio}; ` +
    `seeker max de la barra=${despSig2.bar.seekerMax?.toFixed(0)}s y el del Studio=${despSig2.studio.reloj}`,
  shot: `${OUT}/cola-06-segundo-siguiente.png`,
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.save("results-cola");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-cola.json`);
await qa.close();
