/**
 * diag-retumbe-sombra.mjs — el retumbe grave del acordeón, medido en la SALIDA.
 *
 * ── QUÉ MIDE ───────────────────────────────────────────────────────────────
 *
 * Captura PCM CONTINUO de la salida real del piano (analizador enganchado a la
 * entrada del Volume maestro de Tone, que es el último nodo antes del hardware)
 * y reporta la energía por banda. La que importa es **30–200 Hz**: ahí no se oye
 * altura, se oye retumbe.
 *
 * ── POR QUÉ HAY QUE RECORTAR EL ARCHIVO ────────────────────────────────────
 *
 * La pista del problema es la del canal 6 (MTrk#7): prog 21 = Accordion, 1.910
 * notas, MIDI 40–57 (E2..A3). El banco de botones FreePats está grabado de B3 a
 * G6 (MIDI 59–91), así que esas notas se repitchean hasta **19 semitonos abajo**
 * y el retumbe se mezcla con la percusión, el bajo y el pad.
 *
 * Aislar la pista con mute/solo NO sirve: el piano RESETEA mute/solo cada vez que
 * cambia la canción (`setTrackMuted({})` en el efecto que depende de `song`), así
 * que cualquier valor escrito en localStorage antes de cargar el archivo se
 * pierde — y un diagnóstico anterior midió 7 "aislamientos" que en realidad
 * sonaban idénticos (los 7 dieron el mismo número). Por eso acá se recorta el
 * MIDI: se escribe un .kar con UNA sola pista (la que se quiere medir) y se carga
 * ese archivo. El motor, el ruteo, los efectos y el tap son los reales.
 *
 * Casos:
 *   · mezcla            — la canción original completa (control de no romper nada)
 *   · acordeon-grave    — sólo MTrk#7, las 1.910 notas de MIDI 40–57 (el bug)
 *   · acordeon-agudo    — sólo MTrk#3, las 624 notas de MIDI 64–86 (lo que suena bien)
 *
 * Uso:
 *   node scripts/diag-retumbe-sombra.mjs antes
 *   node scripts/diag-retumbe-sombra.mjs despues
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(path.resolve("app", "package.json"));
const { Midi } = require("@tonejs/midi");

const LABEL = process.argv[2] ?? "antes";
const PORT = process.argv[3] ?? "1234";
const RECORD_SEC = Number(process.argv[4] ?? 20);
const SONG = path.join(
  process.cwd(),
  "app/public/demo/BinomioDeOro_-_Sombra_Perdida.kar",
);
const OUTDIR = path.join(process.cwd(), ".logs");
fs.mkdirSync(OUTDIR, { recursive: true });

// ── Recortes: un .kar por pista, con las notas reubicadas al segundo 1 ───────
//
// Las notas se copian en SEGUNDOS (`time`), así que al reencodear quedan en el
// mismo instante aunque el tempo del archivo recortado sea constante.
function trimTrack(srcFile, mtrkIndex, name) {
  const src = new Midi(fs.readFileSync(srcFile));
  const srcTrack = src.tracks[mtrkIndex];
  if (!srcTrack || srcTrack.notes.length === 0) {
    throw new Error(`MTrk#${mtrkIndex} no existe o no tiene notas`);
  }
  const first = Math.min(...srcTrack.notes.map((n) => n.time));
  const shift = first - 1.0; // la música arranca en t = 1,0 s

  const out = new Midi();
  out.header.setTempo(100);
  out.header.name = name;
  const track = out.addTrack();
  track.name = name;
  track.channel = srcTrack.channel;
  track.instrument.number = srcTrack.instrument?.number ?? 0;

  for (const note of srcTrack.notes) {
    track.addNote({
      midi: note.midi,
      time: Math.max(0.05, note.time - shift),
      duration: note.duration,
      velocity: note.velocity,
    });
  }
  // CC7 (nivel) y CC11 (expresión) definen la ganancia de la nota: sin ellos la
  // medición no sería la del archivo original.
  for (const [number, ccs] of Object.entries(srcTrack.controlChanges ?? {})) {
    for (const cc of ccs) {
      if (cc.time - shift < 0) continue;
      track.addCC({
        number: Number(number),
        value: cc.value,
        time: cc.time - shift,
      });
    }
  }

  const file = path.join(OUTDIR, name);
  fs.writeFileSync(file, Buffer.from(out.toArray()));
  const midis = srcTrack.notes.map((n) => n.midi);
  console.log(
    `[recorte] ${name}: MTrk#${mtrkIndex} canal ${srcTrack.channel} prog ${srcTrack.instrument?.number} · ` +
    `${srcTrack.notes.length} notas · MIDI ${Math.min(...midis)}–${Math.max(...midis)} · desplazado ${shift.toFixed(2)} s`,
  );
  return file;
}

const TRIM_GRAVE = trimTrack(SONG, 7, "retumbe-trim-acordeon-grave.kar");
const TRIM_AGUDO = trimTrack(SONG, 3, "retumbe-trim-acordeon-agudo.kar");

const CASES = [
  {
    id: "mezcla",
    file: SONG,
    label: "CANCIÓN COMPLETA (todas las pistas)",
    // La pista grave entra en 8,33 s: se mide de 8,5 s a 8,5+RECORD.
    startAfterSec: 8.5,
  },
  {
    id: "acordeon-grave",
    file: TRIM_GRAVE,
    label: "SOLO ACORDEÓN GRAVE (MTrk#7, MIDI 40–57, 1.910 notas)",
    startAfterSec: 1.2,
  },
  {
    id: "acordeon-agudo",
    file: TRIM_AGUDO,
    label: "SOLO ACORDEÓN AGUDO (MTrk#3, MIDI 64–86, 624 notas)",
    startAfterSec: 1.2,
  },
];

const TAP = `
(() => {
  const T = { ctx: null, an: null, buf: null, on: false, chunks: [], reads: 0, rate: 0, err: null, tap: null };
  window.__T = T;

  // No se puede enganchar "todo lo que salga al destino": el grafo del piano
  // tiene cientos de nodos colgando del destino de Tone y sumaría copias. El
  // punto correcto es la entrada del Volume maestro, el último antes del hardware.
  window.__ARM = () => {
    try {
      const tctx = window.__PMP_TRANSPORT__?.context;
      const raw = tctx?.rawContext ?? tctx?._context;
      if (!raw) { T.err = "sin AudioContext de Tone"; return T.err; }
      const master = tctx?.destination?.input;
      if (!master) { T.err = "sin Volume maestro"; return T.err; }
      T.ctx = raw;
      T.rate = raw.sampleRate;
      const an = raw.createAnalyser();
      an.fftSize = 4096;
      an.smoothingTimeConstant = 0;
      T.an = an;
      T.buf = new Float32Array(an.fftSize);
      T.tap = master.constructor?.name ?? "?";
      master.connect(an);
      T.err = null;
      return { rate: T.rate, state: raw.state, tap: T.tap };
    } catch (e) { T.err = String(e); return T.err; }
  };

  window.__START = () => { T.chunks = []; T.on = true; T.reads = 0; T.lastEnd = -Infinity; };
  window.__STOP = () => {
    T.on = false;
    return { rate: T.rate, reads: T.reads, state: T.ctx?.state, err: T.err, tap: T.tap };
  };

  // Transferencia en base64 por tramos: 20 s de Float32 son 3,8 MB.
  window.__CHUNK = (index, count) => {
    const total = T.chunks.reduce((a, c) => a + c.length, 0);
    const per = Math.ceil(total / count);
    const start = index * per;
    if (start >= total) return "";
    const end = Math.min(total, start + per);
    const out = new Float32Array(end - start);
    let o = 0;
    for (const c of T.chunks) {
      if (o + c.length <= start) { o += c.length; continue; }
      if (o >= end) break;
      const from = Math.max(0, start - o);
      const to = Math.min(c.length, end - o);
      out.set(c.subarray(from, to), o + from - start);
      o += c.length;
    }
    const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(s);
  };

  // Lector continuo: cada 20 ms lee 4096 muestras (85 ms a 48 k) y agrega SÓLO
  // las nuevas, deducidas de contextTime. Así el PCM no tiene huecos ni solapes.
  window.__READ_LOOP = () => {
    const step = () => {
      if (T.on && T.ctx && T.an) {
        try {
          T.an.getFloatTimeDomainData(T.buf);
          const now = T.ctx.currentTime;
          if (T.lastEnd === -Infinity) {
            T.chunks.push(T.buf.slice()); T.lastEnd = now;
          } else {
            const fresh = Math.round((now - T.lastEnd) * T.rate);
            if (fresh > 0) {
              T.chunks.push(T.buf.slice(T.buf.length - Math.min(fresh, T.buf.length)));
              T.lastEnd = now;
            }
          }
          T.reads++;
        } catch (e) { T.err = String(e); }
      }
      setTimeout(step, 20);
    };
    step();
  };
})();
`;

// ── DSP ──────────────────────────────────────────────────────────────────────
function biquadLp(x, sr, cut) {
  const w = (2 * Math.PI * cut) / sr, c = Math.cos(w), s = Math.sin(w);
  const alpha = s / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = ((1 - c) / 2) / a0, b1 = (1 - c) / a0, b2 = ((1 - c) / 2) / a0;
  const a1 = (-2 * c) / a0, a2 = (1 - alpha) / a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/** Pasa-banda por resta de dos pasa-bajos (12 dB/oct). */
