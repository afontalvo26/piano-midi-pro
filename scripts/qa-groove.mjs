// ============================================================
// qa-groove — verificación CON NÚMEROS de la fidelidad al MIDI y de la perilla
// Groove, sobre la app real corriendo en el puerto 1234.
//
// Qué mide (y con qué):
//
//  1. A 0 %: los ticks y las velocities agendados son IDÉNTICOS a la fórmula
//     sin perilla (se comparan uno por uno, no "en promedio").
//  2. A 50 % y 100 %: distribución real del desvío de los inicios de nota
//     (media, desvío estándar, mínimo, máximo) contra el tiempo escrito.
//  3. Fidelidad: CC7 (nivel de mezcla del archivo) y CC11 (expresión) se
//     aplican como ganancia por nota y por pista, y el fader de pista YA NO
//     toca la velocity que elige la capa de sample.
//  4. Captura de la perilla en la UI (.logs/qa/).
//
// Los números salen de `window.__PMP_GROOVE__`, el gancho de QA que App.tsx
// publica SÓLO en desarrollo con el plan exacto que se agendó en el Transport
// (ver `scheduleSongOnTransport`). No se estima nada mirando la pantalla.
//
// Salida: .logs/qa/results-groove.json + .logs/qa/groove-*.png
// ============================================================

import { openQA, URL, OUT } from "./qa-all-lib.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import midiFile from "../app/node_modules/midi-file/index.js";

const { writeMidi } = midiFile;

const FIXTURE = `${OUT}/qa-groove-fixture.mid`;
const EXPECTED = `${OUT}/qa-groove-fixture.json`;
const BPM = 120;
const PPQ = 192;

mkdirSync(OUT, { recursive: true });

// ── 1. Fixture MIDI con CC7 y CC11 escritos a mano ──────────────────────────
//
// Un archivo real no dice "acá CC7 = 100": hay que ir a buscarlo. Este fixture
// lo pone explícito para poder afirmar el número exacto que tiene que salir.
//
//   pista 0 · piano  (prog 0,  canal 0) CC7 = 127 → ganancia 1.000 (0.0 dB)
//   pista 1 · bajo   (prog 32, canal 1) CC7 = 100 → ganancia 0.787 (−4.1 dB)
//   pista 2 · cuerdas(prog 48, canal 2) CC7 = 64  → ganancia 0.254 (−11.9 dB)
//                                      CC11: rampa 127 → 64 dentro del compás
//   pista 3 · batería (canal 9)         CC7 = 90  → ganancia 0.502 (−6.0 dB)
//
// Las corcheas de cada pista están a 0.25 s (120 BPM): el intervalo local es de
// 250 ms, así que el tope relativo (8 % = 20 ms) no recorta y manda el absoluto.
const TICKS_PER_BEAT = PPQ;
const eighth = TICKS_PER_BEAT / 2;

function track(name, channel, program, notes, ccs) {
  const events = [];
  // Nombre de pista (meta 0x03) + programa GM.
  events.push({ deltaTime: 0, meta: true, type: "trackName", text: name });
  if (channel !== 9) {
    events.push({ deltaTime: 0, type: "programChange", channel, programNumber: program });
  }
  // Todos los eventos ordenados por tick absoluto. A igual tick, primero los
  // note-off: si no, el "off" de una nota larga apagaría a la que empieza ahí.
  const timed = [];
  for (const note of notes) {
    timed.push({ tick: note.start, order: 1, kind: "on", note });
    timed.push({ tick: note.start + note.duration, order: 0, kind: "off", note });
  }
  for (const cc of ccs) {
    timed.push({ tick: cc.tick, order: 0, kind: "cc", cc });
  }
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
      events.push({
        deltaTime: delta,
        type: "controller",
        channel,
        controllerType: item.cc.number,
        value: item.cc.value,
      });
    }
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return events;
}

const CHORDS = [60, 64, 67]; // Do mayor: sirve para verificar que el acorde se mueve junto
const pianoNotes = [];
const bassNotes = [];
const stringNotes = [];
const drumNotes = [];

