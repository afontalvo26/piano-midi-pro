// ============================================================
// qa-player-paridad.mjs — paridad funcional del reproductor (1235).
//
// Mide, contra la UI REAL (no contra el motor por dentro):
//   1. play / pausa                  · el audio sube y se congela la posición
//   2. detener                       · silencio y cero voces colgadas
//   3. seeker (arrastre del rango)   · la posición salta y el audio sigue
//   4. siguiente / anterior          · cambia de canción y suena
//   5. aleatorio / repetir / auto    · el estado de la barra cambia
//   6. ver la cola                   · el panel real se abre con sus filas
//   7. silenciar / volumen           · RMS medido en dBFS
//   8. cambio de canción             · RMS vuelve a < -70 dB y 0 voces
//   9. pestaña Canciones             · la biblioteca del piano
//  10. tarjetas de Música            · encolan y suenan
//  11. mezclador por pista           · volumen / mute / solo / instrumento
//  12. canción de referencia         · Bolero RMS > -30 dB, 0 errores de consola
//
// El RMS se mide con un tap sobre `AudioNode.prototype.connect` cuando el destino
// es `AudioDestinationNode` (el mismo instrumento con el que se midió el piano en
// `docs/qa-reproductor.md`).
//
// Uso: node scripts/qa-player-paridad.mjs
// ============================================================
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";

const BASE = "http://localhost:1235/";
const OUT = ".logs/qa/player-vs-piano";
const SONG = "El Osito Dormilón";
const REFERENCE_DEMO = "Bolero_-_Besame_Mucho.kar";

mkdirSync(OUT, { recursive: true });

/**
 * Huella del árbol de `app/src` que el reproductor IMPORTA.
 *
 * Para qué: mientras esta suite corre, otro proceso puede estar editando esos
 * módulos. El reproductor los importa, así que Vite recarga la pestaña por HMR a
 * mitad de la medición — Playwright lo reporta como "Execution context was
 * destroyed" y los números dejan de ser comparables. Con la huella antes y después
 * se puede afirmar si la corrida fue sobre un árbol QUIETO.
 */
const APP_MODULES = [
  "app/src/music/PlayerContext.tsx",
  "app/src/music/libraryStore.ts",
  "app/src/music/resolve.ts",
  "app/src/music/useMediaSession.ts",
  "app/src/components/player/PlayerSection.tsx",
  "app/src/components/player/PlayerBar.tsx",
  "app/src/components/library/MusicScreen.tsx",
  "app/src/components/songs/SongLibrary.tsx",
  "app/src/engine/instrumentSources.ts",
  "app/src/audio/audioTiming.ts",
];

function appTreeStamp() {
  const hash = createHash("sha256");
  for (const file of APP_MODULES) {
    try {
      hash.update(readFileSync(file));
    } catch {
      hash.update("?");
    }
    try {
      hash.update(String(statSync(file).mtimeMs));
    } catch {
      /* archivo ausente: ya contado arriba */
    }
  }
  return hash.digest("hex").slice(0, 16);
}

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
  // Cuenta fuentes ARRANCADAS y PARADAS: detecta notas colgadas.
  window.__SRC = { start: 0, stop: 0 };
  const startOrig = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    window.__SRC.start++; return startOrig.apply(this, a);
  };
  const stopOrig = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (...a) {
    window.__SRC.stop++; return stopOrig.apply(this, a);
  };
})();
`;

const errors = [];
const results = [];
function record(name, ok, evidence) {
  results.push({ name, ok, evidence });
  console.log(`  ${ok === true ? "OK  " : ok === "skip" ? "—   " : "FALLA"} ${name} — ${evidence}`);
}

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(30000);
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Con el ORIGEN: así se distingue un error propio de un 404 de CDN externo.
  errors.push(`${m.text().slice(0, 120)} ← ${m.location()?.url?.slice(0, 90) ?? "-"}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
// Una recarga a mitad de la corrida (HMR de Vite) o un cierre del renderer se
// reporta como tal, en vez de aparecer como "el control no respondió".
page.on("crash", () => errors.push("page crash: el renderer se cerró"));
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) errors.push(`navegación a ${frame.url().slice(0, 80)}`);
});
await page.addInitScript(TAP);