function bandpass(x, sr, lo, hi) {
  const a = biquadLp(x, sr, hi), b = biquadLp(x, sr, lo);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = a[i] - b[i];
  return out;
}
const rms = (x) => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
};
const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

/**
 * Reparto de energía por bandas, promediando ventanas de 8192 con Hann: una sola
 * foto depende de dónde cayó la nota.
 */
function spectrumShares(x, sr) {
  const N = 8192;
  if (x.length < N) return null;
  const re = new Float64Array(N), im = new Float64Array(N);
  const pow = new Float64Array(N / 2);
  let windows = 0;
  for (let off = 0; off + N <= x.length; off += N) {
    for (let i = 0; i < N; i++) re[i] = (x[off + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    im.fill(0);
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < N; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
          const ur = re[i + k], ui = im[i + k];
          const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
          const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        }
      }
    }
    for (let i = 1; i < N / 2; i++) pow[i] += re[i] * re[i] + im[i] * im[i];
    windows++;
  }
  if (windows === 0) return null;
  const share = (a, b) => {
    let s = 0;
    for (let i = 1; i < N / 2; i++) {
      const f = (i * sr) / N;
      if (f >= a && f < b) s += pow[i];
    }
    return s;
  };
  let tot = 0;
  for (let i = 1; i < N / 2; i++) tot += pow[i];
  tot = tot || 1e-30;
  return {
    f30_200: +((share(30, 200) / tot) * 100).toFixed(2),
    f200_800: +((share(200, 800) / tot) * 100).toFixed(2),
    f800_4k: +((share(800, 4000) / tot) * 100).toFixed(2),
    f4k: +((share(4000, sr / 2) / tot) * 100).toFixed(2),
    sub30: +((share(0, 30) / tot) * 100).toFixed(2),
  };
}

