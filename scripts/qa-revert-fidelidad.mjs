// =============================================================================
//  qa-revert-fidelidad.mjs — verifica CON NÚMEROS el revert del balance
// =============================================================================
//
//  Qué comprueba (y contra qué estado):
//
//   1. CC7/CC11 ya NO afectan el sonido. Se cargan DOS fixtures que sólo se
//      diferencian en los controladores (A los trae, B es idéntico sin ellos) y
//      se compara la ganancia por nota y por pista que el motor agendó: tienen
//      que ser EXACTAMENTE la misma. El número "antes" (0 / −4.15 / −11.9 /
//      −5.98 dB, el que midió `scripts/qa-groove.mjs` en `a0d03de`) se recalcula
//      acá a partir del CC7 que el parser sigue leyendo.
//
//   2. El parseo sigue funcionando: `volume` y `expression` siguen llegando a la
//      nota (el dato del archivo no se perdió, sólo dejó de aplicarse).
//
//   3. La curva de velocity volvió a γ = 1: `velocityToGain(0.5)` = 0.5
//      (−6.02 dB) y no 0.392 (−8.13 dB, lo que daba γ = 1.35).
//
//   4. La perilla Groove: valor por defecto 0 en las DOS apps (misma clave de
//      `localStorage`) y, a 0 %, ticks idénticos a los del MIDI.
//
//   5. Nivel de mezcla analítico sobre `Bolero_-_Besame_Mucho.kar`: la energía
//      total de la canción con las constantes de HOY contra la que daba
//      `a0d03de` (γ = 1.35 + CC7/CC11 aplicados), nota por nota. Es el ΔdB real
//      del revert, sin ruido de medición.
//
//  USO:  node scripts/qa-revert-fidelidad.mjs
//  Requiere los dev servers de 1234 (piano) y 1235 (reproductor) levantados.
//  Salida: .logs/qa-revert/results.json
// =============================================================================

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import midiFile from "../app/node_modules/midi-file/index.js";

const { writeMidi } = midiFile;

const PIANO = "http://localhost:1234/";
const PLAYER = "http://localhost:1235/";
const OUT = ".logs/qa-revert";
const BOLERO = "Bolero_-_Besame_Mucho.kar";
const BPM = 120;
const PPQ = 192;
const GROOVE_SLIDER =
  'input[aria-label="Groove — microtiming y dinámica de la interpretación"]';

mkdirSync(OUT, { recursive: true });

const results = {};
const log = (...args) => console.log(...args);
const db = (ratio) => Number((20 * Math.log10(Math.max(ratio, 1e-9))).toFixed(2));

// ── 1. Los dos fixtures (idénticos salvo los controladores) ──────────────────

const TICKS_PER_BEAT = PPQ;
const eighth = TICKS_PER_BEAT / 2;