/**
 * Errores de consola que el PIANO también produce, medidos con el mismo
 * instrumento (`scripts/qa-player-consola.mjs`):
 *   · el CDN de webaudiofont no tiene ese soundfont y devuelve 404 (las dos URLs,
 *     surikov.github.io y cdn.jsdelivr.net);
 *   · el artefacto del MediaSession se arma con un `blob:` que Chromium no logra
 *     leer en el entorno headless (`ERR_FILE_NOT_FOUND`).
 * Ninguno de los dos es del reproductor y no se pueden evitar sin cambiar el motor
 * ni el hook del piano, que están fuera de alcance.
 */
const KNOWN_EXTERNAL_ERRORS = [
  // Las dos URLs del soundfont que falta (surikov.github.io y cdn.jsdelivr.net).
  // Se busca un trozo corto a propósito: el mensaje de consola se registra
  // truncado y una coincidencia larga no matchea.
  "FluidR3_GM_sf2",
  "ERR_FILE_NOT_FOUND",
];

/** Espera a que el catálogo esté COMPLETO (no sólo con la primera tarjeta). */
async function waitForCatalog(expected = 157) {
  await page.waitForFunction(
    (n) => (window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0) >= n,
    expected,
    { timeout: 150000 },
  );
  // Un respiro para que se asiente el último render antes de interactuar.
  await page.waitForTimeout(1500);
}

/** Promedio/pico de RMS durante `ms`, muestreado cada 120 ms. */
async function measureRms(ms = 1500) {
  return page.evaluate(async (duration) => {
    const samples = [];
    const end = performance.now() + duration;
    while (performance.now() < end) {
      const db = window.__RMS ? window.__RMS() : null;
      if (db !== null) samples.push(db);
      await new Promise((r) => setTimeout(r, 120));
    }
    const finite = samples.filter((v) => Number.isFinite(v));
    return {
      n: samples.length,
      max: finite.length ? Math.max(...finite) : -Infinity,
      average: finite.length
        ? finite.reduce((a, b) => a + b, 0) / finite.length
        : -Infinity,
      silent: samples.every((v) => !Number.isFinite(v) || v < -70),
    };
  }, ms);
}

/**
 * Muestreo continuo: devuelve la serie de RMS y datos de voces mientras corre.
 *
 * Es lo que permite distinguir "el audio de la canción anterior se cortó" de "la
 * canción nueva tiene un intro en silencio": con la serie se ve el hueco.
 */
async function trace(ms, everyMs = 100) {
  return page.evaluate(
    async ([duration, step]) => {
      const series = [];
      const end = performance.now() + duration;
      while (performance.now() < end) {
        series.push({
          at: Math.round(performance.now()),
          db: window.__RMS ? window.__RMS() : null,
          voices: Object.values(window.__PLAYER__.soundingVoices()).reduce(
            (n, v) => n + v.length,
            0,
          ),
          playing: window.__PLAYER__.host.isPlaying,
        });
        await new Promise((r) => setTimeout(r, step));
      }
      const finite = series.map((s) => s.db).filter((v) => Number.isFinite(v));
      return {
        series,
        min: finite.length ? Math.min(...finite) : -Infinity,
        max: finite.length ? Math.max(...finite) : -Infinity,
        firstAudibleAt:
          series.find((s) => Number.isFinite(s.db) && s.db > -70)?.at ?? null,
        startAt: series[0].at,
      };
    },
    [ms, everyMs],
  );
}

/** Espera a que el RMS supere `threshold` dB, con tope. */
async function waitForSound(threshold = -50, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const db = await page.evaluate(() => (window.__RMS ? window.__RMS() : null));
    if (db !== null && db > threshold) return { heard: true, ms: Date.now() - started, db };
    await page.waitForTimeout(250);
  }
  return { heard: false, ms: Date.now() - started, db: null };
}

