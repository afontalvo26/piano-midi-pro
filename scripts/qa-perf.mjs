// ============================================================
// qa-perf.mjs — ¿por qué se corta y popea la reproducción?
//
// Mide, durante N segundos de una canción real, las cuatro cosas que deciden
// si el audio llega a tiempo:
//
//   1. JITTER de `AudioBufferSourceNode.start`: cuánto antes/después del
//      instante pedido arranca realmente cada sample. `lead < 0` significa que
//      el evento se agendó en el pasado: Web Audio lo clampa a "ahora" y la
//      nota se pega con lo que ya está sonando → el pop.
//   2. LONG TASKS (>50 ms) del hilo principal: si el hilo está ocupado, el
//      scheduler de Tone no corre y el punto 1 se dispara.
//   3. MUTACIONES DE DOM por segundo: proxy directo de cuánto re-renderiza
//      React (y de si el árbol entero se rehace por frame).
//   4. Deriva del reloj que ve el usuario (`.time-display`) contra el reloj de
//      audio.
//
// Uso:  node scripts/qa-perf.mjs [archivo.kar] [segundos] [etiqueta]
// ============================================================
import { chromium } from "playwright";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const fixture = process.argv[2] ?? "app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar";
const seconds = Number(process.argv[3] ?? 30);
const label = process.argv[4] ?? "medicion";

/**
 * Densidad del archivo: cuántos callbacks de `Tone.Transport.schedule` hay que
 * agendar por segundo (la app agenda dos por nota: note-on y note-off). Se lee
 * con el `@tonejs/midi` de la app, que es el mismo parser que usa el navegador.
 */