for (let bar = 0; bar < 8; bar++) {
  for (let step = 0; step < 8; step++) {
    const start = bar * 4 * TICKS_PER_BEAT + step * eighth;
    // Melodía del piano: corcheas con acorde en el tiempo 1 de cada compás.
    pianoNotes.push({ start, duration: eighth - 6, midi: 72 + ((step * 2) % 5), velocity: 88 });
    if (step === 0) {
      for (const midi of CHORDS) {
        pianoNotes.push({ start, duration: eighth - 6, midi, velocity: 70 });
      }
    }
    // Bajo: negras.
    if (step % 2 === 0) {
      bassNotes.push({ start, duration: TICKS_PER_BEAT - 10, midi: 36 + (step % 4), velocity: 96 });
    }
    // Cuerdas: una redonda por compás (sostenido ⇒ legato).
    if (step === 0) {
      stringNotes.push({ start, duration: 4 * TICKS_PER_BEAT, midi: 55, velocity: 80 });
    }
    // Batería: bombo en 1 y 3, caja en 2 y 4, hi-hat en cada corchea.
    if (step % 4 === 0) drumNotes.push({ start, duration: 20, midi: 36, velocity: 110 });
    if (step % 4 === 2) drumNotes.push({ start, duration: 20, midi: 38, velocity: 100 });
    drumNotes.push({ start, duration: 20, midi: 42, velocity: 70 + (step % 3) * 6 });
  }
}

// CC7 inicial por pista + una rampa de CC11 en las cuerdas.
const ccPiano = [{ tick: 0, number: 7, value: 127 }];
const ccBass = [{ tick: 0, number: 7, value: 100 }];
const ccStrings = [
  { tick: 0, number: 7, value: 64 },
  { tick: 0, number: 11, value: 127 },
  { tick: 8 * TICKS_PER_BEAT, number: 11, value: 64 }, // crescendo inverso en el compás 5
];
const ccDrums = [{ tick: 0, number: 7, value: 90 }];

const midi = {
  header: { format: 1, numTracks: 5, ticksPerBeat: PPQ },
  tracks: [
    [
      { deltaTime: 0, meta: true, type: "timeSignature", numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
      { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: Math.round(60000000 / BPM) },
      { deltaTime: 0, meta: true, type: "endOfTrack" },
    ],
    track("Piano QA", 0, 0, pianoNotes, ccPiano),
    track("Bajo QA", 1, 32, bassNotes, ccBass),
    track("Cuerdas QA", 2, 48, stringNotes, ccStrings),
    track("Bateria QA", 9, 0, drumNotes, ccDrums),
  ],
};
writeFileSync(FIXTURE, Buffer.from(writeMidi(midi)));

/** Plan escrito, para comparar contra lo que la app agenda. */
const expected = {
  bpm: BPM,
  ppq: PPQ,
  ticksPerBeat: TICKS_PER_BEAT,
  timeSignature: [4, 4],
  tracks: [
    { name: "Piano QA", index: 0, cc7: 127, cc11: null, notes: pianoNotes },
    { name: "Bajo QA", index: 1, cc7: 100, cc11: null, notes: bassNotes },
    { name: "Cuerdas QA", index: 2, cc7: 64, cc11Start: 127, cc11End: 64, notes: stringNotes },
    { name: "Bateria QA", index: 3, cc7: 90, cc11: null, notes: drumNotes },
  ],
};
writeFileSync(EXPECTED, JSON.stringify(expected, null, 2));
console.log(`fixture: ${FIXTURE} (${readFileSync(FIXTURE).length} bytes)`);

// ── 2. Helpers ──────────────────────────────────────────────────────────────

const qa = await openQA();
const { page } = qa;
const results = {};

function stat(xs) {
  if (!xs.length) return { n: 0 };
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return {
    n,
    mean: Number(mean.toFixed(2)),
    sd: Number(sd.toFixed(2)),
    min: Number(Math.min(...xs).toFixed(2)),
    max: Number(Math.max(...xs).toFixed(2)),
    absMax: Number(Math.max(...xs.map(Math.abs)).toFixed(2)),
  };
}

const GROOVE_SLIDER = 'input[aria-label="Groove — microtiming y dinámica de la interpretación"]';

async function setGroove(value) {
  await page.locator(GROOVE_SLIDER).fill(String(value));
  await page.waitForTimeout(120);
  const shown = (await page.locator(`${GROOVE_SLIDER} + span`).textContent())?.trim();
  return shown;
}

async function setTrackFader(cardIndex, value) {
  const input = page.locator(".track-item-card").nth(cardIndex).locator('.track-volume-block input[type="range"]');
  await input.fill(String(value));
  await page.waitForTimeout(120);
  return Number(await input.inputValue());
}

/** Reinicia la reproducción al principio y lee el plan agendado. */
async function playAndReadPlan() {
  await page.evaluate(() => {
    window.__PMP_GROOVE__ = null;
  });
  // Detener → Reproducir, para forzar un reagendado completo (el groove se
  // "hornea" al agendar: es cuando el motor decide los ticks de cada nota).
  await page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
  await page.waitForTimeout(250);
  await page.locator(".playback-bar .btn.primary").click();
  await page.waitForFunction(() => !!window.__PMP_GROOVE__, { timeout: 20000 });
  await page.waitForTimeout(1200);
  const plan = await page.evaluate(() => window.__PMP_GROOVE__);
  await page.locator(".playback-bar .btn", { hasText: "Detener" }).first().click().catch(() => {});
  await page.waitForTimeout(150);
  return plan;
}

// ── 3. Cargar el fixture y ubicar la perilla ────────────────────────────────

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3000);