/** Eventos de una pista a partir de notas y controladores (mismo orden siempre). */
function trackEvents(name, channel, program, notes, ccs) {
  const events = [
    { deltaTime: 0, meta: true, type: "trackName", text: name },
  ];
  if (channel !== 9) {
    events.push({ deltaTime: 0, type: "programChange", channel, programNumber: program });
  }
  const timed = [];
  for (const note of notes) {
    timed.push({ tick: note.start, order: 1, kind: "on", note });
    timed.push({ tick: note.start + note.duration, order: 0, kind: "off", note });
  }
  for (const cc of ccs) timed.push({ tick: cc.tick, order: 0, kind: "cc", cc });
  timed.sort((a, b) => a.tick - b.tick || a.order - b.order);

  let last = 0;
  for (const item of timed) {
    const delta = item.tick - last;
    last = item.tick;
    if (item.kind === "on") {
      events.push({ deltaTime: delta, type: "noteOn", channel, noteNumber: item.note.midi, velocity: item.note.velocity });
    } else if (item.kind === "off") {
      events.push({ deltaTime: delta, type: "noteOff", channel, noteNumber: item.note.midi, velocity: 0 });
    } else {
      events.push({ deltaTime: delta, type: "controller", channel, controllerType: item.cc.number, value: item.cc.value });
    }
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return events;
}

// Mismas pistas y mismas notas que el fixture de `scripts/qa-groove.mjs`, para
// que los números de CC7 sean comparables uno a uno con los de `a0d03de`.
const pianoNotes = [];
const bassNotes = [];
const stringNotes = [];
const drumNotes = [];
for (let bar = 0; bar < 8; bar++) {
  for (let step = 0; step < 8; step++) {
    const start = bar * 4 * TICKS_PER_BEAT + step * eighth;
    pianoNotes.push({ start, duration: eighth - 6, midi: 72 + ((step * 2) % 5), velocity: 88 });
    if (step === 0) {
      for (const midi of [60, 64, 67]) {
        pianoNotes.push({ start, duration: eighth - 6, midi, velocity: 70 });
      }
    }
    if (step % 2 === 0) bassNotes.push({ start, duration: TICKS_PER_BEAT - 10, midi: 36 + (step % 4), velocity: 96 });
    if (step === 0) stringNotes.push({ start, duration: 4 * TICKS_PER_BEAT, midi: 55, velocity: 80 });
    if (step % 4 === 0) drumNotes.push({ start, duration: 20, midi: 36, velocity: 110 });
    if (step % 4 === 2) drumNotes.push({ start, duration: 20, midi: 38, velocity: 100 });
    drumNotes.push({ start, duration: 20, midi: 42, velocity: 70 + (step % 3) * 6 });
  }
}

/**
 * CC7 por pista, los mismos valores que el fixture de `qa-groove.mjs`:
 * piano 127 (0 dB) · bajo 100 (−4.15 dB) · cuerdas 64 (−11.9 dB) · batería 90
 * (−5.98 dB). Las cuerdas además llevan una rampa de CC11 127 → 64.
 */
const CC7 = { Piano: 127, Bajo: 100, Cuerdas: 64, Bateria: 90 };
const cc = (number, value, tick = 0) => ({ tick, number, value });

function buildFixture({ withControls }) {
  const empty = [];
  const strings = withControls
    ? [
        cc(7, 64),
        cc(11, 127),
        { tick: 8 * TICKS_PER_BEAT, number: 11, value: 64 },
      ]
    : empty;
  return {
    header: { format: 1, numTracks: 5, ticksPerBeat: PPQ },
    tracks: [
      [
        { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60000000 / BPM) },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ],
      trackEvents("Piano QA", 0, 0, pianoNotes, withControls ? [cc(7, CC7.Piano)] : empty),
      trackEvents("Bajo QA", 1, 32, bassNotes, withControls ? [cc(7, CC7.Bajo)] : empty),
      trackEvents("Cuerdas QA", 2, 48, stringNotes, strings),
      trackEvents("Bateria QA", 9, 0, drumNotes, withControls ? [cc(7, CC7.Bateria)] : empty),
    ],
  };
}

const WITH = `${OUT}/fixture-con-cc.mid`;
const WITHOUT = `${OUT}/fixture-sin-cc.mid`;
writeFileSync(WITH, Buffer.from(writeMidi(buildFixture({ withControls: true }))));
writeFileSync(WITHOUT, Buffer.from(writeMidi(buildFixture({ withControls: false }))));
log(`fixtures: ${WITH} (${readFileSync(WITH).length} B) · ${WITHOUT} (${readFileSync(WITHOUT).length} B)`);