const bar = {
  title: () => page.locator(".pm-bar__title").innerText(),
  artist: () => page.locator(".pm-bar__artist").innerText(),
  clock: () => page.locator(".pm-bar__time").first().innerText(),
  seeker: () =>
    page.evaluate(() => {
      const el = document.querySelector(".pm-bar__range");
      return el ? { value: Number(el.value), max: Number(el.max), disabled: el.disabled } : null;
    }),
  transport: (label) => page.locator(`.pm-bar__transport button[aria-label="${label}"]`),
  voices: () => page.evaluate(() => window.__PLAYER__.soundingVoices()),
  position: () => page.evaluate(() => window.__PLAYER__.position()),
};

async function playCard(title) {
  await page
    .locator(".pm-shelf")
    .filter({ hasText: "Vallenato" })
    .locator(".pm-card__info")
    .filter({ hasText: title })
    .first()
    .click();
  await page.waitForFunction(
    (t) => (document.querySelector(".pm-bar__title")?.textContent || "").includes(t),
    title,
    { timeout: 40000 },
  );
}

console.log("\n=== 1. Arranque y catálogo ===");
const stampAtStart = appTreeStamp();
console.log(`  huella de app/src al empezar: ${stampAtStart}`);
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 30000 });
await page.waitForFunction(() => document.querySelectorAll(".pm-card").length > 0, null, {
  timeout: 120000,
});
await waitForCatalog();
const catalog = await page.evaluate(() => ({
  cards: document.querySelectorAll(".pm-card").length,
  shelves: document.querySelectorAll(".pm-shelf").length,
  navItems: document.querySelectorAll(".pm-nav__item").length,
  tracks: window.__PMP_PLAYER__?.getSnapshot().library.trackOrder.length ?? 0,
}));
record(
  "catálogo de Música cargado",
  catalog.cards === 33 && catalog.shelves === 4,
  `${catalog.cards} tarjetas en ${catalog.shelves} estanterías (el piano mide 33 en 4) · ${catalog.tracks} canciones en la biblioteca · ${catalog.navItems} entradas de navegación`,
);

console.log("\n=== 2. Tarjeta de Música: encola y suena ===");
await playCard(SONG);
const firstSound = await waitForSound(-50);
const rmsPlaying = await measureRms(2500);
record(
  "tarjeta de Música reproduce",
  firstSound.heard && rmsPlaying.max > -30,
  `primer sonido a ${firstSound.ms} ms · RMS pico ${rmsPlaying.max.toFixed(1)} dB (prom ${rmsPlaying.average.toFixed(1)})`,
);
record(
  "la barra sigue la canción",
  (await bar.title()).includes(SONG) && (await bar.artist()).includes("Binomio"),
  `"${await bar.title()}" · "${await bar.artist()}" · reloj ${await bar.clock()}`,
);

console.log("\n=== 3. Pausa ===");
await bar.transport("Pausar").click();
await page.waitForTimeout(700);
const pausedRms = await measureRms(2200);
const pausedPos1 = await bar.position();
await page.waitForTimeout(1800);
const pausedPos2 = await bar.position();
record(
  "pausa corta el audio y congela la posición",
  pausedRms.silent && Math.abs(pausedPos2 - pausedPos1) < 0.25,
  `RMS ${pausedRms.max.toFixed(1)} dB (silencio=${pausedRms.silent}) · posición ${pausedPos1.toFixed(2)} s → ${pausedPos2.toFixed(2)} s tras 1,8 s`,
);
record(
  "el botón cambia a Reproducir",
  (await page.locator('.pm-bar__transport button[aria-label="Reproducir"]').count()) === 1,
  `aria-label del botón central: "${await page.locator(".pm-bar__transport button").nth(2).getAttribute("aria-label")}"`,
);

console.log("\n=== 4. Reanudar ===");
await bar.transport("Reproducir").click();
const resumed = await waitForSound(-50);
record("reanudar vuelve a sonar", resumed.heard, `señal a ${resumed.ms} ms`);