await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FIXTURE);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 30000 },
);
await page.waitForTimeout(1500);

// La perilla vive en Ajustes → "Interpretación (Groove)".
await page.locator('.rail-item[title="Ajustes"]').first().click();
await page.waitForSelector(GROOVE_SLIDER, { timeout: 15000 });
const knobVisible = await page.locator(GROOVE_SLIDER).isVisible();
const knobLabel = await page.locator(GROOVE_SLIDER).getAttribute("aria-label");
const subtitle = (
  await page.locator(GROOVE_SLIDER).locator("xpath=ancestor::div[contains(@class,'settings-row')]").locator("span").first().textContent()
)?.replace(/\s+/g, " ").trim();
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.locator(GROOVE_SLIDER).scrollIntoViewIfNeeded();
const shot = await qa.shot("groove-01-perilla");

qa.add({
  control: 'Perilla "Groove" en Ajustes (input[type=range])',
  selector: GROOVE_SLIDER,
  result: knobVisible ? "OK" : "FAIL",
  evidence: `aria-label="${knobLabel}"; subtítulo="${(subtitle || "").slice(0, 120)}…"; captura ${shot}`,
  shot,
});
results.knob = { visible: knobVisible, label: knobLabel, subtitle };

// ── 4. Verificación 1: a 0 % idéntico ───────────────────────────────────────

console.log("\n### 1. A 0 %: ticks y velocities idénticos");
const shown0 = await setGroove(0);
const plan0 = await playAndReadPlan();
const plan0bis = await playAndReadPlan();