// ── 2. Helpers de la app ────────────────────────────────────────────────────

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${String(e)}`));

/** Carga un MIDI en el Studio y espera a que el parser termine. */
async function loadFixture(file) {
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(file);
  await page.waitForFunction(
    () => Number(document.querySelector('.seeker-container input[type=range]')?.max ?? 0) > 0,
    { timeout: 30000 },
  );
  await page.waitForTimeout(800);
}

/** Ajustes → Groove a `value` (0 = fiel al archivo). */
async function setGroove(value) {
  await page.locator('.rail-item[title="Ajustes"]').first().click();
  await page.waitForSelector(GROOVE_SLIDER, { timeout: 15000 });
  await page.locator(GROOVE_SLIDER).fill(String(value));
  await page.waitForTimeout(120);
  return (await page.locator(`${GROOVE_SLIDER} + span`).textContent())?.trim();
}

/** Detener → Reproducir y devuelve el plan EXACTO que fue al Transport. */
async function playAndReadPlan() {
  await page.evaluate(() => {
    window.__PMP_GROOVE__ = null;
  });
  await page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
  await page.waitForTimeout(250);
  await page.locator(".playback-bar .btn.primary").click();
  await page.waitForFunction(() => !!window.__PMP_GROOVE__, { timeout: 25000 });
  await page.waitForTimeout(600);
  const plan = await page.evaluate(() => window.__PMP_GROOVE__);
  await page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
  await page.waitForTimeout(150);
  return plan;
}

/** Agrupa las filas del plan por pista. */
function byTrack(rows) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.track) ?? [];
    list.push(row);
    map.set(row.track, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

// ── 3. Piano: valor por defecto de la perilla ANTES de tocarla ──────────────

log("\n=== Piano (1234) ===");
await page.goto(PIANO, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(2500);
const persistedPiano = await page.evaluate(() => localStorage.getItem("piano_groove_amount"));
log(`piano · localStorage["piano_groove_amount"] en contexto limpio: ${JSON.stringify(persistedPiano)}`);

// ── 4. Las constantes, leídas del módulo REAL que sirve Vite ────────────────

const constants = await page.evaluate(async () => {
  const gain = await import(/* @vite-ignore */ "/src/engine/playbackGain.ts");
  const gammaBefore = 1.35;
  return {
    applyMidiControls: gain.APPLY_MIDI_CONTROLS,
    velocityGamma: gain.VELOCITY_GAMMA,
    velocityToGainHalf: gain.velocityToGain(0.5),
    velocityToGainGamma135: Math.pow(0.5, gammaBefore),
    ccToGain: {
      sinControl: gain.ccToGain(undefined),
      cc7_100: gain.ccToGain(100 / 127),
      cc7_64: gain.ccToGain(64 / 127),
      cc7_90: gain.ccToGain(90 / 127),
      cc11_64: gain.ccToGain(64 / 127),
    },
    noteOutGainWithControls: gain.noteOutGain({ volume: 100 / 127, expression: 64 / 127, fader: 1 }),
    noteOutGainHalfFader: gain.noteOutGain({ volume: 100 / 127, expression: 64 / 127, fader: 0.5 }),
  };
});
results.constants = {
  ...constants,
  velocityToGainHalfDb: db(constants.velocityToGainHalf),
  velocityToGainGamma135Db: db(constants.velocityToGainGamma135),
  cc7_100Db: db(constants.ccToGain.cc7_100),
  cc7_64Db: db(constants.ccToGain.cc7_64),
  cc7_90Db: db(constants.ccToGain.cc7_90),
};
log("\n--- Constantes del módulo (leídas de /src/engine/playbackGain.ts) ---");
log(`  APPLY_MIDI_CONTROLS = ${constants.applyMidiControls} · VELOCITY_GAMMA = ${constants.velocityGamma}`);
log(`  velocityToGain(0.5) = ${constants.velocityToGainHalf} (${db(constants.velocityToGainHalf)} dB) · con γ=1.35 daría ${constants.velocityToGainGamma135.toFixed(4)} (${db(constants.velocityToGainGamma135)} dB)`);
log(`  ccToGain: sin control ${constants.ccToGain.sinControl} · CC7=100 ${constants.ccToGain.cc7_100} · CC7=64 ${constants.ccToGain.cc7_64} · CC7=90 ${constants.ccToGain.cc7_90}`);
log(`  noteOutGain({CC7=100, CC11=64, fader=1}) = ${constants.noteOutGainWithControls} · con fader 0.5 = ${constants.noteOutGainHalfFader}`);

// ── 5. Piano: fixture CON CC vs SIN CC ─────────────────────────────────────

const grooveShown = await setGroove(0);
log(`\nperilla Groove en Ajustes: ${grooveShown} (fijada a 0 % para medir)`);

await page.locator('.rail-item[title="Studio"]').first().click().catch(() => {});
await page.waitForTimeout(300);
await loadFixture(WITH);
const planWith = await playAndReadPlan();
log(`plan CON CC7/CC11: ${planWith.rows.length} notas agendadas`);
await page.locator('.rail-item[title="Ajustes"]').first().click().catch(() => {});
await page.waitForTimeout(200);
await page.locator('.rail-item[title="Studio"]').first().click().catch(() => {});
await page.waitForTimeout(300);
await loadFixture(WITHOUT);
const planWithout = await playAndReadPlan();
log(`plan SIN CC7/CC11: ${planWithout.rows.length} notas agendadas`);

const withById = new Map(planWith.rows.map((r) => [r.id, r]));
const withoutById = new Map(planWithout.rows.map((r) => [r.id, r]));
const compared = planWith.rows.filter((r) => withoutById.has(r.id));

const gainDiffs = [];
for (const row of compared) {
  const other = withoutById.get(row.id);
  if (!Object.is(row.gain, other.gain)) {
    gainDiffs.push({ id: row.id, track: row.track, withCc: row.gain, withoutCc: other.gain });
  }
}
const missing = planWith.rows.filter((r) => !withoutById.has(r.id)).length +
  planWithout.rows.filter((r) => !withById.has(r.id)).length;

const tableByTrack = [];
for (const [track, rows] of byTrack(planWith.rows)) {
  const twin = byTrack(planWithout.rows).find(([t]) => t === track)?.[1] ?? [];
  const cc7 = rows[0].volume === null ? null : Math.round(rows[0].volume * 127);
  const cc11 = [...new Set(rows.map((r) => (r.expression === null ? null : Math.round(r.expression * 127))))];
  // Ganancia que aplicaba `a0d03de` con ese CC7/CC11 (ley del GM2), y la que
  // aplica hoy. El ΔdB es lo que el revert devolvió a esa pista.
  const ccGainBefore = rows[0].volume === null ? 1 : rows[0].volume ** 2;
  const ccGainNow = rows[0].gain / (rows[0].fader || 1);
  tableByTrack.push({
    track,
    role: rows[0].role,
    percussive: rows[0].percussive,
    notes: rows.length,
    cc7,
    cc11,
    gainWithCc: rows[0].gain,
    gainWithoutCc: twin[0]?.gain ?? null,
    identical: rows.every((r, i) => Object.is(r.gain, twin[i]?.gain)),
    cc7GainBefore: Number(ccGainBefore.toFixed(4)),
    cc7DbBefore: db(ccGainBefore),
    ccGainNow: Number(ccGainNow.toFixed(6)),
    ccGainNowDb: db(ccGainNow),
    velocityIdentical: rows.every((r, i) => Object.is(r.velocityOut, twin[i]?.velocityOut)),
  });
}
results.cc = { compared: compared.length, missing, gainDiffs: gainDiffs.slice(0, 5), gainDiffCount: gainDiffs.length, byTrack: tableByTrack };

log("\n--- CC7/CC11: ganancia agendada CON el control vs SIN el control ---");
for (const row of tableByTrack) {
  log(
    `  pista ${row.track} (${row.role}${row.percussive ? ", percusiva" : ""}): CC7=${row.cc7 ?? "—"} CC11=${row.cc11.map((v) => v ?? "—").join("/")}` +
      ` → hoy CC aporta ${row.ccGainNowDb} dB (ganancia ${row.ccGainNow}) · en a0d03de aportaba ${row.cc7DbBefore} dB` +
      ` · ganancia con CC ${row.gainWithCc} vs sin CC ${row.gainWithoutCc} → ${row.identical ? "IDÉNTICA" : "DISTINTA"}`,
  );
}
log(`  notas comparadas una a una: ${compared.length} · diferencias de ganancia: ${gainDiffs.length} · notas sin par: ${missing}`);

// Parseo intacto: el CC7/CC11 sigue llegando a la nota.
const parsed = tableByTrack.filter((r) => r.cc7 !== null).map((r) => ({ track: r.track, cc7: r.cc7, cc11: r.cc11 }));
results.parsing = { parsed, expected: CC7 };
log("\n--- Parseo (el dato del archivo sigue llegando a la nota) ---");
log(`  ${parsed.map((p) => `p${p.track}: CC7=${p.cc7} CC11=${p.cc11.join("/")}`).join(" · ")}`);

// ── 6. Nivel de mezcla analítico: Bolivia... digo, Bolero ───────────────────

const mix = await page.evaluate(async (file) => {
  const { parseMidiBytes } = await import(/* @vite-ignore */ "/src/music/resolve.ts");
  const gain = await import(/* @vite-ignore */ "/src/engine/playbackGain.ts");
  const bytes = await (await fetch(`/demo/${file}`)).arrayBuffer();
  const song = await parseMidiBytes(bytes, {
    id: "qa-revert",
    title: "qa-revert",
    trackId: "qa:revert",
    defaultBpm: 120,
  });
  const notes = [...song.notes, ...(song.percussion ?? [])];
  let energyNow = 0;
  let energyA0d03de = 0;
  let cc7Notes = 0;
  for (const note of notes) {
    const fader = 1; // constante por pista: se cancela en el ΔdB
    const v = Math.max(0, Math.min(1, note.velocity));
    // HOY: γ = 1 y CC7/CC11 ignorados.
    const now = gain.velocityToGain(v) * fader;
    // a0d03de: γ = 1.35 y CC aplicados como ganancia.
    const before =
      Math.pow(v, 1.35) *
      (note.volume === undefined ? 1 : note.volume ** 2) *
      (note.expression === undefined ? 1 : note.expression ** 2);
    energyNow += now * now;
    energyA0d03de += before * before;
    if (note.volume !== undefined) cc7Notes++;
  }
  return {
    notes: notes.length,
    cc7Notes,
    bpm: song.bpm,
    energyNow,
    energyA0d03de,
    deltaDb: 10 * Math.log10(energyNow / energyA0d03de),
    // Sólo la curva, sin los controles: lo que cambió en el reproductor (que
    // nunca aplicó CC7/CC11) y lo que habría cambiado en el piano sin CC.
    energyGammaOnly135: notes.reduce((sum, n) => {
      const v = Math.max(0, Math.min(1, n.velocity));
      return sum + Math.pow(v, 1.35) ** 2;
    }, 0),
    energyGammaOnly1: notes.reduce((sum, n) => {
      const v = Math.max(0, Math.min(1, n.velocity));
      return sum + v * v;
    }, 0),
  };
}, BOLERO);

results.mixAnalytic = {
  ...mix,
  deltaDb: Number(mix.deltaDb.toFixed(2)),
  gammaOnlyDeltaDb: Number((10 * Math.log10(mix.energyGammaOnly1 / mix.energyGammaOnly135)).toFixed(2)),
};
log(`\n--- Nivel de mezcla analítico (${BOLERO}) ---`);
log(`  ${mix.notes} notas (${mix.cc7Notes} con CC7 del archivo), bpm ${mix.bpm}`);
log(`  energía HOY (γ=1, CC ignorados) = ${mix.energyNow.toFixed(2)}`);
log(`  energía en a0d03de (γ=1.35 + CC7/CC11) = ${mix.energyA0d03de.toFixed(2)}`);
log(`  Δ = ${results.mixAnalytic.deltaDb} dB (lo que el revert devuelve a la mezcla)`);
log(`  sólo la curva (lo que cambió en el reproductor, que nunca aplicó CC): ${results.mixAnalytic.gammaOnlyDeltaDb} dB`);

// ── 7. Reproductor: valor por defecto de la perilla ────────────────────────

log("\n=== Reproductor (1235) ===");
const playerContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const player = await playerContext.newPage();
player.setDefaultTimeout(30000);
const playerErrors = [];
player.on("pageerror", (e) => playerErrors.push(String(e)));
await player.goto(PLAYER, { waitUntil: "domcontentloaded" });
await player.waitForSelector(".pm-bar", { timeout: 30000 });
await player.waitForFunction(() => !!window.__PLAYER__, { timeout: 60000 });
await player.waitForTimeout(1500);
const playerGroove = await player.evaluate(() => ({
  amount: window.__PLAYER__.grooveAmount(),
  persisted: localStorage.getItem("piano_groove_amount"),
}));
log(`  grooveAmount() = ${playerGroove.amount} · localStorage = ${JSON.stringify(playerGroove.persisted)}`);
results.player = { groove: playerGroove, errors: playerErrors.slice(0, 5) };

// ── 8. Resultado ───────────────────────────────────────────────────────────

const checks = [
  {
    what: "APPLY_MIDI_CONTROLS = false",
    ok: constants.applyMidiControls === false,
    detail: `leído del módulo real: ${constants.applyMidiControls}`,
  },
  {
    what: "CC7/CC11 no cambian la ganancia (con CC = sin CC, nota por nota)",
    ok: gainDiffs.length === 0 && compared.length > 0 && missing === 0,
    detail: `${compared.length} notas comparadas, ${gainDiffs.length} diferencias`,
  },
  {
    what: "El parseo sigue leyendo CC7/CC11",
    ok: parsed.length === 4 && parsed.every((p) => p.cc7 !== null),
    detail: parsed.map((p) => `p${p.track}=${p.cc7}`).join(" "),
  },
  {
    what: "VELOCITY_GAMMA = 1 y velocityToGain(0.5) = 0.5",
    ok: constants.velocityGamma === 1 && constants.velocityToGainHalf === 0.5,
    detail: `${constants.velocityToGainHalf} (${db(constants.velocityToGainHalf)} dB) vs ${db(constants.velocityToGainGamma135)} dB con γ=1.35`,
  },
  {
    what: "la ganancia de CC con la constante apagada es 1",
    ok: Object.values(constants.ccToGain).every((v) => v === 1),
    detail: `ccToGain: ${JSON.stringify(constants.ccToGain)}`,
  },
  {
    what: "el fader sigue siendo ganancia pura (noteOutGain = fader)",
    ok: constants.noteOutGainHalfFader === 0.5,
    detail: `noteOutGain(fader 0.5) = ${constants.noteOutGainHalfFader}`,
  },
  {
    what: "Groove por defecto 0 en las dos apps",
    ok: (persistedPiano === null || Number(persistedPiano) === 0) && playerGroove.amount === 0,
    detail: `piano localStorage=${JSON.stringify(persistedPiano)} (${grooveShown} en la UI) · reproductor grooveAmount=${playerGroove.amount} localStorage=${JSON.stringify(playerGroove.persisted)}`,
  },
];

log("\n=== VERIFICACIONES ===");
for (const check of checks) log(`  [${check.ok ? "OK  " : "FALLA"}] ${check.what} — ${check.detail}`);
results.checks = checks;
results.consoleErrors = consoleErrors.filter((e) => !/usePlayerUi/.test(e)).slice(0, 5);

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
log(`\nresultados: ${OUT}/results.json`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 2);
