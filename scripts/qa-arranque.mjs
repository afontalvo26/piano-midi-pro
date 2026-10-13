// ============================================================
// qa-arranque.mjs — ¿cuánto tarda en sonar la canción desde el click?
//
// Mide, con resolución de 200 ms:
//   t0                    click en Reproducir
//   t_transporte          `Tone.Transport.state === "started"` (arrancó la música)
//   t_primer_sonido       primera señal audible en el tap (RMS > -70 dB)
//   t_instrumentos        cuándo se resuelve la carga de samples de la canción
// y registra la línea de tiempo de la píldora de estado (lo que el usuario ve).
//
// Uso: node scripts/qa-arranque.mjs [archivo] [frio|caliente]
// ============================================================
import { chromium } from "playwright";

const fixture =
  process.argv[2] ?? "app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar";
const modo = process.argv[3] ?? "frio";

const HARNESS = `
(() => {
  if (window.__RMS) return;
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
})();
`;

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
await page.addInitScript(HARNESS);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".pm-bar, .studio-workspace", { timeout: 25000 });

const titulo = fixture.split("/").pop().replace(/\.[^.]+$/, "");

const medir = async (etiqueta, recargar) => {
  if (recargar) {
    await page.reload();
    await page.waitForSelector(".studio-workspace", { timeout: 25000 });
  }
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(fixture);
  await page.waitForFunction(
    (t) => (document.querySelector(".title-container p")?.textContent || "").includes(t),
    titulo,
    { timeout: 30000 },
  );
  // Esperar a que la barra tome la canción (sin darle play).
  await page.waitForFunction(
    (t) => (document.querySelector(".pm-bar__title")?.textContent || "").includes(t),
    titulo,
    { timeout: 30000 },
  );

  await page.evaluate(() => {
    window.__STATUS = [];
    const pill = () =>
      (document.querySelector(".status-pill:last-child")?.textContent || "").trim();
    window.__STATUS_TIMER = setInterval(() => {
      const text = pill();
      const last = window.__STATUS[window.__STATUS.length - 1];
      if (!last || last.text !== text) {
        window.__STATUS.push({ at: performance.now(), text });
      }
    }, 100);
  });

  // t0 = el click que dispara el arranque.
  await page.evaluate(() => {
    window.__T0 = performance.now();
  });
  const clickAt = await page.evaluate(() => window.__T0);
  await page.locator(".pm-bar__transport .pm-tbtn--solid").click();
  void clickAt;

  // Sondeo cada 200 ms hasta 20 s: transporte arrancado + primera señal audible.
  const samples = await page.evaluate(async () => {
    const out = { transportAt: null, soundAt: null, max: -Infinity };
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const transport = window.__PMP_TRANSPORT__;
      if (out.transportAt === null && transport && transport.state === "started") {
        out.transportAt = performance.now() - start;
      }
      const db = window.__RMS ? window.__RMS() : null;
      if (db !== null && db > out.max) out.max = db;
      if (out.soundAt === null && db !== null && db > -70) {
        out.soundAt = performance.now() - start;
      }
      if (out.soundAt !== null && out.transportAt !== null) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  });

  const status = await page.evaluate(() => {
    clearInterval(window.__STATUS_TIMER);
    const start = window.__T0 ?? 0;
    return window.__STATUS.map((s) => ({
      ms: Math.round(s.at - start),
      text: s.text,
    }));
  });

  console.log(`\n--- ${etiqueta} ---`);
  console.log(
    `  transporte arrancado : ${samples.transportAt === null ? ">20 s" : Math.round(samples.transportAt) + " ms"}`,
  );
  console.log(
    `  PRIMER SONIDO audible: ${samples.soundAt === null ? ">20 s" : Math.round(samples.soundAt) + " ms"} (pico ${samples.max === -Infinity ? "sin señal" : samples.max.toFixed(1) + " dB"})`,
  );
  console.log(`  píldora de estado:`);
  for (const s of status) console.log(`    ${String(s.ms).padStart(6)} ms  "${s.text}"`);
  return samples;
};

if (modo === "frio") {
  await medir("ARRANQUE EN FRÍO (pestaña nueva, caché vacía)", false);
  // El segundo se mide tras recargar: contexto nuevo de app pero caché HTTP
  // caliente (los samples del CDN ya bajaron una vez) = el "caliente" del QA.
  await medir("ARRANQUE CALIENTE (app recargada, samples en caché)", true);
} else {
  await medir("PLAY CALIENTE (misma pestaña)", false);
}

await page.screenshot({ path: ".logs/qa/17-arranque.png" });
await browser.close();
