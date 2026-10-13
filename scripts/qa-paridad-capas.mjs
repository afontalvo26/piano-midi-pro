// =============================================================================
//  qa-paridad-capas.mjs — ¿el reproductor elige la MISMA toma grabada que el
//  piano para la misma nota?
// =============================================================================
//
//  EL BUG QUE VERIFICA (player/src/audio/scheduler.ts)
//  ───────────────────────────────────────────────────
//  El reproductor hacía `velocity = note.velocity * trackVolume` y ese producto
//  entraba como VELOCITY, o sea como lo que elige la CAPA grabada
//  (`LayeredSampler.layerFor`). Con el volumen de pista por defecto (0.8) las
//  notas del borde de cada umbral caían en una toma más suave: mismo nivel, otro
//  timbre, distinto del piano (que manda la velocity cruda y el volumen como
//  amplitud). Este script compara, nota por nota y con los números que cada app
//  publica, la velocity que llega a la fuente y la capa que se desprende de ella.
//
//  CÓMO SE MIDE
//  ────────────
//  1. Un fixture MIDI de UNA pista con un instrumento de CAPAS (VSCO) y notas
//     repartidas por TODO el rango de velocity (40..125), para cubrir los tres
//     umbrales: 0.42 y 0.74 con 3 capas, 0.62 con 2 (vscoSampler.ts:146-150).
//  2. Se carga EL MISMO archivo en las dos apps: en el piano por el input del
//     Studio, en el reproductor por su importador (`handleImportFile`).
//  3. Se leen los planes agendados reales: `window.__PMP_GROOVE__` (piano) y
//     `window.__PLAYER_GROOVE__` (reproductor). No se estima nada por DOM.
//
//  USO:  node scripts/qa-paridad-capas.mjs [programaGM]
//  Salida: .logs/qa-paridad-capas/results.json
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import midiFile from "../app/node_modules/midi-file/index.js";

const { writeMidi } = midiFile;

const OUT = ".logs/qa-paridad-capas";
const PIANO = "http://localhost:1234/";
const PLAYER = "http://localhost:1235/";
/** Programa GM con capas: 48 = String Ensemble 1 (VSCO, 3 capas). */
const PROGRAM = Number(process.argv[2] ?? 48);
const FIXTURE = `${OUT}/capas-p${PROGRAM}.mid`;
const GROOVE_SLIDER =
  'input[aria-label="Groove — microtiming y dinámica de la interpretación"]';

mkdirSync(OUT, { recursive: true });

/** Umbrales de `LayeredSampler.layerFor` (vscoSampler.ts). */
const THRESHOLDS = {
  2: [0.62],
  3: [0.42, 0.74],
  4: [0.34, 0.58, 0.8],
};

function layerIndex(velocity, layers) {
  if (layers <= 1) return 0;
  const cuts = THRESHOLDS[layers] ?? Array.from({ length: layers - 1 }, (_, i) => (i + 1) / layers);
  let index = 0;
  for (const cut of cuts) if (velocity >= cut) index++;
  return Math.max(0, Math.min(layers - 1, index));
}

const clamp01 = (v) => Math.max(0.02, Math.min(1, v));

// ── 1. Fixture: una pista, notas por todo el rango de velocity ──────────────

const VELOCITIES = [
  20, 30, 40, 50, 53, 55, 58, 60, 63, 66, 70, 74, 79, 82, 85, 88, 90, 94, 98,
  100, 105, 110, 115, 120, 125, 127,
];
const PPQ = 192;
const notes = VELOCITIES.map((velocity, i) => ({
  // Una altura DISTINTA por nota: la unión entre las dos apps se hace por
  // (altura, instante) y así no hay dos notas que se puedan confundir.
  midi: 48 + i,
  velocity,
  start: i * PPQ,
  duration: PPQ - 12,
}));

const events = [
  { deltaTime: 0, meta: true, type: "trackName", text: "Capas QA" },
  { deltaTime: 0, type: "programChange", channel: 0, programNumber: PROGRAM },
];
let last = 0;
for (const note of notes) {
  events.push({ deltaTime: note.start - last, type: "noteOn", channel: 0, noteNumber: note.midi, velocity: note.velocity });
  last = note.start;
  events.push({ deltaTime: 6, type: "noteOff", channel: 0, noteNumber: note.midi, velocity: 0 });
  last += 6;
}
events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });

writeFileSync(
  FIXTURE,
  Buffer.from(
    writeMidi({
      header: { format: 1, numTracks: 2, ticksPerBeat: PPQ },
      tracks: [
        [
          { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 },
          { deltaTime: 0, meta: true, type: "endOfTrack" },
        ],
        events,
      ],
    }),
  ),
);
console.log(`fixture: ${FIXTURE} (${readFileSync(FIXTURE).length} B) · programa GM ${PROGRAM} · ${notes.length} notas`);

// ── 2. Las dos apps ────────────────────────────────────────────────────────

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const errors = [];
const logs = [];

async function openApp(url) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("console", (m) => {
    logs.push(`${url.includes("1235") ? "player" : "piano"}: ${m.text()}`);
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${String(e)}`));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pm-bar", { timeout: 30000 });
  await page.waitForTimeout(2000);
  return page;
}

const pianoPage = await openApp(PIANO);

/** Capas REALES del instrumento, leídas del manifiesto que sirve Vite. */
const manifest = await pianoPage.evaluate(async (program) => {
  const m = await import(/* @vite-ignore */ "/src/engine/vscoManifest.ts");
  const instrument = m.VSCO_INSTRUMENTS.find((i) => i.program === program);
  if (!instrument) return null;
  const counts = Object.entries(instrument.layers).map(([note, variants]) => ({
    note: Number(note),
    layers: variants.length,
  }));
  const byCount = {};
  for (const c of counts) byCount[c.layers] = (byCount[c.layers] ?? 0) + 1;
  return { name: instrument.name ?? instrument.label ?? `programa ${program}`, byCount, max: Math.max(...counts.map((c) => c.layers)) };
}, PROGRAM);
console.log(`instrumento: ${manifest?.name ?? "(no está en VSCO)"} · capas por nota grabada: ${JSON.stringify(manifest?.byCount)}`);

const LAYERS = manifest?.max ?? 1;

// ── 3. Piano: cargar el fixture y leer el plan agendado ────────────────────

await pianoPage.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FIXTURE);
await pianoPage.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type=range]')?.max ?? 0) > 0,
  { timeout: 40000 },
);
await pianoPage.waitForTimeout(800);
// Groove a 0 % para que la velocity que viaja sea EXACTAMENTE la del archivo.
await pianoPage.locator('.rail-item[title="Ajustes"]').first().click();
await pianoPage.waitForSelector(GROOVE_SLIDER, { timeout: 15000 });
await pianoPage.locator(GROOVE_SLIDER).fill("0");
await pianoPage.waitForTimeout(150);
await pianoPage.locator('.rail-item[title="Studio"]').first().click();
await pianoPage.waitForTimeout(300);

await pianoPage.evaluate(() => {
  window.__PMP_GROOVE__ = null;
});
await pianoPage.locator(".playback-bar .btn.primary").first().click();
await pianoPage.waitForFunction(() => !!window.__PMP_GROOVE__, { timeout: 30000 });
await pianoPage.waitForTimeout(1500);
const pianoPlan = await pianoPage.evaluate(() => window.__PMP_GROOVE__);
await pianoPage.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
console.log(`piano: ${pianoPlan.rows.length} notas agendadas`);

// ── 4. Reproductor: importar el MISMO archivo y leer su plan ───────────────

const playerPage = await openApp(PLAYER);
await playerPage.waitForFunction(() => !!window.__PLAYER__, { timeout: 90000 });
await playerPage.locator('.rail-item[title="Música — tu reproductor"]').first().click();
// El input de importar está OCULTO a propósito (lo dispara el botón visible):
// se espera a que esté en el DOM, no a que sea visible.
const importInput = playerPage.locator('input[aria-label="Subir archivo MIDI o partitura"]');
await importInput.waitFor({ state: "attached", timeout: 90000 });
await playerPage.evaluate(() => {
  window.__PLAYER_GROOVE__ = null;
});
await importInput.setInputFiles(FIXTURE);
await playerPage.waitForFunction(() => !!window.__PLAYER_GROOVE__, { timeout: 90000 });
await playerPage.waitForTimeout(1500);
const playerPlan = await playerPage.evaluate(() => window.__PLAYER_GROOVE__);
await playerPage.evaluate(() => window.__PLAYER__.host.stop());
console.log(`reproductor: ${playerPlan.rows.length} notas agendadas · groove ${playerPlan.amount}`);

// ── 5. Comparación nota por nota ───────────────────────────────────────────

const key = (row) => `${row.midi}@${Number(row.time).toFixed(6)}`;
const pianoByKey = new Map(pianoPlan.rows.map((r) => [key(r), r]));
const playerByKey = new Map(playerPlan.rows.map((r) => [key(r), r]));

const table = [];
for (const row of pianoPlan.rows) {
  const other = playerByKey.get(key(row));
  if (!other) continue;
  const pianoVelocity = row.velocityOut;
  const playerVelocity = other.velocityOut;
  const amplitude = other.amplitude ?? 1;
  const playerVelocityBefore = clamp01(playerVelocity * amplitude);
  const levelBefore = playerVelocityBefore; // amplitud undefined ⇒ level = velocity
  const levelAfter = playerVelocity * amplitude; // velocityToGain(v) con γ = 1
  table.push({
    midi: row.midi,
    velocityMidi: Math.round(row.velocityIn * 127),
    pianoVelocity: Number(pianoVelocity.toFixed(6)),
    playerVelocity: Number(playerVelocity.toFixed(6)),
    playerAmplitude: amplitude,
    playerVelocityBefore: Number(playerVelocityBefore.toFixed(6)),
    pianoLayer: layerIndex(pianoVelocity, LAYERS),
    playerLayer: layerIndex(playerVelocity, LAYERS),
    playerLayerBefore: layerIndex(playerVelocityBefore, LAYERS),
    levelBefore: Number(levelBefore.toFixed(6)),
    levelAfter: Number(levelAfter.toFixed(6)),
    levelDeltaDb: Number((20 * Math.log10(levelAfter / (levelBefore || 1e-9))).toFixed(6)),
    velocityMatchesPiano: Math.abs(pianoVelocity - playerVelocity) < 1e-9,
  });
}

const layerMismatchAfter = table.filter((r) => r.pianoLayer !== r.playerLayer);
const layerMismatchBefore = table.filter((r) => r.pianoLayer !== r.playerLayerBefore);
const levelChanges = table.filter((r) => Math.abs(r.levelDeltaDb) > 1e-6);

console.log("\n=== VELOCITY QUE LLEGA A LA FUENTE Y CAPA ELEGIDA ===");
console.log("  velMIDI | piano v | repro v | amp  | capa piano | capa repro | capa repro ANTES");
for (const row of table) {
  const mark = row.playerLayerBefore !== row.pianoLayer ? " ←" : "";
  console.log(
    `  ${String(row.velocityMidi).padStart(7)} | ${row.pianoVelocity.toFixed(3).padStart(7)} | ${row.playerVelocity.toFixed(3).padStart(7)} | ${row.playerAmplitude.toFixed(2)} | ${String(row.pianoLayer).padStart(10)} | ${String(row.playerLayer).padStart(10)} | ${String(row.playerLayerBefore).padStart(15)}${mark}`,
  );
}

console.log("\n=== VERIFICACIONES ===");
const checks = [
  {
    what: "la velocity que recibe la fuente es la del archivo en las dos apps",
    ok: table.every((r) => r.velocityMatchesPiano),
    detail: `${table.filter((r) => r.velocityMatchesPiano).length}/${table.length} notas con la MISMA velocity que el piano`,
  },
  {
    what: "la capa elegida coincide con la del piano (después del arreglo)",
    ok: layerMismatchAfter.length === 0,
    detail: `${layerMismatchAfter.length} discrepancias de ${table.length} notas`,
  },
  {
    what: "cuántas notas elegían OTRA toma antes del arreglo",
    ok: layerMismatchBefore.length > 0,
    detail: `${layerMismatchBefore.length} de ${table.length} notas (velocities MIDI ${layerMismatchBefore.map((r) => r.velocityMidi).join(", ")})`,
  },
  {
    what: "el NIVEL de cada nota no cambia",
    ok: levelChanges.length === 0,
    detail: `ΔdB máximo ${Math.max(...table.map((r) => Math.abs(r.levelDeltaDb))).toExponential(2)}`,
  },
];
for (const check of checks) console.log(`  [${check.ok ? "OK  " : "FALLA"}] ${check.what} — ${check.detail}`);

writeFileSync(
  `${OUT}/results.json`,
  JSON.stringify(
    {
      program: PROGRAM,
      instrument: manifest?.name ?? null,
      layers: LAYERS,
      layersByNote: manifest?.byCount ?? null,
      pianoRows: pianoPlan.rows.length,
      playerRows: playerPlan.rows.length,
      table,
      checks,
      errors: errors.slice(0, 6),
    },
    null,
    2,
  ),
);
console.log(`\nresultados: ${OUT}/results.json`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 2);
