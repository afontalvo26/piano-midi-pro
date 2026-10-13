// ============================================================
// qa-player-isplaying.mjs — ¿en qué CAMINO de arranque `isPlaying` se cae mientras
// el audio sigue sonando?
//
// SÍNTOMA REPORTADO: la canción suena y `position()` avanza, pero `isPlaying` del
// `PlayerContext` queda en false. Consecuencias: el botón central vuelve a
// "Reproducir", el scrubber queda congelado en 0 y el reloj de la barra en "0:00"
// (la barra pinta UNA vez cuando `isPlaying` es false, y pinta con la posición de
// ese instante; después nadie la repinta porque su rAF sólo corre reproduciendo).
//
// CÓMO LO MIDE: envuelve los métodos del motor (`play`/`pause`/`stop`/`seek`/`load`)
// para registrar quién los llama y cuándo, y muestrea el `aria-label` del botón
// central, `store.getSnapshot().paused`, el reloj, el seeker, el RMS real y la
// posición imperativa. Recorre TODOS los caminos de arranque por separado:
//
//   tarjeta     · click en una tarjeta de Música (playTrack → loadEntry(true))
//   pausa+barra · pausa y reanudar con el botón central (PlayerContext.play())
//   importar    · input de archivo (loadTrack + play())
//   siguiente   · botón siguiente (setIndex → loadEntry(true))
//   repetir-uno · repetir en "one" (fin de canción → play(0))
//
// Veredicto mecánico por camino: hay BUG si en algún momento hay señal > -40 dB con
// el store en pausa (`isPlaying === false`).
//
// Uso: node scripts/qa-player-isplaying.mjs
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

/**
 * Espía del motor + contador de montajes.
 *
 * `subscribe` se llama UNA vez por montaje de `usePlayerEngineHost`: si sube, el
 * árbol de React se volvió a montar (lo que resetea el estado del `PlayerProvider`
 * —incluido `isPlaying`— MIENTRAS el motor sigue sonando, porque el motor es un
 * singleton de módulo que sobrevive al remontaje).
 */
const SPY = `
(() => {
  window.__CALLS = [];
  window.__MOUNTS = 0;
  const log = (name, extra) =>
    window.__CALLS.push({ at: Math.round(performance.now()), name, extra: extra ?? null });
  window.__SPY = () => {
    const host = window.__PLAYER__ && window.__PLAYER__.host;
    if (!host || host.__spied) return Boolean(host);
    host.__spied = true;
    const originalSubscribe = host.subscribe.bind(host);
    host.subscribe = (listener) => {
      window.__MOUNTS += 1;
      log("subscribe", window.__MOUNTS);
      return originalSubscribe(listener);
    };
    for (const name of ["play", "pause", "stop", "seek", "load"]) {
      const original = host[name].bind(host);
      host[name] = (...args) => {
        log(name, name === "load" ? args[0] && args[0].trackId : args[0]);
        return original(...args);
      };
    }
    return true;
  };
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
page.on("console", (m) => {
  if (m.type() === "error") console.log(`  [consola] ${m.text().slice(0, 140)}`);
});
page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 200)}`));
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) console.log(`  [navegación/HMR] ${f.url().slice(0, 60)}`);
});
await page.addInitScript(TAP);
await page.addInitScript(SPY);