console.log("\n=== 5. Seeker: arrastre real del rango ===");
const before = await bar.seeker();
const box = await page.locator(".pm-bar__range").boundingBox();
// Arrastre real: pointerdown al 20 %, mover al 70 %, soltar.
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(1200);
const after = await bar.seeker();
record(
  "arrastrar el seeker mueve la posición",
  after.value > before.value + 30,
  `${before.value.toFixed(1)} s → ${after.value.toFixed(1)} s de ${after.max.toFixed(1)} s (arrastre del 20 % al 70 %)`,
);
const afterSeek = await measureRms(2000);
record(
  "tras el seek sigue sonando",
  afterSeek.max > -30,
  `RMS pico ${afterSeek.max.toFixed(1)} dB`,
);

console.log("\n=== 6. Siguiente / anterior ===");
// OJO CON LA VENTANA DE MEDICIÓN: las canciones de este catálogo arrancan con
// 2-5 s de silencio propio (el QA del piano lo documenta: en el Bolero la primera
// nota está en 2,40 s y las melódicas en 4,79 s). Medir 2 s justo después de
// cambiar de canción mide el INTRO, no el motor. Por eso se espera señal con
// tope y recién ahí se mide nivel.
const titleBefore = await bar.title();
await bar.transport("Canción siguiente").click();
await page.waitForFunction(
  (t) => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== t,
  titleBefore,
  { timeout: 25000 },
);
const nextSound = await waitForSound(-50, 25000);
const rmsNext = await measureRms(2500);
const titleAfterNext = await bar.title();
record(
  "siguiente cambia de canción y vuelve a sonar",
  titleAfterNext !== titleBefore && nextSound.heard,
  `"${titleBefore}" → "${titleAfterNext}" · primera señal a ${nextSound.ms} ms del click · RMS pico ${rmsNext.max.toFixed(1)} dB`,
);

// Anterior: con la posición por debajo de 3 s (RESTART_THRESHOLD) vuelve a la ranura previa.
await page.evaluate(() => window.__PLAYER__.host.seek(1));
await page.waitForTimeout(400);
await bar.transport("Canción anterior").click();
await page.waitForFunction(
  (t) => (document.querySelector(".pm-bar__title")?.textContent || "").includes(t),
  titleBefore,
  { timeout: 25000 },
);
const prevSound = await waitForSound(-50, 25000);
const rmsPrev = await measureRms(2500);
const titleAfterPrev = await bar.title();
record(
  "anterior vuelve a la canción previa y vuelve a sonar",
  titleAfterPrev === titleBefore && prevSound.heard,
  `"${titleAfterNext}" → "${titleAfterPrev}" (esperado "${titleBefore}") · primera señal a ${prevSound.ms} ms · RMS pico ${rmsPrev.max.toFixed(1)} dB`,
);

console.log("\n=== 7. Aleatorio / repetir / auto ===");
const shuffle = page.locator('.pm-bar button[title="Aleatorio (S)"]');
const sq0 = await shuffle.getAttribute("aria-pressed");
await shuffle.click();
const sq1 = await shuffle.getAttribute("aria-pressed");
await shuffle.click();
const sq2 = await shuffle.getAttribute("aria-pressed");
record(
  "aleatorio conmuta",
  sq0 === "false" && sq1 === "true" && sq2 === "false",
  `aria-pressed ${sq0} → ${sq1} → ${sq2}, con la clase is-active acompañando`,
);

const repeat = page.locator(".pm-bar .pm-repeat");
const rp0 = await repeat.getAttribute("aria-label");
await repeat.click();
const rp1 = await repeat.getAttribute("aria-label");
await repeat.click();
const rp2 = await repeat.getAttribute("aria-label");
await repeat.click();
const rp3 = await repeat.getAttribute("aria-label");
record(
  "repetir cicla los tres estados",
  rp0 === "Activar repetición" && rp1 === "Repetir una canción" && rp2 === "Desactivar repetición" && rp3 === "Activar repetición",
  `${rp0} → ${rp1} → ${rp2} → ${rp3}`,
);

const auto = page.locator('.pm-bar button[title="Al terminar la cola, seguir con radio del artista"]');
const au0 = await auto.getAttribute("aria-pressed");
await auto.click();
const au1 = await auto.getAttribute("aria-pressed");
await auto.click();
record("auto (radio al terminar) conmuta", au0 !== au1, `aria-pressed ${au0} → ${au1} → ${await auto.getAttribute("aria-pressed")}`);

