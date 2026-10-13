// =============================================================================
//  qa-ab-repeticion.mjs — ¿la diferencia de nivel piano vs reproductor es REAL
//  o es ruido de la medición?
// =============================================================================
//
//  El A/B (`scripts/qa-ab-piano-vs-player.mjs`) da deltas que NO se repiten
//  entre corridas en la misma posición (−6.0 dB y −1.6 dB a los 12 s). Este
//  script mide la varianza DENTRO de una misma corrida: en la misma posición y
//  alternando app por app, N repeticiones cada una. Si la dispersión dentro de
//  una app es del tamaño del delta entre apps, el delta es ruido (carga de
//  samples, instante exacto) y no una diferencia de mezcla.
//
//  USO: node scripts/qa-ab-repeticion.mjs [repeticiones] [posiciones...]
//  Salida: .logs/qa-ab/repeticion.json
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPEATS = Number(process.argv[2] ?? 3);
const POSITIONS = (process.argv.slice(3).length ? process.argv.slice(3) : ["12", "15"]).map(Number);
const FILE = path.resolve(process.cwd(), "app/public/demo/Bolero_-_Besame_Mucho.kar");
const TITLE = "Bésame Mucho";
const OUT = ".logs/qa-ab";
const WINDOW_MS = 2500;

mkdirSync(OUT, { recursive: true });

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
    let s = 0, peak = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
    const rms = Math.sqrt(s / buf.length);
    return { db: rms > 0 ? 20 * Math.log10(rms) : -Infinity, peak };
  };
})();
`;

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const logs = [];

async function openApp(name, url, load) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("console", (m) => logs.push(`${name}: ${m.text()}`));
  await page.addInitScript(TAP);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pm-bar", { timeout: 30000 });
  await page.waitForTimeout(2000);
  await load(page);
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 45 && stable < 3; i++) {
    await page.waitForTimeout(1000);
    const count = logs.filter((l) => /^\[fuentes\]|^\[DrumKit\]/.test(l.replace(/^\w+: /, ""))).length;
    stable = count === last ? stable + 1 : 0;
    last = count;
  }
  return { name, page };
}

const piano = await openApp("piano", "http://localhost:1234/", async (page) => {
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FILE);
  await page.waitForFunction(
    () => Number(document.querySelector('.seeker-container input[type=range]')?.max ?? 0) > 0,
    { timeout: 40000 },
  );
  await page.waitForTimeout(800);
  await page.locator(".playback-bar .btn.primary").first().click();
  for (let i = 0; i < 60; i++) {
    const value = await page.evaluate(() => (window.__RMS ? window.__RMS() : null));
    if (value && value.db > -50) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2000);
  await page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
  await page.waitForTimeout(300);
});

const player = await openApp("player", "http://localhost:1235/", async (page) => {
  await page.waitForFunction(() => !!window.__PLAYER__, { timeout: 90000 });
  await page.locator('.rail-item[title="Música — tu reproductor"]').first().click();
  await page.waitForFunction(() => document.querySelectorAll(".pm-card").length > 0, null, { timeout: 150000 });
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
  await page.waitForTimeout(400);
});

async function sample(page, ms) {
  return page.evaluate(async (duration) => {
    const series = [];
    const end = performance.now() + duration;
    while (performance.now() < end) {
      const value = window.__RMS ? window.__RMS() : null;
      if (value) series.push(value);
      await new Promise((r) => setTimeout(r, 100));
    }
    const finite = series.map((s) => s.db).filter(Number.isFinite);
    const mean = finite.length
      ? 10 * Math.log10(finite.reduce((a, d) => a + Math.pow(10, d / 10), 0) / finite.length)
      : -Infinity;
    return { mean, peak: series.length ? Math.max(...series.map((s) => s.peak)) : 0 };
  }, ms);
}

async function measureAt(app, at) {
  if (app.name === "piano") {
    await app.page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
    await app.page.waitForTimeout(200);
    await app.page.locator('.seeker-container input[type="range"]').fill(String(at));
    await app.page.waitForTimeout(250);
    await app.page.locator(".playback-bar .btn.primary").first().click();
    await app.page.waitForTimeout(400);
    const rms = await sample(app.page, WINDOW_MS);
    await app.page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
    await app.page.waitForTimeout(200);
    return rms;
  }
  const solid = app.page.locator(".pm-bar__transport .pm-tbtn--solid").first();
  const label = await solid.getAttribute("aria-label").catch(() => null);
  if (label === "Pausar") {
    await solid.click();
    await app.page.waitForTimeout(200);
  }
  await app.page.evaluate((t) => window.__PLAYER__.host.seek(t), at);
  await app.page.waitForTimeout(1600);
  // El click de reanudar puede caer en una ventana en la que el botón todavía
  // dice "Pausar" (carrera del harness, no de la app): si la ventana sale en
  // silencio, se reintenta UNA vez en vez de contar ese 0 como nivel.
  let rms = { mean: -Infinity, peak: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    await solid.click();
    await app.page.waitForTimeout(450);
    rms = await sample(app.page, WINDOW_MS);
    if (Number.isFinite(rms.mean) && rms.mean > -70) break;
    await app.page.waitForTimeout(400);
  }
  await solid.click().catch(() => {});
  await app.page.waitForTimeout(200);
  return rms;
}

const round = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : -Infinity);
const result = { repeats: REPEATS, positions: POSITIONS, perPosition: [] };

for (const at of POSITIONS) {
  const pianoSamples = [];
  const playerSamples = [];
  for (let i = 0; i < REPEATS; i++) {
    pianoSamples.push(await measureAt(piano, at));
    playerSamples.push(await measureAt(player, at));
  }
  const spread = (list) => {
    const values = list.map((s) => s.mean).filter(Number.isFinite);
    return values.length ? Math.max(...values) - Math.min(...values) : null;
  };
  const row = {
    at,
    piano: pianoSamples.map((s) => ({ mean: round(s.mean), peak: Number(s.peak.toFixed(3)) })),
    player: playerSamples.map((s) => ({ mean: round(s.mean), peak: Number(s.peak.toFixed(3)) })),
    pianoSpreadDb: round(spread(pianoSamples)),
    playerSpreadDb: round(spread(playerSamples)),
    deltaMeanDb: round(
      playerSamples.reduce((a, s) => a + s.mean, 0) / playerSamples.length -
        pianoSamples.reduce((a, s) => a + s.mean, 0) / pianoSamples.length,
    ),
    deltaRangeDb: round(
      Math.max(...playerSamples.map((s) => s.mean)) - Math.min(...pianoSamples.map((s) => s.mean)),
    ),
  };
  result.perPosition.push(row);
  console.log(
    `t=${at} s · piano [${row.piano.map((s) => s.mean).join(", ")}] (dispersión ${row.pianoSpreadDb} dB) · reproductor [${row.player.map((s) => s.mean).join(", ")}] (dispersión ${row.playerSpreadDb} dB) · Δ medio ${row.deltaMeanDb} dB`,
  );
}

const spreads = result.perPosition.flatMap((p) => [p.pianoSpreadDb, p.playerSpreadDb]).filter((v) => v !== null);
const deltas = result.perPosition.map((p) => Math.abs(p.deltaMeanDb)).filter(Number.isFinite);
result.withinAppSpreadMaxDb = round(Math.max(...spreads));
result.betweenAppDeltaMeanAbsDb = round(deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1));
console.log(
  `\ndispersión máxima DENTRO de una app: ${result.withinAppSpreadMaxDb} dB · |Δ| medio ENTRE apps: ${result.betweenAppDeltaMeanAbsDb} dB → ${
    result.withinAppSpreadMaxDb >= result.betweenAppDeltaMeanAbsDb
      ? "el Δ no se distingue del ruido de la medición"
      : "el Δ supera el ruido: hay una diferencia real"
  }`,
);

writeFileSync(`${OUT}/repeticion.json`, JSON.stringify(result, null, 2));
console.log(`resultados: ${OUT}/repeticion.json`);
await browser.close();