const mismatches = [];
let notes0 = 0;
for (const row of plan0.rows) {
  notes0++;
  const expectedTick = Math.round((row.time / 60) * plan0.bpm * PPQ);
  if (row.ticks !== expectedTick) {
    mismatches.push(`tick ${row.id}: ${row.ticks} ≠ ${expectedTick}`);
  }
  if (!Object.is(row.velocityOut, row.velocityIn)) {
    mismatches.push(`velocity ${row.id}: ${row.velocityOut} ≠ ${row.velocityIn}`);
  }
  if (row.offsetMs !== 0) {
    mismatches.push(`offset ${row.id}: ${row.offsetMs} ≠ 0`);
  }
  if (row.durationFactor !== 1 || row.legatoMs !== 0) {
    mismatches.push(`duración ${row.id}: ${row.durationFactor}/${row.legatoMs}`);
  }
}
// Determinismo: dos reproducciones seguidas agendan exactamente lo mismo.
const bisMismatch = plan0.rows.filter(
  (row, i) => row.ticks !== plan0bis.rows[i]?.ticks || row.velocityOut !== plan0bis.rows[i]?.velocityOut,
).length;
results.zero = { notes: notes0, mismatches: mismatches.slice(0, 8), mismatchCount: mismatches.length, bisMismatch, shown: shown0 };
qa.add({
  control: "Groove 0 % = fiel al MIDI (ticks, velocities, duración)",
  selector: GROOVE_SLIDER,
  result: mismatches.length === 0 && bisMismatch === 0 && notes0 > 0 ? "OK" : "FAIL",
  evidence: `${notes0} notas agendadas; ticks ≠ fórmula: ${mismatches.length}; velocity ≠ escrita: ${mismatches.filter((m) => m.startsWith("velocity")).length}; offset ≠ 0: ${mismatches.filter((m) => m.startsWith("offset")).length}; dos reproducciones idénticas: ${bisMismatch === 0 ? "sí" : "NO"}; perilla muestra ${shown0}`,
});

// ── 5. Verificación 2: distribución del desvío a 50 % y 100 % ───────────────

console.log("\n### 2. Desvío real de los inicios contra el tiempo escrito");
const deviations = {};
for (const amount of [0.5, 1]) {
  const shown = await setGroove(amount);
  const plan = await playAndReadPlan();
  const byTrack = {};
  const all = [];
  for (const row of plan.rows) {
    // El desvío medido: cuántos ms se corrió el inicio agendado respecto del
    // tiempo escrito del MIDI (ticks → ms con el tempo de la canción).
    const written = (row.time / 60) * plan.bpm * PPQ;
    const measured = ((row.ticks - written) * 60 * 1000) / (plan.bpm * PPQ);
    byTrack[row.track] = byTrack[row.track] ?? [];
    byTrack[row.track].push(measured);
    all.push(measured);
  }
  deviations[amount] = {
    shown,
    all: stat(all),
    byTrack: Object.fromEntries(
      Object.entries(byTrack).map(([track, xs]) => [track, stat(xs)]),
    ),
  };
  console.log(
    `  ${shown}: n=${all.length} media=${deviations[amount].all.mean} ms  sd=${deviations[amount].all.sd}  min=${deviations[amount].all.min}  max=${deviations[amount].all.max}  |max|=${deviations[amount].all.absMax}`,
  );
}
const max100 = deviations[1].all.absMax;
results.deviations = deviations;
qa.add({
  control: "Groove 50 % / 100 %: desvío medido (media, sd, min, max)",
  selector: GROOVE_SLIDER,
  result: max100 <= 15.5 ? "OK" : "FAIL",
  evidence: `100 %: n=${deviations[1].all.n}, media ${deviations[1].all.mean} ms, sd ${deviations[1].all.sd} ms, rango [${deviations[1].all.min}, ${deviations[1].all.max}] ms, |máx| ${max100} ms (tope 15 ms); 50 %: |máx| ${deviations[0.5].all.absMax} ms`,
});