console.log("\n=== 8. Ver la cola ===");
const queueBtn = page.locator('.pm-bar button[title="Ver la cola (Q)"]');
await queueBtn.click();
await page.waitForTimeout(900);
const drawer = await page.evaluate(() => {
  const aside = document.querySelector('aside.pm-drawer[aria-label="Cola de reproducción"]');
  return aside
    ? {
        rows: aside.querySelectorAll(".pm-queue__row, .pm-drawer__row, li").length,
        text: (aside.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
      }
    : null;
});
record(
  "el panel de la cola se abre con sus filas",
  Boolean(drawer && drawer.rows > 5),
  drawer ? `${drawer.rows} filas · "${drawer.text}"` : "no apareció el panel",
);
await page.screenshot({ path: `${OUT}/paridad-cola.png` });
await queueBtn.click();
await page.waitForTimeout(600);

console.log("\n=== 9. Silenciar / volumen ===");
const rmsBeforeMute = await measureRms(1800);
await page.locator('.pm-bar button[aria-label="Silenciar"]').click();
await page.waitForTimeout(700);
const rmsMuted = await measureRms(2200);
record(
  "silenciar baja el audio medido",
  rmsBeforeMute.max > -40 && rmsMuted.max < rmsBeforeMute.max - 20,
  `RMS pico ${rmsBeforeMute.max.toFixed(1)} → ${rmsMuted.max.toFixed(1)} dB (${(rmsBeforeMute.max - rmsMuted.max).toFixed(1)} dB de caída) · aria-label del botón ahora "${await page.locator(".pm-bar__volume button").first().getAttribute("aria-label")}"`,
);
await page.locator('.pm-bar button[aria-label="Activar sonido"]').click();
await page.waitForTimeout(700);

const volRange = page.locator(".pm-bar__volume-range");
await volRange.focus();
await page.keyboard.press("Home");
await page.waitForTimeout(700);
const rmsVolMin = await measureRms(1800);
await page.keyboard.press("End");
await page.waitForTimeout(700);
const rmsVolMax = await measureRms(1800);
record(
  "volumen cambia la salida medida",
  rmsVolMax.max > rmsVolMin.max + 15,
  `RMS pico ${rmsVolMin.max.toFixed(1)} dB en el mínimo → ${rmsVolMax.max.toFixed(1)} dB en el máximo (${(rmsVolMax.max - rmsVolMin.max).toFixed(1)} dB)`,
);

/**
 * Recupera la página si el contexto de ejecución murió.
 *
 * PASA DE VERDAD Y NO ES DEL REPRODUCTOR: mientras esta suite corre, otro proceso
 * puede estar editando `app/src` (el reproductor importa esos módulos), y Vite
 * recarga la pestaña por HMR. Playwright lo reporta como "Execution context was
 * destroyed". Se recarga, se espera el catálogo y la sección siguiente sigue
 * midiendo en vez de arrastrar el fallo.
 */
async function reloadIfContextDied(error) {
  const message = String(error);
  if (!/Execution context was destroyed|Target closed|crash/i.test(message)) {
    return false;
  }
  console.log("  (el contexto de la página murió — probable HMR por una edición en app/src; se recarga)");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pm-bar", { timeout: 30000 });
  await waitForCatalog();
  return true;
}

/** Corre una sección: un fallo del arnés no se lleva puestas las que siguen. */
async function section(title, fn) {
  console.log(`\n=== ${title} ===`);
  try {
    await fn();
  } catch (error) {
    const recovered = await reloadIfContextDied(error);
    record(
      `${title} · sección completa`,
      false,
      `${recovered ? "el contexto murió (HMR) y se recargó; " : ""}no se pudo completar el arnés: ${String(error).split("\n")[0].slice(0, 160)}`,
    );
  }
}

await section("10. Cambio de canción: ¿queda audio de la anterior?", async () => {
  // CÓMO SE MIDE ESTO SIN ENGAÑARSE
  // Después del click, la canción NUEVA va a sonar, así que comparar "RMS antes vs
  // después" mide la canción nueva, no el residuo de la vieja. Lo que prueba que la
  // anterior se cortó es el HUECO: entre que se suelta la vieja y que entra la
  // primera nota de la nueva, el nivel tiene que caer por debajo de -70 dB.
  await page.evaluate(() => window.__PLAYER__.host.seek(30));
  await page.waitForTimeout(1500);
  const beforeSwitch = await measureRms(1800);
  await page
    .locator(".pm-shelf")
    .filter({ hasText: "Boleros" })
    .locator(".pm-card__info")
    .filter({ hasText: "Bésame Mucho" })
    .first()
    .click();
  const switchTrace = await trace(6000, 100);
  const voicesRightAfter = await bar.voices();

  // Hueco = desde el mínimo hasta la primera señal audible DESPUÉS de ese mínimo.
  const series = switchTrace.series;
  let minIndex = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i].db < series[minIndex].db) minIndex = i;
  }
  const backAt =
    series.slice(minIndex).find((s) => Number.isFinite(s.db) && s.db > -70) ?? null;
  const quietMs = series.filter(
    (s, i) => i >= minIndex - 5 && !Number.isFinite(s.db),
  ).length;
  record(
    "al cambiar de canción no queda audio de la anterior",
    switchTrace.min < -70,
    `RMS antes del click ${beforeSwitch.max.toFixed(1)} dB · mínimo tras el cambio ${switchTrace.min.toFixed(1)} dB (umbral < -70 dB) · muestras en silencio digital seguidas: ${quietMs} · vuelve a oírse ${backAt ? ((backAt.at - series[minIndex].at) / 1000).toFixed(2) + " s después del mínimo" : "no vuelve en la ventana"} · voces vivas ${JSON.stringify(voicesRightAfter)}`,
  );
  record(
    "y la canción nueva sí entra",
    backAt !== null && switchTrace.max > -30,
    `primera señal de la nueva ${backAt ? ((backAt.at - series[0].at) / 1000).toFixed(2) + " s después del click" : ">6 s"} · RMS pico ${switchTrace.max.toFixed(1)} dB`,
  );
});