// ── Playwright ───────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
let logs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/\[fuentes\]|\[ButtonAccordion\]|\[WebAudioFont\]|\[GMSampler\]|\[vsco\]/.test(t)) logs.push(t);
});

await page.addInitScript(TAP);
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".studio-workspace", { timeout: 30000 });

const results = [];
for (const c of CASES) {
  logs = [];
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".studio-workspace", { timeout: 30000 });
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(c.file);
  await page.waitForFunction(
    () => Number(document.querySelector(".seeker-container input[type=range]")?.max ?? 0) > 0,
    { timeout: 60000 },
  );

  // ESPERAR a que los instrumentos resuelvan su fuente ANTES de dar play. Si no,
  // la ventana de medición agarra los primeros compases en silencio (el sampler
  // todavía no existe) y el número cambia de una corrida a otra: se midió
  // -31,1 dB y -32,6 dB en la zona grave del MISMO código por esto.
  const resolved = () => logs.filter((l) => /\[fuentes\] ".*" → /.test(l)).length;
  const deadline = Date.now() + 120_000;
  let estable = 0;
  let anterior = -1;
  while (Date.now() < deadline && estable < 4) {
    await page.waitForTimeout(500);
    const ahora = resolved();
    estable = ahora > 0 && ahora === anterior ? estable + 1 : 0;
    anterior = ahora;
  }
  if (anterior <= 0) {
    console.warn(`[${c.id}] ningún instrumento resolvió fuente en 120 s`);
  }

  await page.locator(".playback-bar .btn.primary").first().click();
  await page.waitForTimeout(1500);
  const arm = await page.evaluate(() => window.__ARM());
  if (arm && typeof arm === "object" && arm.state !== "running") {
    await page.evaluate(() => window.__PMP_TRANSPORT__?.context?.resume?.());
  }
  const extra = Math.max(0, c.startAfterSec - 1.5) * 1000;
  if (extra > 0) await page.waitForTimeout(extra);
  await page.evaluate(() => { window.__READ_LOOP(); window.__START(); });
  await page.waitForTimeout(RECORD_SEC * 1000);
  const dumped = await page.evaluate(() => window.__STOP());
  const seeker = await page.evaluate(
    () => Number(document.querySelector(".seeker-container input[type=range]")?.value ?? 0),
  );
  await page.locator(".playback-bar .btn.primary").first().click().catch(() => {});

  const sr = dumped.rate || 48000;
  const CHUNKS = 12;
  const parts = [];
  for (let i = 0; i < CHUNKS; i++) {
    const b64 = await page.evaluate(([idx, n]) => window.__CHUNK(idx, n), [i, CHUNKS]);
    if (!b64) break;
    parts.push(Buffer.from(b64, "base64"));
  }
  const pcm = Buffer.concat(parts);
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));

  if (!sr || x.length < sr) {
    console.log(`\n[${c.id}] ${c.label}\n   SIN AUDIO (rate=${sr}, muestras=${x.length}, arm=${JSON.stringify(arm)}, err=${dumped.err})`);
    results.push({ case: c.id, label: c.label, ok: false, samples: x.length });
    continue;
  }

  // Se descartan los primeros 0,5 s: el lector puede arrancar con ceros.
  const y = x.subarray(Math.floor(sr * 0.5));
  let peak = 0;
  for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > peak) peak = a; }

  const BANDS = [[30, 200], [30, 60], [60, 120], [120, 200], [200, 800], [800, 4000]];
  const bandRmsDb = {};
  for (const [lo, hi] of BANDS) bandRmsDb[`${lo}_${hi}`] = +db(rms(bandpass(y, sr, lo, hi))).toFixed(2);
  const shares = spectrumShares(y, sr);
  const totalDb = db(rms(y));
  const lowDb = bandRmsDb["30_200"];
  const midDb = bandRmsDb["200_800"];

  const row = {
    case: c.id, label: c.label, ok: true, rate: sr, seconds: +(y.length / sr).toFixed(2),
    seekerAtEnd: seeker, reads: dumped.reads, tap: dumped.tap, peak: +peak.toFixed(4),
    totalDb: +totalDb.toFixed(2), bandRmsDb,
    // Los dos números del informe: cuánto grave hay y cuánto pesa contra el medio
    // (retumbe = grave que tapa al medio).
    lowMinusMidDb: +(lowDb - midDb).toFixed(2),
    lowVsTotalDb: +(lowDb - totalDb).toFixed(2),
    shares,
    logs: [...new Set(logs)],
  };
  results.push(row);

  const wav = Buffer.alloc(44 + y.length * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + y.length * 2, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
  wav.writeUInt32LE(y.length * 2, 40);
  for (let i = 0; i < y.length; i++) {
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(y[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUTDIR, `retumbe-${LABEL}-${c.id}.wav`), wav);

  console.log(
    `\n[${c.id}] ${c.label}  (${row.seconds} s, tap ${dumped.tap}, t final ${seeker.toFixed(1)} s)\n` +
    `   RMS total ${totalDb.toFixed(1)} dB · 30-200 Hz ${lowDb.toFixed(1)} dB · 200-800 Hz ${midDb.toFixed(1)} dB\n` +
    `   grave - medio = ${row.lowMinusMidDb.toFixed(1)} dB   ·   grave - total = ${row.lowVsTotalDb.toFixed(1)} dB   (pico ${peak.toFixed(3)})\n` +
    `   bandas: ${BANDS.map(([lo, hi]) => `${lo}-${hi}: ${bandRmsDb[`${lo}_${hi}`].toFixed(1)}`).join(" · ")}\n` +
    `   reparto FFT: <30 ${shares?.sub30}% · 30-200 ${shares?.f30_200}% · 200-800 ${shares?.f200_800}% · 800-4k ${shares?.f800_4k}% · >4k ${shares?.f4k}%`,
  );
}

console.log("\n=== LOGS [fuentes] DE LA CORRIDA ===");
const uniq = [...new Set(results.flatMap((r) => r.logs ?? []))];
for (const l of uniq) console.log("  " + l);

const outFile = path.join(OUTDIR, `retumbe-${LABEL}.json`);
fs.writeFileSync(outFile, JSON.stringify({ label: LABEL, port: PORT, recordSec: RECORD_SEC, results }, null, 2));
console.log(`\nresultados: ${outFile}\nWAVs: .logs/retumbe-${LABEL}-*.wav`);
await browser.close();
