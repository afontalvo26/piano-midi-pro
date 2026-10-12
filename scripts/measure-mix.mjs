// Diagnóstico: mide el AUDIO de salida a lo largo de la canción.
// Intercepta la conexión al destination e inserta un analizador, así se ve si
// el nivel sube, si aparece clipping, si se ensucia el espectro o si hay huecos.
import { chromium } from "playwright";
import path from "node:path";

const FILE = path.join(
  process.cwd(),
  process.argv[2] ?? "app/public/demo/BinomioDeOro_-_Mix.kar",
);

const TAP = `
(() => {
  window.__AUDIO_TAP = { rms: [], peak: [], centroid: [], clipped: 0, samples: 0 };
  let analyser = null;
  let buf = null;
  let freq = null;
  let audioCtx = null;

  const ensure = (ctx) => {
    if (analyser) return analyser;
    audioCtx = ctx;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    freq = new Uint8Array(analyser.frequencyBinCount);
    // El analizador no necesita salir a ningún lado para procesar.
    window.__AUDIO_TAP.analyser = analyser;
    return analyser;
  };

  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    const ctx = this.context;
    if (target && target.constructor && target.constructor.name === "AudioDestinationNode") {
      try {
        const a = ensure(ctx);
        // Conectar al analizador es seguro: no tiene salida al hardware.
        origConnect.call(this, a);
      } catch (e) { /* ignore */ }
    }
    return origConnect.call(this, target, ...rest);
  };

  window.__SAMPLE_AUDIO = () => {
    const t = window.__AUDIO_TAP;
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0, peak = 0, clipped = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.995) clipped++;
    }
    analyser.getByteFrequencyData(freq);
    let num = 0, den = 0;
    for (let i = 0; i < freq.length; i++) {
      const mag = freq[i] / 255;
      const hz = (i * (audioCtx?.sampleRate ?? 44100)) / 2 / freq.length;
      num += hz * mag;
      den += mag;
    }
    t.clipped += clipped;
    t.samples++;
    return {
      rms: Math.sqrt(sum / buf.length),
      peak,
      clipped,
      centroid: den > 0 ? num / den : 0,
    };
  };
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.addInitScript(TAP);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".studio-workspace", { timeout: 20000 });
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FILE);
await page.waitForFunction(
  () => Number(document.querySelector(".seeker-container input[type=range]")?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.locator(".playback-bar .btn.primary").first().click();
await page.waitForTimeout(5000);

console.log("t(s) |  RMS dB |  peak | clip | centroide Hz");
const rows = [];
for (let i = 0; i < 10; i++) {
  // Promedio de ~12 muestras en 1.2 s para que no lo domine un instante.
  const stats = await page.evaluate(async () => {
    let rms = 0, peak = 0, clip = 0, cen = 0, n = 0;
    for (let k = 0; k < 12; k++) {
      const s = window.__SAMPLE_AUDIO();
      if (s) { rms += s.rms; peak = Math.max(peak, s.peak); clip += s.clipped; cen += s.centroid; n++; }
      await new Promise((r) => setTimeout(r, 100));
    }
    const t = document.querySelector(".seeker-container input[type=range]");
    return {
      t: Number(t?.value ?? 0),
      rms: n ? rms / n : 0,
      peak, clip, cen: n ? cen / n : 0,
    };
  });
  rows.push(stats);
  const db = stats.rms > 0 ? (20 * Math.log10(stats.rms)).toFixed(1) : "-inf";
  console.log(
    `${stats.t.toFixed(1).padStart(5)} | ${db.padStart(7)} | ${stats.peak.toFixed(2).padStart(5)} | ${String(stats.clip).padStart(4)} | ${Math.round(stats.cen)}`,
  );
}

const first = rows.slice(0, 2).reduce((a, r) => a + r.rms, 0) / 2;
const last = rows.slice(-2).reduce((a, r) => a + r.rms, 0) / 2;
console.log(
  `\ntendencia: ${(20 * Math.log10(last / (first || 1e-9))).toFixed(1)} dB entre el inicio y el final`,
);
console.log("clipping total:", rows.reduce((a, r) => a + r.clip, 0));

await browser.close();