await section("11. Detener (parada del transporte)", async () => {
  await playCard(SONG);
  await waitForSound(-50);
  await page.evaluate(() => window.__PLAYER__.host.seek(20));
  await page.waitForTimeout(2000);
  const rmsBeforeStop = await measureRms(1800);
  await page.evaluate(() => window.__PLAYER__.host.stop());
  const stopTrace = await trace(4000, 100);
  const rmsAfterStop = await measureRms(2500);
  const voicesAfterStop = await bar.voices();
  const srcCounters = await page.evaluate(() => window.__SRC);
  record(
    "detener deja silencio absoluto",
    rmsBeforeStop.max > -40 && rmsAfterStop.silent,
    `RMS ${rmsBeforeStop.max.toFixed(1)} dB → mínimo ${stopTrace.min.toFixed(1)} dB y ${rmsAfterStop.max.toFixed(1)} dB sostenido · posición ${(await bar.position()).toFixed(2)} s`,
  );
  record(
    "detener no deja notas colgadas",
    Object.values(voicesAfterStop).every((notes) => notes.length === 0),
    `voces vivas por pista: ${JSON.stringify(voicesAfterStop)} · fuentes de audio start ${srcCounters.start} / stop ${srcCounters.stop}`,
  );
});

await section("12. Pestaña Canciones", async () => {
  await page.locator('.rail-item[title="Canciones"]').click();
  await page.waitForTimeout(2500);
  const library = await page.evaluate(() => ({
    cards: document.querySelectorAll(".lib-card").length,
    play: document.querySelectorAll(".lib-card__play").length,
    search: Boolean(document.querySelector('input[aria-label="Buscar canciones por título o artista"]')),
    groups: [...document.querySelectorAll(".lib-group__label")].map((e) => e.textContent),
    importPanel: document.querySelectorAll('[aria-label="Subir tu propio MIDI"]').length,
  }));
  record(
    "la pestaña Canciones lista la biblioteca del piano",
    library.cards === 157 && library.play === 157 && library.search,
    `${library.cards} tarjetas, ${library.play} botones .lib-card__play, buscador=${library.search}, panel de importar=${library.importPanel}, grupos=[${library.groups.join(", ")}]`,
  );
  await page.screenshot({ path: `${OUT}/paridad-canciones.png` });
});