const sample = () =>
  page.evaluate(() => {
    const central = document.querySelector(".pm-bar__transport button:nth-child(3)");
    const range = document.querySelector(".pm-bar__range");
    const db = window.__RMS ? window.__RMS() : null;
    return {
      boton: central?.getAttribute("aria-label") ?? "?",
      paused: window.__PMP_PLAYER__?.getSnapshot().paused ?? null,
      reloj: (document.querySelector(".pm-bar__time")?.textContent || "?").trim(),
      seeker: range ? Number(Number(range.value).toFixed(2)) : null,
      relleno: document.querySelector(".pm-bar__fill")?.style.width ?? "?",
      db: db === null ? null : Number(db.toFixed(1)),
      pos: Number(window.__PLAYER__.position().toFixed(2)),
      motor: window.__PLAYER__.host.isPlaying,
      titulo: (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
    };
  });

let lastCallIndex = 0;

/**
 * Observa durante `ms` y devuelve el veredicto del camino.
 *
 * EL INVARIANTE QUE IMPORTA (el bug reportado): **nunca puede haber señal audible
 * con `isPlaying` en false**. Si el audio suena, el botón tiene que decir "Pausar"
 * y la posición tiene que avanzar. Lo contrario —silencio con el botón en
 * "Reproducir"— es un estado válido (es una pausa).
 */
async function watch(label, ms, expectPlaying = true) {
  console.log(`\n  --- ${label} ---`);
  const series = [];
  let previous = null;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    let s;
    try {
      s = await sample();
    } catch (error) {
      // El contexto de la página murió (HMR por una edición en app/src).
      console.log(`    [contexto perdido] ${String(error).split("\n")[0].slice(0, 90)}`);
      break;
    }
    series.push(s);
    const key = `${s.boton}|${s.paused}|${s.reloj}|${s.seeker}|${s.motor}|${s.db !== null && s.db > -60}`;
    if (key !== previous) {
      previous = key;
      console.log(
        `    botón=${s.boton.padEnd(10)} paused=${String(s.paused).padEnd(5)} reloj=${s.reloj.padEnd(5)} seeker=${String(s.seeker).padStart(6)} relleno=${String(s.relleno).padStart(8)} motor=${String(s.motor).padEnd(5)} pos=${String(s.pos).padStart(6)} db=${String(s.db).padStart(8)}`,
      );
    }
    await page.waitForTimeout(100);
  }
  const calls = await page.evaluate(() => window.__CALLS).catch(() => []);
  const fresh = calls.slice(lastCallIndex);
  lastCallIndex = calls.length;
  if (fresh.length > 0) {
    console.log(
      `    llamadas al motor: ${fresh.map((c) => `${c.name}(${c.extra === null ? "" : JSON.stringify(c.extra)})`).join(", ")}`,
    );
  }
  const withAudio = series.filter((s) => s.db !== null && s.db > -40);
  const audioPaused = withAudio.filter((s) => s.paused === true);
  const audioNotPlaying = withAudio.filter((s) => s.motor === false);
  const advanced =
    series.length > 4 && series[series.length - 1].pos > series[1].pos + 0.3;
  const botonFinal = series[series.length - 1]?.boton ?? "?";

  console.log(
    `    → filas con audio (>-40 dB): ${withAudio.length} · con store en pausa: ${audioPaused.length} · con transporte parado: ${audioNotPlaying.length}`,
  );
  let ok = true;
  if (audioPaused.length > 0) {
    const first = audioPaused[0];
    console.log(
      `    ✗ BUG: audio con isPlaying=false. botón="${first.boton}" reloj=${first.reloj} seeker=${first.seeker} relleno=${first.relleno} pos=${first.pos} db=${first.db}`,
    );
    ok = false;
  } else {
    console.log("    ✓ sin audio con isPlaying=false (el invariante se cumple)");
  }
  if (audioNotPlaying.length > 0) {
    console.log(`    ✗ BUG: hay audio con el transporte parado (${audioNotPlaying.length} filas)`);
    ok = false;
  }
  if (expectPlaying) {
    if (withAudio.length <= 3) {
      console.log("    ✗ BUG: este camino tenía que dejar audio sonando y no suena");
      ok = false;
    }
    if (!advanced) {
      console.log("    ✗ BUG: el audio suena pero `position()` NO avanza");
      ok = false;
    }
    if (botonFinal !== "Pausar") {
      console.log(
        `    ✗ BUG: con audio sonando el botón central dice "${botonFinal}" (debería decir "Pausar")`,
      );
      ok = false;
    }
  }
  return { audioPaused: audioPaused.length, botonFinal, advanced, ok };
}

// ── Preparación: catálogo completo y espía instalado ─────────────────────────
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 30000 });
await page.waitForFunction(
  () => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) > 140,
  null,
  { timeout: 150000 },
);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__SPY());
console.log(`\n=== isPlaying vs audio · todos los caminos ===`);

// ── 1. Tarjeta de Música ────────────────────────────────────────────────────
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(700);
await page
  .locator('.pm-shelf')
  .filter({ hasText: "Vallenato" })
  .locator(".pm-card__info")
  .filter({ hasText: SONG })
  .first()
  .click();
const p1 = await watch("1 · tarjeta de Música (playTrack)", 12000);

// ── 2. Pausa + botón central (PlayerContext.play()) ─────────────────────────
await page.locator('.pm-bar__transport button[aria-label="Pausar"]').click();
await page.waitForTimeout(1500);
await page.locator('.pm-bar__transport button[aria-label="Reproducir"]').click();
const p2 = await watch("2 · pausa + reanudar con el botón central", 10000);