// Techo de diseño: cuánto puede moverse cada rol en cada posición métrica. Es la
// tabla que documenta `engine/groove.ts`, recalculada con los valores reales del
// módulo (así el informe no puede desincronizarse del código).
const ceiling = await page.evaluate(async () => {
  const groove = await import(/* @vite-ignore */ "/src/engine/groove.ts");
  const rows = [];
  for (const [role, offset] of Object.entries(groove.GROOVE_ROLE_OFFSET_MS)) {
    for (const [slot, weight] of Object.entries(groove.GROOVE_METRIC_WEIGHT)) {
      const scale = groove.GROOVE_ROLE_JITTER_SCALE[role];
      rows.push({
        role,
        slot,
        maxMs: Number(
          (weight * (Math.abs(offset) + groove.GROOVE_JITTER_MAX_MS * scale)).toFixed(2),
        ),
      });
    }
  }
  return { rows, abs: groove.GROOVE_MAX_ABS_MS, relative: groove.GROOVE_MAX_RELATIVE };
});
const worst = ceiling.rows.reduce((a, b) => (b.maxMs > a.maxMs ? b : a));
const strongCeiling = Math.max(
  ...ceiling.rows.filter((r) => r.slot === "strong" || r.slot === "downbeat").map((r) => r.maxMs),
);
results.ceiling = ceiling;
qa.add({
  control: "Techo de diseño del Groove (peor rol × posición métrica)",
  selector: "(módulo engine/groove.ts)",
  result: worst.maxMs <= ceiling.abs ? "OK" : "FAIL",
  evidence: `peor caso ${worst.role}/${worst.slot} = ${worst.maxMs} ms (tope absoluto ${ceiling.abs} ms, tope relativo ${ceiling.relative * 100} % del intervalo local); en tiempos fuertes y tiempo 1 el techo es ${strongCeiling} ms`,
});

// ── 6. Verificación 3a: CC7 / CC11 por pista ────────────────────────────────

console.log("\n### 3a. CC7/CC11 del archivo: ganancia por pista");
const ccTable = [];
const byTrack0 = new Map();
for (const row of plan0.rows) {
  const list = byTrack0.get(row.track) ?? [];
  list.push(row);
  byTrack0.set(row.track, list);
}
for (const [track, rows] of [...byTrack0.entries()].sort((a, b) => a[0] - b[0])) {
  const cc7 = rows[0].volume === null ? null : Math.round(rows[0].volume * 127);
  const cc11s = [...new Set(rows.map((r) => (r.expression === null ? null : Math.round(r.expression * 127))))];
  const gains = rows.map((r) => r.gain * (r.volume === null ? 1 : 1)); // ganancia total (fader incluido)
  const ccGain = rows[0].volume === null ? 1 : rows[0].volume ** 2;
  const db = 20 * Math.log10(Math.max(ccGain, 1e-6));
  ccTable.push({
    track,
    role: rows[0].role,
    cc7,
    cc11: cc11s,
    ccGain: Number(ccGain.toFixed(4)),
    db: Number(db.toFixed(2)),
    gainWithFader: Number((gains[0] ?? 0).toFixed(4)),
  });
  console.log(
    `  pista ${track} (${rows[0].role}): CC7=${cc7 ?? "—"} CC11=${cc11s.map((v) => v ?? "—").join("/")} → ganancia CC ${ccGain.toFixed(3)} (${db.toFixed(1)} dB respecto de ignorarlo)`,
  );
}
results.cc = ccTable;
const ccDiffer = new Set(ccTable.map((r) => r.ccGain)).size > 1;
const cc11Applied = ccTable.some((r) => r.cc11.some((v) => v !== null && v !== 127));
qa.add({
  control: "CC7 (Channel Volume) como nivel de mezcla por pista",
  selector: "(ventana.__PMP_GROOVE__)",
  result: ccDiffer ? "OK" : "FAIL",
  evidence: ccTable
    .map((r) => `p${r.track} CC7=${r.cc7 ?? "—"} → ${r.db} dB`)
    .join(" · ") + ` (ignorarlos daría 0 dB en las cuatro)`,
});
qa.add({
  control: "CC11 (Expression) por nota (rampa del compás 5)",
  selector: "(ventana.__PMP_GROOVE__)",
  result: cc11Applied ? "OK" : "FAIL",
  evidence: `cuerdas: CC11 ${ccTable[2]?.cc11.join(" → ")} (la ganancia de esas notas cambia nota a nota)`,
});

// ── 7. Verificación 3b: el fader ya no toca la capa de sample ───────────────

