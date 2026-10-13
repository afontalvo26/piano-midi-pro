// =============================================================================
//  qa-ab-piano-vs-player.mjs — ¿por qué el reproductor (1235) suena distinto
//  del piano (1234) con la MISMA canción?
// =============================================================================
//
//  El pedal del diagnóstico: `a0d03de` tocó dos cosas (CC7/CC11 y la curva γ) y
//  el reproductor no aplicaba NINGUNA de las dos (`scheduler.ts` dispara sin el
//  4º argumento de amplitud), así que en el 1235 ese commit fue inaudible. Si el
//  dueño escucha distinto en el reproductor, la diferencia es ESTRUCTURAL entre
//  las dos apps. Este script la busca con números, no leyendo código:
//
//    1. QUÉ FUENTE resuelve cada instrumento en cada app (los logs `[fuentes]`
//       "X" → origen, más los del kit de percusión y el sampler de piano).
//    2. NIVEL: curva de RMS del bus maestro por tramos de 2 s de canción, con la
//       misma canción y el mismo instante en las dos apps.
//    3. BALANCE POR PISTA: RMS del maestro con UNA pista sola (solo) en cada
//       app, a la misma posición. Es lo que dice si el balance está movido.
//    4. Notas SALTEADAS por falta de sample (`skippedNotes` del reproductor) y
//       voces vivas: distingue "suena distinto" de "le faltan instrumentos".
//
//  USO:  node scripts/qa-ab-piano-vs-player.mjs [archivo.kar]
//  Salida: .logs/qa-ab/results.json
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const FILE = path.resolve(
  process.cwd(),
  process.argv[2] ?? "app/public/demo/Bolero_-_Besame_Mucho.kar",
);
const FILE_NAME = path.basename(FILE);
/** Título de la tarjeta de Música del reproductor para ese archivo. */
const TITLE = process.argv[3] ?? "Bésame Mucho";
const OUT = ".logs/qa-ab";
const PIANO = "http://localhost:1234/";
const PLAYER = "http://localhost:1235/";

mkdirSync(OUT, { recursive: true });

/** Tap de RMS/pico sobre el destino de audio (mismo método que measure-mix). */
const TAP = `
(() => {
  let analyser = null, buf = null;
  window.__TAP_INFO = { connects: 0 };
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
      try { orig.call(this, ensure(this.context)); window.__TAP_INFO.connects++; } catch {}
    }
    return orig.call(this, target, ...rest);
  };
  window.__RMS = () => {
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(buf);
    let s = 0, peak = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
    const rms = Math.sqrt(s / buf.length);
    return { db: rms > 0 ? 20 * Math.log10(rms) : -Infinity, peak };
  };
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});

/** Abre una app, carga la canción y devuelve el handle de medición. */
async function openApp(name, url, loadSong) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const logs = [];
  const errors = [];
  page.on("console", (m) => {
    const text = m.text();
    logs.push(text);
    if (m.type() === "error" && !/Failed to load resource/.test(text)) errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${String(e)}`));
  await page.addInitScript(TAP);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pm-bar", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await loadSong(page);
  // Espera a que el log de fuentes se estabilice (precarga de samples).
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await page.waitForTimeout(1000);
    const count = logs.filter((l) => /^\[fuentes\]|^\[DrumKit\]|^\[piano\]/.test(l)).length;
    stable = count === last ? stable + 1 : 0;
    last = count;
  }
  return { name, context, page, logs, errors };
}

/** Mide el RMS del maestro durante `ms`, devolviendo pico y promedio. */
async function sampleRms(page, ms, stepMs = 100) {
  return page.evaluate(
    async ([duration, step]) => {
      const series = [];
      const end = performance.now() + duration;
      while (performance.now() < end) {
        const value = window.__RMS ? window.__RMS() : null;
        if (value) series.push(value);
        await new Promise((r) => setTimeout(r, step));
      }
      const finite = series.map((s) => s.db).filter(Number.isFinite);
      const mean = finite.length
        ? 10 * Math.log10(finite.reduce((a, d) => a + Math.pow(10, d / 10), 0) / finite.length)
        : -Infinity;
      return {
        n: series.length,
        max: finite.length ? Math.max(...finite) : -Infinity,
        mean,
        peak: series.length ? Math.max(...series.map((s) => s.peak)) : 0,
      };
    },
    [ms, stepMs],
  );
}

