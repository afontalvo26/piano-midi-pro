// Prueba objetiva: ¿se crea algún oscilador durante la reproducción?
// Un sample real no crea osciladores; un sintetizador sí.
import { chromium } from "playwright";
import path from "node:path";

const FILE = path.join(
  process.cwd(),
  process.argv[2] ?? "app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar",
);

const INSTRUMENT = `
(() => {
  const counts = { osc: 0, buffer: 0, started: 0 };
  window.__SYNTH_COUNTS = counts;
  const proto = AudioContext.prototype;
  const o = proto.createOscillator;
  proto.createOscillator = function (...a) { counts.osc++; return o.apply(this, a); };
  const b = proto.createBufferSource;
  proto.createBufferSource = function (...a) { counts.buffer++; return b.apply(this, a); };
  const start = AudioScheduledSourceNode.prototype.start;
  AudioScheduledSourceNode.prototype.start = function (...a) { counts.started++; return start.apply(this, a); };
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
const warns = [];
page.on("console", (m) => {
  const t = m.text();
  if (/fuentes|ruteo|sin sample real|se saltea|sintetiz|GMSampler|WebAudioFont|DrumKit|tonejs|vsco|ButtonAccordion|acorde/i.test(t)) {
    warns.push(t.slice(0, 170));
  }
});

await page.addInitScript(INSTRUMENT);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".studio-workspace", { timeout: 20000 });
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FILE);
await page.waitForFunction(
  () => Number(document.querySelector(".seeker-container input[type=range]")?.max ?? 0) > 0,
  { timeout: 40000 },
);

const btn = page.locator(".playback-bar .btn.primary").first();
const t0 = Date.now();
await btn.click();
// Cuánto tarda en arrancar (espera de samples) y si el botón avisa.
await page.waitForFunction(
  () => document.querySelector(".playback-bar .btn.primary")?.textContent?.includes("Pausa"),
  { timeout: 60000 },
);
console.log(`arrancó la reproducción en ${Date.now() - t0} ms`);

await page.waitForTimeout(30000);

const counts = await page.evaluate(() => window.__SYNTH_COUNTS);
console.log("osciladores creados:", counts.osc, "  (0 = ningún sonido electrónico)");
console.log("buffer sources creados:", counts.buffer);
console.log("fuentes iniciadas:", counts.started);

const seeker = await page.locator(".seeker-container input[type=range]").inputValue();
console.log("avance de la canción:", seeker, "s");

console.log("\n--- avisos de ruteo/síntesis ---");
console.log([...new Set(warns)].slice(0, 40).join("\n") || "(ninguno)");

await browser.close();
