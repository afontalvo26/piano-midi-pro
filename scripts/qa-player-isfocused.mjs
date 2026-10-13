// ============================================================
// qa-player-isfocused.mjs — ¿el bug depende de que la pestaña esté VISIBLE?
//
// HIPÓTESIS: el reloj del host (`PlayerEngineHost.startClock`) y el de la barra
// (`PlayerBar`) usan `requestAnimationFrame`. En una pestaña OCULTA el navegador
// estrangula los rAF (a ~0 Hz), pero el reloj de `Tone.Transport` corre en un
// WORKER y sigue agendando notas. Resultado esperado si la hipótesis es cierta:
//   · el audio sigue sonando y la canción avanza,
//   · `getPosition()` (que lee `Tone.Transport.ticks`) avanza,
//   · el reloj y el scrubber de la barra quedan congelados donde estaban.
//
// CÓMO SE MIDE: se abre el reproductor y se le da play. Después se ABRE OTRA
// PESTAÑA y se la trae al frente (la del reproductor queda oculta). Desde Node se
// sigue leyendo el estado de la pestaña oculta con `evaluate`, que funciona igual.
// Al final se vuelve a traer el reproductor al frente y se ve si se recupera solo.
//
// Uso: node scripts/qa-player-isfocused.mjs
// ============================================================
import { chromium } from "playwright";

const BASE = "http://localhost:1235/";
const SONG = "El Osito Dormilón";

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

const player = await browser.newPage({ viewport: { width: 1600, height: 900 } });
player.setDefaultTimeout(30000);
await player.addInitScript(TAP);

const sample = (page) =>
  page.evaluate(() => {
    const central = document.querySelector(".pm-bar__transport button:nth-child(3)");
    const range = document.querySelector(".pm-bar__range");
    const db = window.__RMS ? window.__RMS() : null;
    return {
      visible: document.visibilityState,
      boton: central?.getAttribute("aria-label") ?? "?",
      paused: window.__PMP_PLAYER__?.getSnapshot().paused ?? null,
      reloj: (document.querySelector(".pm-bar__time")?.textContent || "?").trim(),
      seeker: range ? Number(Number(range.value).toFixed(2)) : null,
      relleno: document.querySelector(".pm-bar__fill")?.style.width ?? "?",
      db: db === null ? null : Number(db.toFixed(1)),
      pos: Number(window.__PLAYER__.position().toFixed(2)),
      motor: window.__PLAYER__.host.isPlaying,
    };
  });

const line = (label, s) =>
  console.log(
    `  ${label.padEnd(26)} vis=${(s.visible ?? "?").padEnd(7)} botón=${s.boton.padEnd(10)} paused=${String(s.paused).padEnd(5)} reloj=${s.reloj.padEnd(5)} seeker=${String(s.seeker).padStart(6)} relleno=${String(s.relleno).padStart(8)} motor=${String(s.motor).padEnd(5)} pos=${String(s.pos).padStart(6)} db=${String(s.db).padStart(8)}`,
  );

console.log("\n=== ¿el bug depende de que la pestaña esté visible? ===");
await player.goto(BASE, { waitUntil: "domcontentloaded" });
await player.waitForSelector(".pm-bar", { timeout: 30000 });
await player.waitForFunction(
  () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
  null,
  { timeout: 150000 },
);
await player.waitForTimeout(1500);
await player.bringToFront();

// ── 1. Play con la pestaña AL FRENTE ────────────────────────────────────────
await player.locator('.rail-item[title="Música — tu reproductor"]').click();
await player.waitForTimeout(700);
await player
  .locator('.pm-shelf')
  .filter({ hasText: "Vallenato" })
  .locator(".pm-card__info")
  .filter({ hasText: SONG })
  .first()
  .click();
await player.waitForTimeout(9000);
console.log("\n--- 1. reproduciendo con la pestaña AL FRENTE ---");
line("al frente", await sample(player));
const front = await sample(player);

// ── 2. Otra pestaña al frente: el reproductor queda OCULTO ──────────────────
console.log("\n--- 2. se abre otra pestaña (el reproductor queda OCULTO) ---");
const other = await browser.newPage({ viewport: { width: 800, height: 600 } });
await other.goto("about:blank");
await other.bringToFront();
await player.waitForTimeout(1500);
line("oculta +1,5 s", await sample(player));
await player.waitForTimeout(6000);
line("oculta +7,5 s", await sample(player));
const hidden = await sample(player);
await player.waitForTimeout(6000);
line("oculta +13,5 s", await sample(player));
const hidden2 = await sample(player);
await other.screenshot({ path: ".logs/qa/player-vs-piano/isfocused-otra-pestana.png" });

// ── 3. Volver a traer el reproductor al frente ──────────────────────────────
console.log("\n--- 3. el reproductor vuelve AL FRENTE ---");
await player.bringToFront();
await player.waitForTimeout(1500);
line("al frente +1,5 s", await sample(player));
await player.waitForTimeout(4000);
line("al frente +5,5 s", await sample(player));
const back = await sample(player);

// ── Veredicto ───────────────────────────────────────────────────────────────
console.log("\n=== VEREDICTO ===");
const avanzandoOculto = hidden2.pos > hidden.pos + 1;
const relojCongeladoOculto = hidden2.reloj === hidden.reloj;
const seekerCongeladoOculto = hidden2.seeker === hidden.seeker;
const audioOculto = (hidden.db ?? -999) > -40;
console.log(`  con la pestaña oculta: audio=${audioOculto} (${hidden.db} dB) · position() avanza=${avanzandoOculto} (${hidden.pos} → ${hidden2.pos}) · reloj congelado=${relojCongeladoOculto} (${hidden.reloj} → ${hidden2.reloj}) · seeker congelado=${seekerCongeladoOculto} (${hidden.seeker} → ${hidden2.seeker})`);
console.log(`  al volver al frente: reloj=${back.reloj} seeker=${back.seeker} (¿se recupera? ${back.seeker !== hidden2.seeker || back.reloj !== hidden2.reloj})`);
console.log(`  isPlaying con la pestaña oculta: botón="${hidden.boton}" paused=${hidden.paused} motor=${hidden.motor}`);
console.log(
  `\n  → ${audioOculto && avanzandoOculto && (relojCongeladoOculto || seekerCongeladoOculto) ? "CONFIRMADO: el reloj de la barra depende del rAF y se congela en una pestaña oculta" : "NO se confirma la hipótesis con esta corrida"}`,
);
void front;

await browser.close();
