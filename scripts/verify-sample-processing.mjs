// Verifica el procesado de samples: sin escalones (clics) y sin cortarse.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:1234/audition.html", { waitUntil: "domcontentloaded" });

const result = await page.evaluate(async () => {
  const mod = await import(/* @vite-ignore */ "/src/engine/sampleProcessing.ts");
  const ctx = new OfflineAudioContext(1, 1024, 44100);

  /** Mayor salto entre muestras consecutivas (un clic es un salto grande). */
  const maxStep = (data, from, to) => {
    let worst = 0;
    for (let i = Math.max(1, from); i < Math.min(data.length, to); i++) {
      const d = Math.abs(data[i] - data[i - 1]);
      if (d > worst) worst = d;
    }
    return worst;
  };

  const decode = async (url, noteRegex) => {
    const res = await fetch(url);
    const text = await res.text();
    const m = text.match(noteRegex);
    const binary = atob(m[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return ctx.decodeAudioData(bytes.buffer);
  };

  const out = {};

  // 1. Soundfont GM (acordeón): 3.15 s, sostenido → debe extenderse.
  const acc = await decode(
    "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/accordion-ogg.js",
    /"C4"\s*:\s*"data:[^"]+;base64,([^"]+)"/,
  );
  const accProcessed = mod.prepareSampleBuffer(acc, "Accordion");
  const accRawData = acc.getChannelData(0);
  const accData = accProcessed.getChannelData(0);
  out.accordion = {
    durBefore: Number(acc.duration.toFixed(2)),
    durAfter: Number(accProcessed.duration.toFixed(2)),
    stepAtEndBefore: Number(maxStep(accRawData, accRawData.length - 200, accRawData.length).toFixed(4)),
    stepAtEndAfter: Number(maxStep(accData, accData.length - 200, accData.length).toFixed(4)),
    stepAtStartBefore: Number(maxStep(accRawData, 0, 200).toFixed(4)),
    stepAtStartAfter: Number(maxStep(accData, 0, 200).toFixed(4)),
    // Salto máximo en la costura del loop (donde empalma con el original).
    stepAtSeam: Number(maxStep(accData, Math.floor(acc.sampleRate * 2.9), Math.floor(acc.sampleRate * 3.4)).toFixed(4)),
  };

  // 2. Un instrumento que DECAE (piano): no debe extenderse.
  const piano = await decode(
    "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_grand_piano-ogg.js",
    /"C4"\s*:\s*"data:[^"]+;base64,([^"]+)"/,
  );
  const pianoProcessed = mod.prepareSampleBuffer(piano, "Acoustic Grand Piano");
  out.piano = {
    durBefore: Number(piano.duration.toFixed(2)),
    durAfter: Number(pianoProcessed.duration.toFixed(2)),
    extended: pianoProcessed.duration > piano.duration + 0.01,
  };

  // 3. ¿Qué instrumentos considera sostenidos?
  out.sustained = {
    strings: mod.isSustainedInstrument("String Ensemble 1"),
    accordion: mod.isSustainedInstrument("Accordion"),
    trumpet: mod.isSustainedInstrument("Trumpet"),
    pad: mod.isSustainedInstrument("Pad 2 (warm)"),
    piano: mod.isSustainedInstrument("Acoustic Grand Piano"),
    guitar: mod.isSustainedInstrument("Acoustic Guitar (nylon)"),
  };

  return out;
});

console.log("=== ACORDEÓN (soundfont GM, sostenido) ===");
console.log("duración:", result.accordion.durBefore, "s →", result.accordion.durAfter, "s");
console.log(
  "escalón al final:  antes",
  result.accordion.stepAtEndBefore,
  "→ después",
  result.accordion.stepAtEndAfter,
);
console.log(
  "escalón al inicio: antes",
  result.accordion.stepAtStartBefore,
  "→ después",
  result.accordion.stepAtStartAfter,
);
console.log("escalón en la costura del loop:", result.accordion.stepAtSeam);

console.log("\n=== PIANO (decae: no debe extenderse) ===");
console.log("duración:", result.piano.durBefore, "→", result.piano.durAfter, "| extendido:", result.piano.extended);
console.log("\n=== clasificación ===", result.sustained);

await browser.close();