function fixtureDensity(file) {
  try {
    const require = createRequire(
      path.join(process.cwd(), "app", "package.json"),
    );
    const { Midi } = require("@tonejs/midi");
    const midi = new Midi(fs.readFileSync(file));
    let notes = 0;
    for (const track of midi.tracks) notes += track.notes.length;
    const duration = midi.duration || 1;
    return {
      notes,
      duration,
      perSecond: notes / duration,
      callbacksPerSecond: (2 * notes) / duration,
      tracks: midi.tracks.length,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

const HARNESS = `
(() => {
  if (window.__PERF) return;
  try {
  const perf = {
    starts: [],          // lead (s) de cada AudioBufferSourceNode.start con tiempo explícito
    nowStarts: 0,        // arranques "ya mismo" (sin tiempo)
    longTasks: [],       // duración (ms) de cada long task
    frames: [],          // separación entre frames (ms)
    mutations: 0,
    mutationBatches: 0,
  };
  window.__PERF = perf;

  const origStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
    try {
      perf.ctx = this.context;
      if (typeof when === "number" && when > 0) {
        perf.starts.push(when - this.context.currentTime);
      } else {
        perf.nowStarts++;
      }
    } catch {}
    return origStart.call(this, when, offset, duration);
  };

  window.__PERF_CLOCK = () => (perf.ctx ? perf.ctx.currentTime : null);

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {}

  let lastFrame = performance.now();
  const frameTick = () => {
    const now = performance.now();
    perf.frames.push(now - lastFrame);
    lastFrame = now;
    requestAnimationFrame(frameTick);
  };
  requestAnimationFrame(frameTick);

  let batchTimer = null;
  const observeDom = () => {
    if (!document.documentElement) {
      requestAnimationFrame(observeDom);
      return;
    }
    new MutationObserver((records) => {
      perf.mutations += records.length;
      if (batchTimer === null) {
        batchTimer = setTimeout(() => { perf.mutationBatches++; batchTimer = null; }, 0);
      }
    }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
  };
  observeDom();

  window.__PERF_RESET = () => {
    perf.starts.length = 0;
    perf.longTasks.length = 0;
    perf.frames.length = 0;
    perf.mutations = 0;
    perf.mutationBatches = 0;
    perf.nowStarts = 0;
  };
  window.__PERF_SNAP = () => ({ ...perf, starts: [...perf.starts], longTasks: [...perf.longTasks], frames: [...perf.frames] });
  } catch (err) {
    window.__PERF_ERROR = String(err && err.stack ? err.stack : err);
  }
})();
`;

const pct = (sorted, p) =>
  sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(20000);
await page.addInitScript(HARNESS);

// A/B de los extras del Studio (avatar, partículas): se pasan como preferencias
// ya guardadas en localStorage para poder medir su costo real.
const prefs = process.env.PMP_PERF_PREFS;
if (prefs) {
  await page.addInitScript((raw) => {
    const values = JSON.parse(raw);
    for (const [k, v] of Object.entries(values)) {
      window.localStorage.setItem(k, JSON.stringify(v));
    }
  }, prefs);
  console.log(`[perf] preferencias forzadas: ${prefs}`);
}

await page.goto("http://localhost:1234/");
await page.waitForSelector(".pm-bar, .studio-workspace", { timeout: 25000 });

const harnessError = await page.evaluate(() => window.__PERF_ERROR ?? null);
if (harnessError) {
  console.log("[harness] error al instalar la instrumentación:\n" + harnessError);
  process.exitCode = 1;
}

// Carga por el input del Studio y arranca con el botón de la barra (mismo motor
// que usa cualquier camino de reproducción de canción).
const titulo = fixture.split("/").pop().replace(/\.[^.]+$/, "");
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(fixture);
await page.waitForFunction(
  (t) => (document.querySelector(".title-container p")?.textContent || "").includes(t),
  titulo,
  { timeout: 30000 },
);
await page.waitForTimeout(1500);
await page.locator(".pm-bar__transport .pm-tbtn--solid").click();
await page.waitForFunction(
  () => Number(document.querySelector(".pm-bar__range")?.value ?? 0) > 0.5,
  { timeout: 45000 },
);
// Dejar que los samples terminen de bajar: lo que se mide es la saturación del
// hilo, no la ventana de precarga.
await page.waitForTimeout(8000);

const audioClock = () => page.evaluate(() => window.__PERF_SNAP());
const displayedSeconds = () =>
  page.evaluate(() => {
    const text = (document.querySelector(".time-display")?.textContent || "0:00").trim();
    const [m, s] = text.split("/")[0].trim().split(":").map(Number);
    return (m || 0) * 60 + (s || 0);
  });

await page.evaluate(() => window.__PERF_RESET());
const shownAtStart = await displayedSeconds();
const audioAtStart = await page.evaluate(() => window.__PERF_CLOCK());

await page.waitForTimeout(seconds * 1000);

const snap = await audioClock();
const shownAtEnd = await displayedSeconds();
const audioAtEnd = await page.evaluate(() => window.__PERF_CLOCK());

const leads = snap.starts.slice().sort((a, b) => a - b);
const late = leads.filter((v) => v < 0);
const longTasks = snap.longTasks.slice().sort((a, b) => a - b);
const frames = snap.frames.slice().sort((a, b) => a - b);
const totalLong = longTasks.reduce((a, b) => a + b, 0);
const notesPerSec = snap.starts.length / seconds;
const shownAdvance = shownAtEnd - shownAtStart;
const audioAdvance =
  audioAtStart !== null && audioAtEnd !== null ? audioAtEnd - audioAtStart : null;

console.log(`\n================ PERF ${label} ================`);
console.log(`archivo : ${fixture}`);
console.log(`ventana : ${seconds}s de reproducción`);
const density = fixtureDensity(fixture);
console.log(
  density.error
    ? `partitura: (no se pudo leer: ${density.error})`
    : `partitura: ${density.notes} notas en ${density.duration.toFixed(0)}s (${density.tracks} pistas) → ${density.perSecond.toFixed(1)} notas/s = ${density.callbacksPerSecond.toFixed(1)} callbacks de Transport.schedule por segundo`,
);
console.log(`notas   : ${snap.starts.length} arranques de sample (${notesPerSec.toFixed(1)}/s) + ${snap.nowStarts} sin tiempo explícito`);
console.log(`\n-- jitter de AudioBufferSourceNode.start (s) --`);
console.log(`  tarde (<0)      : ${late.length} de ${leads.length} (${((late.length / Math.max(1, leads.length)) * 100).toFixed(1)} %)`);
console.log(`  peor atraso     : ${late.length ? (late[0] * 1000).toFixed(1) : "0"} ms`);
console.log(`  p50 / p95 / max : ${(pct(leads, 0.5) * 1000).toFixed(1)} / ${(pct(leads, 0.95) * 1000).toFixed(1)} / ${(leads[leads.length - 1] * 1000).toFixed(1)} ms`);
console.log(`\n-- hilo principal --`);
console.log(`  long tasks >50ms: ${longTasks.length} (total ${totalLong.toFixed(0)} ms, peor ${longTasks.length ? longTasks[longTasks.length - 1].toFixed(0) : 0} ms, media ${longTasks.length ? (totalLong / longTasks.length).toFixed(0) : 0} ms)`);
console.log(`  frames          : peor hueco ${frames.length ? frames[frames.length - 1].toFixed(0) : 0} ms | p95 ${pct(frames, 0.95).toFixed(1)} ms | media ${(frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length)).toFixed(1)} ms (~${(1000 / (frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length))).toFixed(0)} fps)`);
console.log(`  huecos >100 ms  : ${frames.filter((f) => f > 100).length}`);
console.log(`\n-- React / DOM --`);
console.log(`  mutaciones      : ${snap.mutations} (${(snap.mutations / seconds).toFixed(0)}/s) en ${snap.mutationBatches} lotes`);
console.log(`\n-- reloj visible --`);
console.log(`  .time-display avanzó ${shownAdvance}s`);
console.log(`  reloj de audio avanzó ${audioAdvance === null ? "n/d" : audioAdvance.toFixed(1) + "s"} → deriva ${audioAdvance === null ? "n/d" : (shownAdvance - audioAdvance).toFixed(1) + "s"}`);

await browser.close();