/** Un tramo: posiciona en `at`, reproduce `ms` y mide. */
async function measureAt(app, at, ms) {
  if (app.name === "piano") {
    await app.page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
    await app.page.waitForTimeout(200);
    await app.page.locator('.seeker-container input[type="range"]').fill(String(at));
    await app.page.waitForTimeout(250);
    await app.page.locator(".playback-bar .btn.primary").first().click();
    await app.page.waitForTimeout(400);
    const rms = await sampleRms(app.page, ms);
    await app.page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
    await app.page.waitForTimeout(200);
    return rms;
  }
  // Reproductor: se pausa, se reposiciona, se deja decaer la cola del reverb y
  // se reanuda con el botón sólido de la barra (su aria-label dice Pausar /
  // Reproducir según el estado).
  const solid = app.page.locator(".pm-bar__transport .pm-tbtn--solid").first();
  const label = await solid.getAttribute("aria-label").catch(() => null);
  if (label === "Pausar") {
    await solid.click();
    await app.page.waitForTimeout(200);
  }
  await app.page.evaluate((t) => window.__PLAYER__.host.seek(t), at);
  await app.page.waitForTimeout(1600);
  await solid.click();
  await app.page.waitForTimeout(350);
  const rms = await sampleRms(app.page, ms);
  await solid.click().catch(() => {});
  await app.page.waitForTimeout(200);
  return rms;
}

const round = (value) => (Number.isFinite(value) ? Number(value.toFixed(2)) : -Infinity);

// ── Abrir las dos apps ──────────────────────────────────────────────────────

console.log(`cancion: ${FILE_NAME}\n`);

const piano = await openApp("piano", PIANO, async (page) => {
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FILE);
  await page.waitForFunction(
    () => Number(document.querySelector('.seeker-container input[type=range]')?.max ?? 0) > 0,
    { timeout: 40000 },
  );
  await page.waitForTimeout(1000);
  // El motor (y con él la precarga de samples) arranca con el PRIMER play: hay
  // que dispararlo antes de esperar a que se estabilicen los logs de fuentes.
  await page.locator(".playback-bar .btn.primary").first().click();
  for (let i = 0; i < 60; i++) {
    const value = await page.evaluate(() => (window.__RMS ? window.__RMS() : null));
    if (value && value.db > -50) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);
  await page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
  await page.waitForTimeout(300);
});

const player = await openApp("player", PLAYER, async (page) => {
  await page.waitForFunction(() => !!window.__PLAYER__, { timeout: 90000 });
  // EL CAMINO DEL DUEÑO: pestaña Música → tarjeta de la canción. Es lo que hace
  // a mano, así que es lo que hay que medir (no un atajo por query string).
  await page.locator('.rail-item[title="Música — tu reproductor"]').first().click();
  await page.waitForFunction(() => document.querySelectorAll(".pm-card").length > 0, null, {
    timeout: 150000,
  });
  await page.waitForFunction(
    () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
    null,
    { timeout: 150000 },
  );
  await page.waitForTimeout(1500);
  await page.locator(`.pm-card__info:has-text("${TITLE}")`).first().click();
  await page.waitForFunction(
    (t) => (document.querySelector(".pm-bar__title")?.textContent || "").includes(t),
    TITLE,
    { timeout: 90000 },
  );
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__PLAYER__.host.stop());
  await page.waitForTimeout(500);
});

const results = { file: FILE_NAME, piano: {}, player: {} };

// ── 1. Qué fuente resolvió cada instrumento ────────────────────────────────

/** Resumen de los logs de fuentes: instrumento → origen. */
function fuenteSummary(logs) {
  const resolved = new Map();
  const pans = [];
  const drums = [];
  for (const line of logs) {
    const m = /^\[fuentes\] "(.+)" → (.+)$/.exec(line);
    if (m) resolved.set(m[1], m[2]);
    if (line.startsWith('[fuentes] "') && line.includes("paneo")) pans.push(line);
    if (line.startsWith("[DrumKit]")) drums.push(line);
    if (line.startsWith("[piano]")) drums.push(line);
  }
  return {
    resolved: Object.fromEntries([...resolved.entries()].sort()),
    pans,
    drums: drums.slice(0, 20),
    noSource: logs.filter((l) => /no tiene ninguna fuente real|ninguna fuente real respondió/.test(l)),
  };
}

results.piano.sources = fuenteSummary(piano.logs);
results.player.sources = fuenteSummary(player.logs);

