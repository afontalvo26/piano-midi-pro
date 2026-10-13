// =============================================================================
//  measure-player.mjs — medición del reproductor independiente (puerto 1235)
// =============================================================================
//
//  Mide la SALIDA REAL de audio y el costo de React, no lo que la UI dice:
//
//    1. ARRANQUE: RMS sobre el nodo de destino (tap con un AnalyserNode enganchado
//       a `AudioNode.prototype.connect`), y cuánto tarda en oírse.
//    2. REGLA DEL RELOJ: cuántas veces el motor PUBLICA estado nuevo a React
//       durante 5 s de reproducción. La regla del proyecto es que la posición NO
//       se publica por frame (eso fue lo que en el piano causó 265 long tasks en
//       30 s y notas 162 ms tarde). En este reproductor el reloj escribe un `ref` y
//       la barra lee con su propio rAF, así que lo esperado es CERO publicaciones
//       por frame; se mide la identidad del snapshot cada 16 ms.
//    3. CAMBIO DE CANCIÓN: tiene que quedar CERO voz colgada y la salida tiene que
//       llegar a silencio digital. Es el bug histórico de "los samples de 7-84 s
//       siguen sonando encima de la canción siguiente": el hueco se mide, no se
//       supone (ver scripts/qa-player-paridad.mjs para el detalle del método).
//    4. DETENER: la salida tiene que volver a < -70 dB y no quedar voces vivas.
//    5. Errores reales de la app en consola. Los 404 de bancos de samples y los
//       `blob:` del MediaSession se cuentan aparte: también los produce el piano
//       (verificado en scripts/qa-player-consola.mjs).
//
//  USO
//  ---
//    node scripts/measure-player.mjs ["Título de la tarjeta B"]
//
//  La canción se elige por el TÍTULO que muestra la tarjeta de la pantalla Música
//  (no por nombre de archivo: el reproductor reproduce por la UI real, y la barra
//  muestra el título curado del catálogo).
//
//  Requiere el dev server del reproductor levantado en el puerto 1235.
// =============================================================================

import { chromium } from "playwright";

const BASE = "http://localhost:1235/";
const SONG_A = "El Osito Dormilón";
const SONG_B = process.argv[2] ?? "Bésame Mucho";

const SILENCE_DB = -70;
const SIGNAL_DB = -30;

