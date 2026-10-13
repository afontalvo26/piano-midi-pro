// ============================================================
// qa-player-arranque.mjs — desglose del arranque en frío del reproductor (1235).
//
// QUÉ RESPONDE: los 7,3-8,4 s que tardaba en oírse algo, ¿en qué se van? El host ya
// publica sus marcas (`__PLAYER__.startTimings()`): pedido → motorListo →
// pianoNucleoListo → samplesListos → transporteArrancado → primeraNota.
//
// A esas marcas se suman dos datos que hacen falta para no mentir con el número:
//   · `skippedNotes`: cuántas notas se SALTEARON por no tener sample todavía. Si el
//     transporte arrancó a los 0,4 s pero hay 200 notas salteadas, el silencio NO
//     es "el motor tarda": es la regla de "cero sintetizadores" cobrándose las
//     primeras notas, y eso hay que decirlo así.
//   · el primer sonido AUDIBLE, medido con el tap de RMS (debe coincidir con
//     `primeraNota`, que es el primer disparo real).
//
// Se corre con la caché HTTP FRÍA (contexto nuevo) y CALIENTE (misma pestaña,
// segunda canción), porque son dos problemas distintos.
//
// Uso: node scripts/qa-player-arranque.mjs
// ============================================================
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:1235/";
const OUT = ".logs/qa/player-vs-piano";
mkdirSync(OUT, { recursive: true });

