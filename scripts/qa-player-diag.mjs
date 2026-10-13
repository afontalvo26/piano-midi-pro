// ============================================================
// qa-player-diag.mjs — diagnóstico puntual de tres dudas del QA de paridad:
//   1. ¿qué suena después de cambiar de canción si no quedan voces?
//   2. ¿qué pasa al silenciar TODAS las pistas?
//   3. ¿cuáles son los recursos que fallan (404 / ERR_FILE_NOT_FOUND)?
//
// Muestrea cada 250 ms: RMS, voces vivas, estado del transporte, canción cargada.
// Uso: node scripts/qa-player-diag.mjs
// ============================================================
import { chromium } from "playwright";

const TAP = `
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

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
await page.addInitScript(TAP);

// ── Recursos que fallan, con su URL ──────────────────────────────────────────
const failed = [];
page.on("requestfailed", (r) =>
  failed.push(`${r.failure()?.errorText ?? "?"} ${r.url().slice(0, 140)}`),
);
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`);
});

const sample = () =>
  page.evaluate(() => {
    const db = window.__RMS ? window.__RMS() : null;
    const voices = window.__PLAYER__ ? window.__PLAYER__.soundingVoices() : {};
    const total = Object.values(voices).reduce((n, v) => n + v.length, 0);
    return {
      db: db === null ? null : Number(db.toFixed(1)),
      voices: total,
      playing: window.__PLAYER__ ? window.__PLAYER__.host.isPlaying : null,
      songId: window.__PLAYER__ ? window.__PLAYER__.loadedSongId() : null,
      pos: window.__PLAYER__
        ? Number(window.__PLAYER__.position().toFixed(2))
        : null,
      status: (document.querySelector(".status-pill")?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48),
    };
  });

async function trace(label, ms, everyMs = 250) {
  console.log(`\n--- ${label} (${ms} ms) ---`);
  const end = Date.now() + ms;
  let last = "";
  while (Date.now() < end) {
    const s = await sample();
    const line = `t=${String(Math.round((Date.now() - (end - ms)) / 100) / 10).padStart(5)}s db=${String(s.db).padStart(8)} voces=${String(s.voices).padStart(3)} transport=${s.playing ? "on " : "off"} pos=${String(s.pos).padStart(7)} "${s.status}"`;
    if (line.slice(10) !== last.slice(10)) {
      console.log("  " + line);
      last = line;
    }
    await page.waitForTimeout(everyMs);
  }
}

const playCard = async (shelf, title) => {
  await page
    .locator(".pm-shelf")
    .filter({ hasText: shelf })
    .locator(".pm-card__info")
    .filter({ hasText: title })
    .first()
    .click();
};

await page.goto("http://localhost:1235/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 30000 });
await page.waitForFunction(() => document.querySelectorAll(".pm-card").length > 0, null, {
  timeout: 90000,
});

// ── 1. Cambio de canción ─────────────────────────────────────────────────────
await playCard("Vallenato", "El Osito Dormilón");
await page.waitForTimeout(9000);
await page.evaluate(() => window.__PLAYER__.host.seek(30));
await trace("A sonando (El Osito Dormilón, desde 30 s)", 2500);

console.log("\n>>> click en la tarjeta \"Bésame Mucho\" (cambio de canción)");
await playCard("Boleros", "Bésame Mucho");
await trace("DESPUÉS del cambio de canción", 12000);
await page.screenshot({ path: ".logs/qa/player-vs-piano/diag-tras-cambio.png" });

// ── 2. Silenciar todas las pistas ────────────────────────────────────────────
console.log("\n=== MEZCLADOR: silenciar todas las pistas ===");
await page.locator('.rail-item[title="Pistas"]').click();
await page.waitForTimeout(1000);
await trace("antes de silenciar", 2500);
const mix = await page.evaluate(() => ({
  tracks: document.querySelectorAll(".track-item-card").length,
  volumes: [...document.querySelectorAll(".track-volume-block span")].map((e) => e.textContent.trim()),
}));
console.log("  pistas:", mix.tracks, "volúmenes:", mix.volumes.join(" "));
const muteButtons = page.locator(".btn-mute-solo", { hasText: "Silencio" });
const count = await muteButtons.count();
for (let i = 0; i < count; i++) await muteButtons.nth(i).click();
console.log(`  ${count} pistas silenciadas`);
const activeMute = await page.evaluate(
  () => document.querySelectorAll(".btn-mute-solo.active-mute").length,
);
console.log(`  botones con .active-mute: ${activeMute}`);
await trace("TODAS las pistas en Silencio", 9000);

// ── 3. Recursos que fallan ───────────────────────────────────────────────────
console.log("\n=== RECURSOS QUE FALLAN ===");
const unique = [...new Set(failed)];
console.log(`  ${unique.length} únicos`);
for (const f of unique.slice(0, 30)) console.log("  " + f);

await browser.close();