await section("13. Importar un MIDI propio", async () => {
  await page
    .locator('[aria-label="Subir tu propio MIDI"] input[type=file]')
    .setInputFiles("app/public/demo/Bolero_-_Besame_Mucho.kar");
  const importedSound = await waitForSound(-50, 40000);
  const importedRms = await measureRms(3000);
  const importedTitle = await bar.title();
  record(
    `${REFERENCE_DEMO} importado suena (RMS > -30 dB)`,
    importedSound.heard && importedRms.max > -30,
    `señal a ${importedSound.ms} ms · RMS pico ${importedRms.max.toFixed(1)} dB (prom ${importedRms.average.toFixed(1)}) · barra "${importedTitle}" · voces ${JSON.stringify(await bar.voices())}`,
  );
});

await section("14. Pestaña Pistas: mezclador por pista", async () => {
  await page.locator('.rail-item[title="Pistas"]').click();
  await page.waitForTimeout(1200);
  const mixerUi = await page.evaluate(() => ({
    header: (document.querySelector(".panel-screen-header h2")?.textContent || "").trim(),
    cards: document.querySelectorAll(".track-item-card").length,
    selects: document.querySelectorAll(".track-instrument-select").length,
    volumes: document.querySelectorAll(".track-volume-block input").length,
    mute: [...document.querySelectorAll(".btn-mute-solo")].filter((b) => b.textContent.trim() === "Silencio").length,
    solo: [...document.querySelectorAll(".btn-mute-solo")].filter((b) => b.textContent.trim() === "Solo").length,
  }));
  record(
    "el mezclador del piano está montado",
    mixerUi.cards > 0 && mixerUi.selects === mixerUi.cards && mixerUi.volumes === mixerUi.cards,
    `${mixerUi.cards} pistas · ${mixerUi.selects} selectores de instrumento · ${mixerUi.volumes} sliders · ${mixerUi.mute} Silencio · ${mixerUi.solo} Solo · "${mixerUi.header}"`,
  );
  await page.screenshot({ path: `${OUT}/paridad-pistas.png` });

  // Volumen de la pista 1 al mínimo: el audio debe bajar.
  // Se lee el valor REAL del slider y su etiqueta antes y después, para no confundir
  // "el volumen bajó" con "la canción entró en un pasaje suave".
  const readTrackVolume = () =>
    page.evaluate(() => {
      const input = document.querySelector(".track-volume-block input");
      return input
        ? {
            value: Number(input.value),
            label: input.parentElement.querySelector("span").textContent.trim(),
          }
        : null;
    });
  const rmsFullMix = await measureRms(2500);
  const volBefore = await readTrackVolume();
  const firstVolume = page.locator(".track-volume-block input").first();
  await firstVolume.focus();
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(1200);
  const volAfterKey = await readTrackVolume();
  const rmsTrackDown = await measureRms(2500);
  record(
    "bajar el volumen de una pista baja el audio",
    volAfterKey.value < volBefore.value && rmsTrackDown.max < rmsFullMix.max - 2,
    `slider ${volBefore.value} ("${volBefore.label}") → ${volAfterKey.value} ("${volAfterKey.label}") · RMS pico ${rmsFullMix.max.toFixed(1)} → ${rmsTrackDown.max.toFixed(1)} dB (prom ${rmsFullMix.average.toFixed(1)} → ${rmsTrackDown.average.toFixed(1)})`,
  );
  await firstVolume.focus();
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);

  // Silencio de TODAS las pistas: silencio real.
  const muteButtons = page.locator(".btn-mute-solo", { hasText: "Silencio" });
  const trackCount = await muteButtons.count();
  for (let i = 0; i < trackCount; i++) await muteButtons.nth(i).click();
  // El silencio NO es instantáneo: el reverb es un envío con 1,5 s de cola y los
  // samples ya disparados se apagan con su propio release. Se mide la CAÍDA y se
  // exige el umbral una vez que la cola terminó (~4 s), igual que en el piano.
  const muteTrace = await trace(4500, 100);
  const rmsAllMuted = await measureRms(2500);
  const levelAt = (ms) =>
    muteTrace.series.find((s) => s.at - muteTrace.series[0].at >= ms)?.db ?? null;
  record(
    "silenciar todas las pistas lleva el audio a silencio",
    rmsAllMuted.silent,
    `${trackCount} pistas silenciadas · RMS ${levelAt(0)?.toFixed(1)} dB al instante → ${levelAt(1500)?.toFixed(1)} dB a 1,5 s (cola del reverb) → ${levelAt(4000)?.toFixed(1)} dB a 4 s · ${rmsAllMuted.max.toFixed(1)} dB sostenido (umbral < -70 dB)`,
  );
  const voicesMuted = await bar.voices();
  record(
    "ninguna pista quedó disparando notas",
    Object.values(voicesMuted).every((notes) => notes.length === 0),
    `voces vivas por pista: ${JSON.stringify(voicesMuted)} con el transporte ${(await page.evaluate(() => window.__PLAYER__.host.isPlaying)) ? "corriendo" : "parado"}`,
  );
  await page.screenshot({ path: `${OUT}/paridad-pistas-mute.png` });
  for (let i = 0; i < trackCount; i++) await muteButtons.nth(i).click();
  await page.waitForTimeout(1200);

  // Solo en la primera pista.
  await page.locator(".btn-mute-solo", { hasText: "Solo" }).first().click();
  await page.waitForTimeout(1600);
  const rmsSolo = await measureRms(2500);
  record(
    "solo deja sonar la pista aislada",
    rmsSolo.max > -45,
    `RMS pico con 1 pista en Solo: ${rmsSolo.max.toFixed(1)} dB (prom ${rmsSolo.average.toFixed(1)})`,
  );
  await page.locator(".btn-mute-solo.active-solo").first().click();
  await page.waitForTimeout(1200);

  // Cambio de instrumento.
  const select = page.locator(".track-instrument-select").first();
  const instBefore = await select.inputValue();
  await select.selectOption({ index: 40 });
  await page.waitForTimeout(4000);
  const instAfter = await select.inputValue();
  const rmsAfterInstrument = await measureRms(3000);
  const statusPill = await page.locator(".status-pill").first().innerText();
  record(
    "cambiar el instrumento de una pista se aplica",
    instAfter !== instBefore,
    `instrumento de la pista 1: "${instBefore}" → "${instAfter}" · píldora "${statusPill.replace(/\s+/g, " ").trim()}" · RMS pico ${rmsAfterInstrument.max.toFixed(1)} dB`,
  );
});