const TAP = `
(() => {
  if (window.__RMS) return;
  let analyser = null, buf = null;
  const ensure = (ctx) => {
    if (analyser) return analyser;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    return analyser;
  };
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target && target.constructor && target.constructor.name === "AudioDestinationNode") {
      try { orig.call(this, ensure(this.context)); } catch {}
    }
    return orig.call(this, target, ...rest);
  };
  window.__RMS = () => {
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  };
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
await page.addInitScript(TAP);

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 30000 });
await page.waitForFunction(
  () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
  null,
  { timeout: 150000 },
);
await page.waitForTimeout(1500);
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(700);

/**
 * Mide un arranque: t0 = el click en la tarjeta, y sondea hasta oír algo.
 * Devuelve las marcas del host + el primer sonido audible + las notas salteadas.
 */
async function measure(label, shelf, title) {
  console.log(`\n--- ${label} ---`);
  const t0 = Date.now();
  await page
    .locator(".pm-shelf")
    .filter({ hasText: shelf })
    .locator(".pm-card__info")
    .filter({ hasText: title })
    .first()
    .click();

  // Sondeo cada 100 ms: primer sonido audible + notas salteadas en ese momento.
  let firstSoundAt = null;
  let skippedAtFirstSound = null;
  let maxDb = -Infinity;
  while (Date.now() - t0 < 30000) {
    const s = await page.evaluate(() => ({
      db: window.__RMS ? window.__RMS() : null,
      skipped: window.__PLAYER__ ? window.__PLAYER__.skippedNotes() : 0,
      timings: window.__PLAYER__ ? window.__PLAYER__.startTimings() : {},
    }));
    if (s.db !== null && s.db > maxDb) maxDb = s.db;
    if (firstSoundAt === null && s.db !== null && s.db > -70) {
      firstSoundAt = Date.now() - t0;
      skippedAtFirstSound = s.skipped;
      break;
    }
    if (s.timings.primeraNota && Date.now() - t0 > s.timings.primeraNota + 500) break;
    await page.waitForTimeout(100);
  }
  const final = await page.evaluate(() => {
    const song = window.__PLAYER__.host.currentSong;
    const times = [
      ...(song?.notes ?? []).map((n) => n.time),
      ...(song?.percussion ?? []).map((n) => n.time),
    ];
    return {
      timings: window.__PLAYER__.startTimings(),
      skipped: window.__PLAYER__.skippedNotes(),
      status: (document.querySelector(".status-pill")?.textContent || "").trim(),
      song: window.__PLAYER__.loadedSongId(),
      // El silencio PROPIO del archivo: la primera nota leída del parser, que es
      // el mismo dato con el que el QA del piano separa "el motor tarda" de "la
      // canción arranca en silencio" (docs/qa-reproductor.md §2, BUG 4).
      firstNoteSec: times.length ? Math.min(...times) : null,
      firstMelodicSec: song?.notes?.length
        ? Math.min(...song.notes.map((n) => n.time))
        : null,
      noteCount: song?.notes?.length ?? 0,
      percussionCount: song?.percussion?.length ?? 0,
      samplesProgress: window.__PLAYER__.host.getSnapshot().samplesProgress,
    };
  });
  const t = final.timings;
  const step = (name, value) =>
    console.log(`    ${name.padEnd(24)} ${value === undefined ? "—" : `${value} ms`}`);
  step("pedido (play)", t.pedido);
  step("motor listo", t.motorListo);
  step("piano (núcleo) listo", t.pianoNucleoListo);
  step("samples de la canción", t.samplesListos);
  step("transporte arrancado", t.transporteArrancado);
  step("primera nota disparada", t.primeraNota);
  console.log(`    ${"primer SONIDO audible".padEnd(24)} ${firstSoundAt === null ? ">30 s" : `${firstSoundAt} ms`} (pico ${maxDb === -Infinity ? "sin señal" : maxDb.toFixed(1) + " dB"})`);
  console.log(`    notas salteadas al primer sonido: ${skippedAtFirstSound ?? "—"} · al final: ${final.skipped}`);
  console.log(`    canción: ${final.song} · píldora: "${final.status.slice(0, 60)}"`);
  console.log(
    `    SILENCIO PROPIO DEL ARCHIVO: primera nota del parser en ${final.firstNoteSec === null ? "—" : `${final.firstNoteSec.toFixed(2)} s`} (melódica en ${final.firstMelodicSec === null ? "—" : `${final.firstMelodicSec.toFixed(2)} s`}) · ${final.noteCount} melódicas + ${final.percussionCount} de percusión · samples ${final.samplesProgress.done}/${final.samplesProgress.total}`,
  );
  if (firstSoundAt !== null && final.firstNoteSec !== null && t.transporteArrancado !== undefined) {
    const floor = t.transporteArrancado + final.firstNoteSec * 1000;
    console.log(
      `    PISO TEÓRICO (transporte + silencio propio): ${Math.round(floor)} ms · margen real: ${Math.round(firstSoundAt - floor)} ms`,
    );
  }
  return {
    t,
    firstSoundAt,
    skippedAtFirstSound,
    skippedFinal: final.skipped,
    maxDb,
    firstNoteSec: final.firstNoteSec,
    firstMelodicSec: final.firstMelodicSec,
  };
}

/** Igual que `measure`, pero desde el botón central (motor ya caliente). */
async function measureWarm(label) {
  console.log(`\n--- ${label} ---`);
  const t0 = Date.now();
  await page.locator('.pm-bar__transport button[aria-label="Reproducir"]').click();
  let firstSoundAt = null;
  let maxDb = -Infinity;
  while (Date.now() - t0 < 20000) {
    const db = await page.evaluate(() => (window.__RMS ? window.__RMS() : null));
    if (db !== null && db > maxDb) maxDb = db;
    if (db !== null && db > -70) {
      firstSoundAt = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(100);
  }
  const t = await page.evaluate(() => window.__PLAYER__.startTimings());
  console.log(`    marcas: ${JSON.stringify(t)}`);
  console.log(`    primer sonido audible: ${firstSoundAt === null ? ">20 s" : `${firstSoundAt} ms`} (pico ${maxDb.toFixed(1)} dB)`);
  return { t, firstSoundAt };
}

console.log("\n=== Arranque en frío del reproductor (1235) ===");
const cold = await measure("1 · COLD: primer arranque de la sesión (caché fría)", "Vallenato", "El Osito Dormilón");

// Pausa para no medir dos veces lo mismo.
await page.locator('.pm-bar__transport button[aria-label="Pausar"]').click().catch(() => {});
await page.waitForTimeout(1200);

const warm = await measure("2 · CALIENTE: otra canción de otra estantería", "Boleros", "Bésame Mucho");
await page.locator('.pm-bar__transport button[aria-label="Pausar"]').click().catch(() => {});
await page.waitForTimeout(1500);

const viaButton = await measureWarm("3 · reanudar con el botón central (motor y samples ya listos)");

console.log("\n=== RESUMEN ===");
console.log(`  frío:      motor ${cold.t.motorListo ?? "?"} ms · piano ${cold.t.pianoNucleoListo ?? "?"} ms · samples ${cold.t.samplesListos ?? "—"} ms · transporte ${cold.t.transporteArrancado ?? "?"} ms · 1ª nota ${cold.t.primeraNota ?? "?"} ms · 1er sonido ${cold.firstSoundAt ?? "?"} ms · salteadas ${cold.skippedAtFirstSound ?? "?"}`);
console.log(`  caliente: transporte ${warm.t.transporteArrancado ?? "?"} ms · 1ª nota ${warm.t.primeraNota ?? "?"} ms · 1er sonido ${warm.firstSoundAt ?? "?"} ms · salteadas ${warm.skippedAtFirstSound ?? "?"}`);
console.log(`  botón:    1er sonido ${viaButton.firstSoundAt ?? "?"} ms`);
console.log(`\n  OJO: "1ª nota" es el primer disparo REAL. Si hay notas salteadas, el`);
console.log(`  silencio previo es la regla de cero sintetizadores, no lentitud del motor.`);

await page.screenshot({ path: `${OUT}/arranque-desglose.png` });
await browser.close();