// ── 3. Siguiente (setIndex → loadEntry) ─────────────────────────────────────
await page.locator('.pm-bar__transport button[aria-label="Canción siguiente"]').click();
const p3 = await watch("3 · Canción siguiente", 10000);

// ── 4. Importar un MIDI (loadTrack + play()) ────────────────────────────────
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForTimeout(1200);
await page
  .locator('[aria-label="Subir tu propio MIDI"] input[type=file]')
  .setInputFiles("app/public/demo/Bolero_-_Besame_Mucho.kar");
const p4 = await watch("4 · importar un MIDI (loadTrack + play())", 14000);

// ── 5. Detener por la UI (el camino del reproductor) y volver con el botón ───
//
// NO se llama a `host.stop()` a mano: eso dejaría al `PlayerContext` sin enterarse
// (es su estado el que se mide). El camino real de "detener" en el reproductor es
// pausar y volver a arrancar, que ya cubre el paso 2.
console.log("\n--- 5. pausa y reanudación larga (10 s en pausa) ---");
await page.locator('.pm-bar__transport button[aria-label="Pausar"]').click();
await page.waitForTimeout(10000);
const longPause = await sample();
console.log(
  `  en pausa 10 s: botón=${longPause.boton} paused=${longPause.paused} reloj=${longPause.reloj} db=${longPause.db} pos=${longPause.pos}`,
);
await page.locator('.pm-bar__transport button[aria-label="Reproducir"]').click();
const p5 = await watch("5 · reanudar tras 10 s en pausa", 12000);

// ── 6. DOBLE CLICK en la misma tarjeta durante el arranque (el bug reportado) ──
//
// `TrackCard` (app/src/components/library/TrackCard.tsx:38-41) hace `toggle()` si
// la tarjeta pulsada YA es la activa. La canción queda activa al instante de
// encolarla, pero el transporte tarda segundos en frío: el segundo click llega
// cuando el `play()` todavía está esperando samples. Ahí `pause()` tiene que
// cancelar ese arranque; si no, el audio arranca igual con `isPlaying` en false.
//
// Se usa una canción TODAVÍA NO CARGADA (otra estantería) para que la ventana de
// precarga exista de verdad: con el motor caliente el primer click arranca en
// menos de 400 ms y el segundo click sería una pausa legítima, que no prueba nada.
console.log("\n--- 6. doble click en la misma tarjeta durante el arranque ---");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(700);
const coldCard = page
  .locator('.pm-shelf')
  .filter({ hasText: "Boleros" })
  .locator(".pm-card__info")
  .filter({ hasText: "Solamente Una Vez" })
  .first();
await coldCard.click();
// Sin esperar: el segundo click cae mientras el motor todavía baja samples.
await page.waitForTimeout(300);
await coldCard.click();
const p6 = await watch("6 · misma tarjeta dos veces (toggle durante la carga)", 16000, false);

// ── 7. El control se recupera: un click más tiene que dejar todo consistente ──
await page.locator('.pm-bar__transport button[aria-label="Reproducir"]').click();
const p7 = await watch("7 · un click más en el botón central", 14000);

const mounts = await page.evaluate(() => window.__MOUNTS).catch(() => -1);
const timings = await page
  .evaluate(() => window.__PLAYER__.startTimings())
  .catch(() => ({}));
console.log(`\n=== montajes del hook del motor (host.subscribe): ${mounts} ===`);
console.log(`=== desglose del arranque (ms desde el play): ${JSON.stringify(timings)} ===`);

const paths = [
  ["1 tarjeta", p1],
  ["2 pausa+reanudar", p2],
  ["3 siguiente", p3],
  ["4 importar", p4],
  ["5 pausa larga", p5],
  ["6 doble click", p6],
  ["7 recuperación", p7],
];
console.log("\n=== VEREDICTO ===");
for (const [name, p] of paths) {
  console.log(
    `  ${p.ok ? "OK   " : "FALLA"} ${name.padEnd(18)} audio-con-pausa=${p.audioPaused} botón="${p.botonFinal}" position avanza=${p.advanced}`,
  );
}
const bugs = paths.filter(([, p]) => !p.ok);
if (mounts !== 1) console.log(`  FALLA montajes del motor: ${mounts} (esperado 1)`);
console.log(
  `\n  ${bugs.length === 0 && mounts === 1 ? "TODO OK: en ningún camino el audio suena con isPlaying en false" : `${bugs.length} camino(s) con bug`}`,
);

await browser.close();
process.exit(bugs.length === 0 && mounts === 1 ? 0 : 2);