console.log("=== FUENTES POR INSTRUMENTO ===");
const allInstruments = [...new Set([
  ...Object.keys(results.piano.sources.resolved),
  ...Object.keys(results.player.sources.resolved),
])].sort();
for (const instrument of allInstruments) {
  const a = results.piano.sources.resolved[instrument] ?? "(nada)";
  const b = results.player.sources.resolved[instrument] ?? "(nada)";
  console.log(`  ${a === b ? "= " : "≠ "} ${instrument.padEnd(34)} piano: ${a.padEnd(12)} reproductor: ${b}`);
}
console.log(`\n  sin fuente — piano: ${results.piano.sources.noSource.length} · reproductor: ${results.player.sources.noSource.length}`);

// ── 2. Curva de nivel por tramos ───────────────────────────────────────────

const AT = 12; // segundo de canción donde se mide el balance
const WINDOW_MS = 2500;
const CURVE_POSITIONS = [2, 6, 9, 12, 15, 18, 24, 30];

console.log("\n=== NIVEL DEL MAESTRO (misma canción, misma posición) ===");
const curve = [];
for (const at of CURVE_POSITIONS) {
  const a = await measureAt(piano, at, 2000);
  const b = await measureAt(player, at, 2000);
  curve.push({
    at,
    piano: { mean: round(a.mean), max: round(a.max), peak: Number(a.peak.toFixed(3)) },
    player: { mean: round(b.mean), max: round(b.max), peak: Number(b.peak.toFixed(3)) },
    deltaDb: round(b.mean - a.mean),
  });
  console.log(
    `  t=${String(at).padStart(2)} s · piano ${String(round(a.mean)).padStart(7)} dB (pico ${a.peak.toFixed(3)}) · reproductor ${String(round(b.mean)).padStart(7)} dB (pico ${b.peak.toFixed(3)}) · Δ ${round(b.mean - a.mean)} dB`,
  );
}
results.curve = curve;
const finiteDeltas = curve.map((c) => c.deltaDb).filter(Number.isFinite);
results.curveDeltaMean = finiteDeltas.length
  ? round(finiteDeltas.reduce((a, b) => a + b, 0) / finiteDeltas.length)
  : null;
console.log(`  Δ medio (reproductor − piano): ${results.curveDeltaMean} dB`);

// ── 3. Balance por pista (una pista sola) ──────────────────────────────────

/** Pista i sola: en el piano se clickea "Solo"; en el reproductor, `setMix`. */
async function soloTrack(app, index, trackCount) {
  if (app.name === "piano") {
    // Las tarjetas de pista viven en la pantalla "Pistas" (en el Studio no hay
    // ninguna: por eso una versión anterior de esta medición midió 9 veces la
    // mezcla completa creyendo que aislaba una pista).
    await app.page.locator('.rail-item[title="Pistas"]').first().click();
    await app.page.waitForSelector(".track-item-card", { timeout: 20000 });
    const cards = app.page.locator(".track-item-card");
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const button = cards.nth(i).locator("button", { hasText: "Solo" });
      const active = await button
        .evaluate((el) => el.className.includes("active-solo"))
        .catch(() => false);
      const shouldBeActive = i === index;
      if (active !== shouldBeActive) {
        await button.click();
        await app.page.waitForTimeout(120);
      }
    }
    const soloed = await app.page.evaluate(() => localStorage.getItem("piano_track_solo"));
    // Volver al Studio, que es donde viven el seeker y el botón de reproducir.
    await app.page.locator('.rail-item[title="Studio"]').first().click();
    await app.page.waitForTimeout(250);
    return { count, soloed };
  }
  await app.page.evaluate((soloIndex) => {
    const host = window.__PLAYER__.host;
    // `mix` es privado en TypeScript pero es un campo normal en runtime: acá se
    // LEE para conservar volúmenes e instrumentos y sólo se cambia el solo.
    const current = host.mix ?? { muted: {}, solo: {}, volumes: {}, instruments: {} };
    const solo = {};
    if (soloIndex >= 0) solo[soloIndex] = true;
    host.setMix({ ...current, solo });
  }, index);
  await app.page.waitForTimeout(150);
  return { count: trackCount, soloed: null };
}

// Las tarjetas de pista del piano viven en la pantalla Pistas: hay que ir a
// buscarlas para CONTARLAS (en el Studio no existen).
await piano.page.locator('.rail-item[title="Pistas"]').first().click();
await piano.page.waitForSelector(".track-item-card", { timeout: 20000 });
const pianoTrackCount = await piano.page.locator(".track-item-card").count();
const pianoTrackTexts = await piano.page.locator(".track-item-card").allTextContents();
await piano.page.locator('.rail-item[title="Studio"]').first().click();
await piano.page.waitForTimeout(250);

