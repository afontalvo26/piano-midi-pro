// Mide la imagen estéreo real: correlación L/R y balance por canal.
// Una mezcla toda al centro da correlación ≈ 1.0; con paneo baja.
import { chromium } from "playwright";
import path from "node:path";

const FILE = path.join(
  process.cwd(),
  process.argv[2] ?? "app/public/demo/Bolero_-_Besame_Mucho.kar",
);

const TAP = `
(() => {
  let left = null, right = null, bufL = null, bufR = null;
  const ensure = (ctx) => {
    if (left) return;
    // Tone envuelve el contexto: createChannelSplitter sólo existe en el nativo.
    const raw = ctx.rawContext ?? ctx;
    const splitter = raw.createChannelSplitter(2);
    left = raw.createAnalyser(); right = raw.createAnalyser();
    left.fftSize = 4096; right.fftSize = 4096;
    // Los analizadores tienen que llegar al destino (aunque sea con ganancia 0)
    // o el grafo no los procesa y devuelven silencio.
    const sink = raw.createGain();
    sink.gain.value = 0.000001;
    sink.connect(raw.destination);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    left.connect(sink);
    right.connect(sink);
    console.log("[tap] splitter+analizadores creados");
    bufL = new Float32Array(left.fftSize);
    bufR = new Float32Array(right.fftSize);
    // La fuente se conecta AL SPLITTER (no al analizador): sin este return el
    // connect recibía undefined y fallaba.
    return splitter;
  };
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target && target.constructor && String(target.constructor.name).includes("Destination")) {
      try { origConnect.call(this, ensure(this.context.rawContext ?? this.context)); } catch (e) { console.log("[tap] error", String(e)); }
    }
    return origConnect.call(this, target, ...rest);
  };
  window.__STEREO = () => {
    if (!left) return null;
    left.getFloatTimeDomainData(bufL);
    right.getFloatTimeDomainData(bufR);
    let sl = 0, sr = 0, slr = 0;
    for (let i = 0; i < bufL.length; i++) {
      sl += bufL[i] * bufL[i];
      sr += bufR[i] * bufR[i];
      slr += bufL[i] * bufR[i];
    }
    const rmsL = Math.sqrt(sl / bufL.length);
    const rmsR = Math.sqrt(sr / bufR.length);
    const corr = slr / Math.sqrt((sl * sr) || 1e-12);
    return { rmsL, rmsR, corr };
  };
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const pans = [];
page.on("console", (m) => {
  const t = m.text();
  if (t.includes("paneo") || t.includes("[tap]")) pans.push(t.slice(0, 90));
  if (t.includes("[fuentes]") && t.includes("→")) pans.push(t.slice(0, 90));
});

await page.addInitScript(TAP);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".studio-workspace", { timeout: 20000 });
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FILE);
await page.waitForFunction(
  () => Number(document.querySelector(".seeker-container input[type=range]")?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.locator(".playback-bar .btn.primary").first().click();

console.log("t(s) |  RMS L |  RMS R | desbalance | correlación");
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(i === 0 ? 8000 : 4000);
  const s = await page.evaluate(async () => {
    let best = null;
    for (let k = 0; k < 10; k++) {
      const v = window.__STEREO();
      if (v && (!best || v.rmsL + v.rmsR > best.rmsL + best.rmsR)) best = v;
      await new Promise((r) => setTimeout(r, 80));
    }
    const t = document.querySelector(".seeker-container input[type=range]");
    return { ...best, t: Number(t?.value ?? 0) };
  });
  if (!s || s.rmsL === undefined) {
    console.log("(sin audio todavía)");
    continue;
  }
  const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : "-inf");
  const balance = (20 * Math.log10((s.rmsL + 1e-9) / (s.rmsR + 1e-9))).toFixed(1);
  console.log(
    `${s.t.toFixed(1).padStart(5)} | ${db(s.rmsL).padStart(6)} | ${db(s.rmsR).padStart(6)} | ${balance.padStart(9)} dB | ${s.corr.toFixed(3)}`,
  );
}

console.log("\n--- paneos aplicados ---");
[...new Set(pans)].slice(0, 12).forEach((p) => console.log("  " + p));

await browser.close();