/** Tap de RMS/pico sobre el destino de audio. */
const TAP = `
(() => {
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
  window.__PEAK = () => {
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(buf);
    let p = 0;
    for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
    return p > 0 ? 20 * Math.log10(p) : -Infinity;
  };
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);

/** Errores REALES de la app (los de recursos externos se cuentan aparte). */
const appErrors = [];
const external = new Set();
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  if (/Failed to load resource/.test(text)) {
    external.add(`${text.slice(0, 60)} ← ${message.location()?.url?.slice(0, 80) ?? "-"}`);
    return;
  }
  appErrors.push(text);
});
page.on("pageerror", (error) => appErrors.push(`[pageerror] ${String(error)}`));
// El reproductor IMPORTA módulos de `app/src`: si otro proceso los edita mientras
// esta medición corre, Vite recarga la pestaña por HMR y Playwright corta con
// "Execution context was destroyed". Se registra como tal para no confundirlo con
// un fallo del reproductor.
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    appErrors.push(`navegación de la pestaña a ${frame.url().slice(0, 60)} (¿HMR?)`);
  }
});
page.on("crash", () => appErrors.push("page crash: el renderer se cerró"));

await page.addInitScript(TAP);

const db = (value) =>
  value === null ? "sin tap" : Number.isFinite(value) ? `${value.toFixed(1)} dB` : "-inf dB";

async function sampleRms(ms) {
  return page.evaluate(async (duration) => {
    const out = { max: -Infinity, average: -Infinity, silent: true, n: 0 };
    let sum = 0;
    const end = performance.now() + duration;
    while (performance.now() < end) {
      const value = window.__RMS ? window.__RMS() : null;
      if (value !== null) {
        out.n += 1;
        if (Number.isFinite(value)) {
          if (value > out.max) out.max = value;
          sum += value;
        }
        if (!Number.isFinite(value) || value < -70) out.silent = out.silent && true;
        else out.silent = false;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    out.average = out.n > 0 && Number.isFinite(out.max) ? sum / out.n : -Infinity;
    return out;
  }, ms);
}

async function waitForSound(threshold = -50, timeoutMs = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await page.evaluate(() => (window.__RMS ? window.__RMS() : null));
    if (value !== null && value > threshold) return Date.now() - started;
    await page.waitForTimeout(250);
  }
  return null;
}

const voices = () => page.evaluate(() => window.__PLAYER__.soundingVoices());
const position = () => page.evaluate(() => window.__PLAYER__.position());

/** Reproduce una demo por la UI real: pestaña Música → tarjeta. */
async function playByTitle(title) {
  await page.locator('.rail-item[title="Música — tu reproductor"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".pm-card").length > 0, null, {
    timeout: 120000,
  });
  await page.waitForFunction(
    () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1500);
  await page
    .locator(`.pm-card__info:has-text("${title}")`)
    .first()
    .click();
  await page.waitForFunction(
    (t) => (document.querySelector(".pm-bar__title")?.textContent || "").includes(t),
    title,
    { timeout: 60000 },
  );
}

console.log("\n=== REPRODUCTOR INDEPENDIENTE (1235) ===");
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 30000 });

const titleA = SONG_A;
console.log(`\n--- A · "${titleA}" (por la tarjeta de Música) ---`);
await playByTitle(titleA);
const firstSoundMs = await waitForSound(-50);
const rmsA = await sampleRms(4000);
console.log(`  primer sonido audible : ${firstSoundMs === null ? ">40 s" : `${firstSoundMs} ms`}`);
console.log(`  RMS                   : pico ${db(rmsA.max)} · promedio ${db(rmsA.average)} · ${rmsA.max > SIGNAL_DB ? "SUENA" : "NO SUPERA -30 dB"}`);
console.log(`  posición              : ${(await position()).toFixed(2)} s`);

// ── Regla del reloj: publicaciones de estado durante 5 s de reproducción ─────
const clock = await page.evaluate(async () => {
  const host = window.__PLAYER__.host;
  let publications = 0;
  let last = host.getSnapshot();
  const startedAt = performance.now();
  const sampler = setInterval(() => {
    const current = host.getSnapshot();
    if (current !== last) {
      publications += 1;
      last = current;
    }
  }, 16);
  await new Promise((r) => setTimeout(r, 5000));
  clearInterval(sampler);
  return {
    publications,
    seconds: (performance.now() - startedAt) / 1000,
    frames: Math.round((performance.now() - startedAt) / 16.7),
  };
});
console.log(
  `  publicaciones a React  : ${clock.publications} en ${clock.seconds.toFixed(1)} s (${clock.frames} frames muestreados) → ${clock.publications === 0 ? "CERO: el reloj no publica por frame" : "revisar: el reloj está publicando"}`,
);

// ── Cambio de canción en caliente ───────────────────────────────────────────
console.log(`\n--- B · cambio de canción a "${SONG_B}" ---`);
const beforeSwitch = await sampleRms(1500);
const titleB = SONG_B;
await page.locator(`.pm-card__info:has-text("${titleB}")`).first().click();
const switchTrace = await page.evaluate(async () => {
  const series = [];
  const end = performance.now() + 6000;
  while (performance.now() < end) {
    series.push({
      db: window.__RMS ? window.__RMS() : null,
      voices: Object.values(window.__PLAYER__.soundingVoices()).reduce(
        (n, v) => n + v.length,
        0,
      ),
    });
    await new Promise((r) => setTimeout(r, 100));
  }
  const finite = series.map((s) => s.db).filter((v) => Number.isFinite(v));
  return {
    min: finite.length ? Math.min(...finite) : -Infinity,
    max: finite.length ? Math.max(...finite) : -Infinity,
    // "Silencio" es < -70 dB, no "sin señal": un valor finito de -222 dB es
    // silencio digital a todos los efectos, y contarlo como "hay audio" mentiría.
    quietSamples: series.filter((s) => !Number.isFinite(s.db) || s.db < -70).length,
    total: series.length,
  };
});
console.log(`  RMS antes del cambio  : pico ${db(beforeSwitch.max)}`);
console.log(
  `  hueco tras el cambio  : mínimo ${db(switchTrace.min)} en 6 s · ${switchTrace.quietSamples}/${switchTrace.total} muestras por debajo de -70 dB → ${switchTrace.min < SILENCE_DB ? "la anterior se cortó" : "QUEDA AUDIO DE LA ANTERIOR"}`,
);
console.log(`  canción nueva         : pico ${db(switchTrace.max)} → ${switchTrace.max > SIGNAL_DB ? "entra y suena" : "no supera -30 dB"}`);
console.log(`  voces colgadas        : ${JSON.stringify(await voices())}`);

// ── Detener ─────────────────────────────────────────────────────────────────
//
// OJO CON LA VENTANA: al detener, la cola del reverb (envío con 1,5 s de decaimiento)
// y el release de los samples siguen sonando un instante. Medir "el máximo desde el
// primer milisegundo" da un falso "QUEDA AUDIO". Se reporta la CAÍDA y se exige el
// silencio una vez que la cola terminó.
console.log("\n--- Detener ---");
await page.evaluate(() => window.__PLAYER__.host.seek(20));
await page.waitForTimeout(2000);
const beforeStop = await sampleRms(1500);
await page.evaluate(() => window.__PLAYER__.host.stop());
const stopDecay = await page.evaluate(async () => {
  const series = [];
  const end = performance.now() + 4000;
  while (performance.now() < end) {
    series.push({ at: performance.now(), db: window.__RMS ? window.__RMS() : null });
    await new Promise((r) => setTimeout(r, 100));
  }
  const at = (ms) =>
    series.find((s) => s.at - series[0].at >= ms)?.db ?? null;
  const sustained = series.filter((s) => s.at - series[0].at >= 2000);
  return {
    atStart: at(0),
    atOneSec: at(1000),
    atThreeSec: at(3000),
    quietSamples: series.filter((s) => !Number.isFinite(s.db) || s.db < -70).length,
    total: series.length,
    sustainedSilent: sustained.every((s) => !Number.isFinite(s.db) || s.db < -70),
  };
});
const voicesAfterStop = await voices();
console.log(`  RMS antes de detener  : ${db(beforeStop.max)}`);
console.log(
  `  caída                 : ${db(stopDecay.atStart)} al instante → ${db(stopDecay.atOneSec)} a 1 s (cola del reverb) → ${db(stopDecay.atThreeSec)} a 3 s`,
);
console.log(
  `  sostenido tras 2 s    : ${stopDecay.sustainedSilent ? "SILENCIO" : "QUEDA AUDIO"} (${stopDecay.quietSamples}/${stopDecay.total} muestras < -70 dB)`,
);
console.log(`  posición              : ${(await position()).toFixed(2)} s`);
console.log(
  `  voces colgadas        : ${JSON.stringify(voicesAfterStop)} → ${Object.values(voicesAfterStop).every((v) => v.length === 0) ? "ninguna" : "HAY NOTAS COLGADAS"}`,
);

// ── Errores ─────────────────────────────────────────────────────────────────
console.log("\n--- Errores ---");
const ownErrors = appErrors.filter((e) => !e.startsWith("navegación de la pestaña"));
const hmrReloads = appErrors.length - ownErrors.length;
console.log(`  propios del reproductor : ${ownErrors.length}`);
for (const error of ownErrors.slice(0, 8)) console.log(`    ${error}`);
console.log(`  recargas por HMR (otro proceso editando app/src): ${hmrReloads}`);
console.log(`  recursos externos (el piano produce los mismos): ${external.size}`);
for (const item of [...external].slice(0, 8)) console.log(`    ${item}`);

const verdict =
  rmsA.max > SIGNAL_DB &&
  clock.publications === 0 &&
  switchTrace.min < SILENCE_DB &&
  stopDecay.sustainedSilent &&
  Object.values(voicesAfterStop).every((v) => v.length === 0) &&
  ownErrors.length === 0;

console.log(`\n=== VEREDICTO: ${verdict ? "TODO OK" : "REVISAR (ver arriba)"} ===\n`);
await browser.close();
process.exit(verdict ? 0 : 2);