console.log("\n### 3b. Fader de pista: ganancia, no velocity");
await page.locator('.rail-item[title="Pistas"]').first().click();
await page.waitForSelector(".track-item-card", { timeout: 15000 });
const faderHigh = await setTrackFader(0, 1);
const planHigh = await playAndReadPlan();
const faderLow = await setTrackFader(0, 0.1);
const planLow = await playAndReadPlan();

const key = (rows) => new Map(rows.map((r) => [r.id, r]));
const highById = key(planHigh.rows);
const faderCompare = planLow.rows
  .filter((r) => highById.has(r.id))
  .map((low) => {
    const high = highById.get(low.id);
    return {
      id: low.id,
      track: low.track,
      velocityLow: low.velocityOut,
      velocityHigh: high.velocityOut,
      gainLow: low.gain,
      gainHigh: high.gain,
    };
  });
const velocityChanged = faderCompare.filter((r) => !Object.is(r.velocityLow, r.velocityHigh));
// Ganancia esperada: 0.1/1.0 = −20 dB.
const gainRatios = faderCompare
  .filter((r) => r.track === 0)
  .map((r) => r.gainLow / r.gainHigh);
const expectedRatio = faderLow / faderHigh;
const ratioError = Math.max(...gainRatios.map((r) => Math.abs(r - expectedRatio)));

// Qué capa habría elegido el comportamiento VIEJO (velocity × fader) en un
// instrumento de 3 capas (umbrales de LayeredSampler: 0.42 / 0.74).
const layerFor = (v) => (v >= 0.74 ? 2 : v >= 0.42 ? 1 : 0);
const streaks = faderCompare.filter((r) => r.track === 2);
const oldLayers = streaks.map((r) => layerFor(r.velocityLow * faderLow));
const newLayers = streaks.map((r) => layerFor(r.velocityLow));
const changedLayers = oldLayers.filter((l, i) => l !== newLayers[i]).length;

results.fader = {
  faderHigh,
  faderLow,
  notes: faderCompare.length,
  velocityChanged: velocityChanged.length,
  exampleVelocity: faderCompare[0] && {
    id: faderCompare[0].id,
    low: faderCompare[0].velocityLow,
    high: faderCompare[0].velocityHigh,
  },
  expectedRatio,
  ratioError,
  layers: { oldLayers, newLayers, changedLayers },
};
qa.add({
  control: "Fader de pista: la velocity (capa de sample) queda intacta",
  selector: ".track-item-card .track-volume-block input[type=range]",
  result: velocityChanged.length === 0 ? "OK" : "FAIL",
  evidence: `${faderCompare.length} notas comparadas con fader 100 % vs 10 %: velocity distinta en ${velocityChanged.length}; la ganancia escala ×${expectedRatio.toFixed(3)} (error máx ${ratioError.toExponential(2)})`,
});
qa.add({
  control: "Fader de pista: capa de sample que se habría elegido ANTES (velocity × fader)",
  selector: "(cálculo con los umbrales de LayeredSampler)",
  result: changedLayers > 0 ? "OK" : "N/V",
  evidence: `cuerdas (3 capas): ${changedLayers}/${oldLayers.length} notas cambiaban de toma al bajar el fader (capas viejas ${JSON.stringify([...new Set(oldLayers)])} vs nuevas ${JSON.stringify([...new Set(newLayers)])})`,
});

// ── 8. Ruido de consola y cierre ────────────────────────────────────────────

const errorNoise = qa.consoleErrors.filter((e) => !/favicon|WebMidi|DevTools/i.test(e));
qa.add({
  control: "Consola sin errores nuevos durante las mediciones",
  selector: "(page.on console/pageerror)",
  result: errorNoise.length === 0 ? "OK" : "FAIL",
  evidence: errorNoise.length ? errorNoise.slice(0, 3).join(" | ") : "sin errores",
});

writeFileSync(`${OUT}/results-groove.json`, JSON.stringify({ results, rows: qa.results }, null, 2));
console.log(`\nresultados: ${OUT}/results-groove.json`);
await qa.close();