const playerTracks = await player.page.evaluate(
  () => (window.__PLAYER__.host.getSnapshot()?.tracks ?? []).map((t) => ({ name: t.name, instrument: t.instrument, isDrumKit: !!t.isDrumKit })),
);
const playerTrackCount = playerTracks.length;
results.tracks = { piano: pianoTrackTexts, player: playerTracks };
console.log(`\n=== BALANCE POR PISTA (solo una pista, t=${AT} s) ===`);
console.log(`  pistas: piano ${pianoTrackCount} · reproductor ${playerTrackCount}`);
for (const [i, track] of playerTracks.entries()) {
  console.log(`    reproductor p${i}: ${track.name} · ${track.instrument}${track.isDrumKit ? " (percusión)" : ""}`);
}

const perTrack = [];
const trackCount = Math.min(pianoTrackCount, playerTrackCount);
for (let i = 0; i < trackCount; i++) {
  await soloTrack(piano, i, pianoTrackCount);
  const a = await measureAt(piano, AT, WINDOW_MS);
  await soloTrack(player, i, playerTrackCount);
  const b = await measureAt(player, AT, WINDOW_MS);
  perTrack.push({
    track: i,
    instrument: playerTracks[i]?.instrument ?? null,
    piano: { mean: round(a.mean), max: round(a.max), peak: Number(a.peak.toFixed(3)) },
    player: { mean: round(b.mean), max: round(b.max), peak: Number(b.peak.toFixed(3)) },
    deltaDb: round(b.mean - a.mean),
  });
  console.log(
    `  pista ${i} (${playerTracks[i]?.instrument ?? "?"}) · piano ${String(round(a.mean)).padStart(7)} dB · reproductor ${String(round(b.mean)).padStart(7)} dB · Δ ${String(round(b.mean - a.mean)).padStart(6)} dB`,
  );
}
await soloTrack(piano, -1, pianoTrackCount);
await soloTrack(player, -1, playerTrackCount);
results.perTrack = perTrack;

// ── 4. Estado de salud de cada app ─────────────────────────────────────────

results.piano.status = await piano.page
  .locator(".status-pill, .pm-bar__status")
  .first()
  .textContent()
  .catch(() => null);
results.player.state = await player.page.evaluate(() => ({
  skipped: window.__PLAYER__.skippedNotes(),
  voices: window.__PLAYER__.soundingVoices(),
  audio: window.__PLAYER__.audioState(),
  song: window.__PLAYER__.loadedSongId(),
  groove: window.__PLAYER__.grooveAmount(),
  starts: window.__PLAYER__.startTimings(),
}));
results.piano.errors = piano.errors.slice(0, 6);
results.player.errors = player.errors.slice(0, 6);

console.log("\n=== ESTADO ===");
console.log(`  piano · píldora: ${JSON.stringify(results.piano.status)}`);
console.log(`  reproductor · notas salteadas: ${results.player.state.skipped} · voces: ${JSON.stringify(results.player.state.voices)}`);
console.log(`  reproductor · audio: ${JSON.stringify(results.player.state.audio)} · groove: ${results.player.state.groove}`);
console.log(`  errores — piano: ${results.piano.errors.length} · reproductor: ${results.player.errors.length}`);
for (const error of [...results.piano.errors, ...results.player.errors].slice(0, 6)) console.log(`    ${error}`);

const sourceDiffs = allInstruments.filter(
  (name) => (results.piano.sources.resolved[name] ?? "(nada)") !== (results.player.sources.resolved[name] ?? "(nada)"),
);
console.log(`\n=== RESUMEN ===`);
console.log(`  instrumentos con fuente DISTINTA: ${sourceDiffs.length}${sourceDiffs.length ? ` → ${sourceDiffs.join(", ")}` : ""}`);
console.log(`  Δ de nivel medio (reproductor − piano): ${results.curveDeltaMean} dB`);
const worstTrack = perTrack
  .filter((t) => Number.isFinite(t.deltaDb))
  .sort((a, b) => Math.abs(b.deltaDb) - Math.abs(a.deltaDb))[0];
console.log(`  pista con mayor diferencia de balance: ${worstTrack ? `pista ${worstTrack.track} (${worstTrack.deltaDb} dB)` : "sin datos"}`);

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\nresultados: ${OUT}/results.json`);
await browser.close();
