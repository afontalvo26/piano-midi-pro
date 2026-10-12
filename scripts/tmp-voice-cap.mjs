// ¿Cuántas notas se piden y cuántas fuentes arrancan? Si arrancan menos, el
// techo de 32 voces está cortando notas.
import { readFileSync } from "node:fs";
import { Midi } from "../app/node_modules/@tonejs/midi/dist/Midi.js";
import { chromium } from "playwright";

const rel = process.argv[2] ?? "app/public/demo/BinomioDeOro_-_Mix.kar";
const buf = readFileSync(rel);
const midi = new Midi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const WINDOW = 30; // segundos
let scheduled = 0;
let percussive = 0;
const concurrent = [];
for (const t of midi.tracks) {
  if (t.notes.length === 0) continue;
  const isDrum = t.channel === 9;
  for (const n of t.notes) {
    if (n.time > WINDOW) continue;
    if (isDrum) percussive++;
    else scheduled++;
  }
}
// Solapamiento máximo de notas melódicas (para saber si 32 voces alcanzan).
const events = [];
for (const t of midi.tracks) {
  if (t.notes.length === 0 || t.channel === 9) continue;
  for (const n of t.notes) {
    if (n.time > WINDOW) continue;
    events.push([n.time, 1], [n.time + Math.max(0.04, n.duration), -1]);
  }
}
events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
let live = 0;
let peak = 0;
for (const [, d] of events) {
  live += d;
  if (live > peak) peak = live;
}

console.log(`archivo: ${rel}`);
console.log(`notas melódicas en los primeros ${WINDOW}s: ${scheduled}`);
console.log(`golpes de percusión en los primeros ${WINDOW}s: ${percussive}`);
console.log(`máximo de notas melódicas SONANDO a la vez: ${peak}`);

const INSTRUMENT = `
(() => {
  window.__STARTS = 0;
  const orig = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { window.__STARTS++; return orig.apply(this, a); };
})();
`;
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.addInitScript(INSTRUMENT);
await page.goto("http://localhost:1234/");
await page.waitForSelector(".studio-workspace", { timeout: 20000 });
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(rel);
await page.waitForFunction(
  () => Number(document.querySelector(".seeker-container input[type=range]")?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.locator(".playback-bar .btn.primary").first().click();
await page.waitForFunction(
  () => Number(document.querySelector(".seeker-container input[type=range]")?.value ?? 0) > 1,
  { timeout: 60000 },
);
await page.evaluate(() => (window.__STARTS = 0));
await page.waitForTimeout(WINDOW * 1000);
const starts = await page.evaluate(() => window.__STARTS);

console.log(`fuentes de audio arrancadas en esos ${WINDOW}s: ${starts}`);
console.log(
  `esperado ≈ ${scheduled + percussive} (melódicas + percusión) → ${
    starts < (scheduled + percussive) * 0.85 ? "⚠ SE ESTÁN PERDIENDO NOTAS" : "✓ completa"
  }`,
);

await browser.close();