// El piano produce DOS 404 del CDN de webaudiofont (documentados en
// docs/qa-reproductor.md §3.6). El reproductor tiene que producir los MISMOS y
// ninguno más: se comparó con el mismo instrumento en scripts/qa-player-consola.mjs.
await section("15. Errores de consola", async () => {
  const own = errors.filter(
    (e) =>
      !KNOWN_EXTERNAL_ERRORS.some((known) => e.includes(known)) &&
      !e.startsWith("navegación a"),
  );
  record(
    "0 errores de consola propios",
    own.length === 0,
    `${errors.length} eventos en total, ${own.length} propios (el resto son los 404 del CDN de webaudiofont y los blob del MediaSession, que el piano también produce)${own.length ? ": " + own.slice(0, 6).join(" | ") : ""}`,
  );
});

console.log("\n=== RESUMEN ===");
const stampAtEnd = appTreeStamp();
const quiet = stampAtEnd === stampAtStart;
console.log(
  `  huella de app/src: ${stampAtStart} → ${stampAtEnd} (${quiet ? "árbol QUIETO durante la corrida" : "app/src CAMBIÓ durante la corrida: puede haber HMR"})`,
);
const failed = results.filter((r) => r.ok !== true);
console.log(`  ${results.length - failed.length}/${results.length} OK`);
for (const f of failed) console.log(`  FALLA: ${f.name} — ${f.evidence}`);

await browser.close();
process.exit(failed.length === 0 ? 0 : 2);
