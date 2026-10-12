// ¿Queda audio sonando al cambiar de canción / detener? Mide la salida real.
import { chromium } from "playwright";

const TAP = `
(() => {
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
const page = await browser.newPage();
page.setDefaultTimeout(20000);
await page.addInitScript(TAP);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".studio-workspace, .pm-bar", { timeout: 25000 });

const rms = async (samples = 8) => {
  let best = -Infinity;
  for (let i = 0; i < samples; i++) {
    const v = await page.evaluate(() => window.__RMS());
    if (v !== null && v > best) best = v;
    await page.waitForTimeout(120);
  }
  return best;
};

const upload = async (path) => {
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(path);
  await page.waitForFunction(
    () => Number(document.querySelector(".pm-bar input[type=range], .seeker-container input[type=range]")?.max ?? 0) > 0,
    { timeout: 30000 },
  );
  await page.waitForTimeout(1200);
};

console.log("=== 1. canción A ===");
await upload("app/public/demo/Bolero_-_Besame_Mucho.kar");
await page.locator('.pm-bar button[aria-label="Reproducir"]').first().click();
await page.waitForTimeout(12000);
console.log(`   A sonando: ${(await rms()).toFixed(1)} dB`);

console.log("=== 2. cambio a canción B (sin detener) ===");
await upload("app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar");
await page.waitForTimeout(2000);
const trasCambio = await rms();
console.log(`   salida tras el cambio: ${trasCambio.toFixed(1)} dB`);

console.log("=== 3. DETENER y medir silencio ===");
const stop = page.locator('button:has-text("Detener")').first();
if (await stop.count()) {
  await stop.click();
} else {
  const pausa = page.locator('.pm-bar button[aria-label="Pausar"]').first();
  if (await pausa.count()) await pausa.click();
}
await page.waitForTimeout(2500);
const trasDetener = await rms(12);
console.log(`   salida 2.5 s después de Detener: ${trasDetener.toFixed(1)} dB`);
console.log(
  trasDetener > -70
    ? `   ⚠️  BUG: quedan notas sonando (${trasDetener.toFixed(1)} dB, debería ser silencio digital)`
    : "   ✓ silencio digital: no queda nada sonando",
);

console.log("=== 4. reproducir B y volver a A (ida y vuelta) ===");
await page.locator('.pm-bar button[aria-label="Reproducir"]').first().click();
await page.waitForTimeout(8000);
console.log(`   B sonando: ${(await rms()).toFixed(1)} dB`);
await upload("app/public/demo/Salsa_-_Pedro_Navaja.mid");
await page.waitForTimeout(2500);
console.log(`   salida tras cambiar a C: ${(await rms()).toFixed(1)} dB`);

await page.screenshot({ path: ".logs/qa/11-tras-cambio.png" });
await browser.close();
