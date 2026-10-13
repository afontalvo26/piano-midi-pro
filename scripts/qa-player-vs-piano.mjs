// ============================================================
// qa-player-vs-piano.mjs — comparación lado a lado 1234 vs 1235.
//
// QUÉ HACE
//   1. Abre el piano (1234) y el reproductor (1235) con el MISMO viewport y las
//      MISMAS condiciones (misma pantalla, misma canción pulsada) y saca capturas.
//   2. Compara la GEOMETRÍA y el ESTILO COMPUTADO de los elementos del
//      reproductor que deberían ser idénticos (barra, tarjetas, estanterías,
//      armazón): cualquier diferencia de CSS aparece acá con nombre y apellido.
//   3. Compara PÍXEL a píxel (canvas en el navegador, sin dependencias) la barra
//      inferior, que es la superficie que el dueño mira.
//
// Uso: node scripts/qa-player-vs-piano.mjs
// Salida: .logs/qa/player-vs-piano/*.png + informe por stdout.
// ============================================================
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const PIANO = "http://localhost:1234/";
const PLAYER = "http://localhost:1235/";
const OUT = ".logs/qa/player-vs-piano";
const VIEWPORT = { width: 1600, height: 900 };

mkdirSync(OUT, { recursive: true });

/**
 * Huella del árbol de `app/src` que el REPRODUCTOR importa.
 *
 * El reproductor importa esos módulos, así que Vite los vigila: si otro proceso
 * los edita mientras esta comparación corre, la pestaña del reproductor se recarga
 * por HMR y las capturas pueden salir de un render a medias (o aparecer errores de
 * consola que no son del reproductor). Con la huella antes y después se puede
 * afirmar si la corrida fue sobre un árbol QUIETO.
 */
const APP_MODULES = [
  "app/src/music/PlayerContext.tsx",
  "app/src/music/libraryStore.ts",
  "app/src/music/useMediaSession.ts",
  "app/src/components/player/PlayerSection.tsx",
  "app/src/components/player/PlayerBar.tsx",
  "app/src/components/library/MusicScreen.tsx",
  "app/src/components/songs/SongLibrary.tsx",
  "app/src/components/songs/SongLibrary.css",
  "app/src/components/player/player.css",
  "app/src/components/library/music.css",
  "app/src/App.css",
];

function appTreeStamp() {
  const hash = createHash("sha256");
  for (const file of APP_MODULES) {
    try {
      hash.update(readFileSync(file));
      hash.update(String(statSync(file).mtimeMs));
    } catch {
      hash.update("?");
    }
  }
  return hash.digest("hex").slice(0, 16);
}

const stampAtStart = appTreeStamp();

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

/**
 * Congela animaciones y transiciones ANTES de capturar.
 *
 * POR QUÉ HACE FALTA: la portada de la biblioteca (`.lib-hero__bg`) tiene una
 * animación infinita de 18 s que mueve su degradado. Sin congelarla, las dos
 * capturas caen en fases distintas del ciclo y TODA la portada sale "distinta"
 * (medido: 84,9 % de píxeles con delta máximo de apenas 45/255 por canal) cuando
 * en realidad es la misma hoja de estilos. Congelar en el estado base —el que
 * declara la regla, sin animación— deja las dos en la misma fase.
 */
const FREEZE_ANIMATIONS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
`;

/** Abre una pestaña y espera a que el reproductor esté montado con catálogo. */
async function open(url) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.setDefaultTimeout(30000);
  const errors = [];
  /** Recargas por HMR: se cuentan aparte de los errores propios. */
  const reloads = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 180));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 180)));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) reloads.push(frame.url().slice(0, 60));
  });
  // ESTADO LIMPIO EN LAS DOS: la pantalla Música muestra colecciones generadas con
  // el historial de reproducción ("Recién escuchadas", "Más escuchadas"), y ese
  // historial vive en el localStorage de CADA origen (1234 y 1235 son orígenes
  // distintos). Sin limpiarlo, las estanterías pueden mostrar canciones distintas
  // por historia acumulada y la comparación mediría estado, no CSS.
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* modo privado: la comparación sigue, con el estado que haya */
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".pm-bar", { timeout: 30000 });
  await page.addStyleTag({ content: FREEZE_ANIMATIONS });
  // El catálogo se parsea en segundo plano: esperamos a que la pantalla Música
  // tenga tarjetas para que las dos capturas salgan con lo mismo cargado.
  await page
    .locator('.rail-item[title="Música — tu reproductor"]')
    .click({ timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll(".pm-card").length > 0,
    null,
    { timeout: 90000 },
  );
  return { page, errors, reloads };
}

/** Lo que se compara: rect + estilo computado de una lista de selectores. */
const PROPS = [
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "gap",
  "background-color",
  "background-image",
  "border-radius",
  "border-color",
  "border-width",
  "box-shadow",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "opacity",
  "flex-direction",
  "align-items",
  "justify-content",
  "grid-template-columns",
  "overflow",
  "z-index",
];

const SELECTORS = [
  ".app-container",
  ".sidebar-rail",
  // El MISMO ítem lógico del rail en las dos apps (en el piano está 3º y acá 1º:
  // el piano tiene Studio/Juego/Pistas/MIDI/Ajustes/Partitura, que no se traen).
  '.rail-item[title="Música — tu reproductor"]',
  '.rail-item.active',
  ".panel-screen--music",
  ".pm-section",
  ".app-shell",
  ".main-workspace",
  ".pm-bar",
  ".pm-bar__progress",
  ".pm-bar__time",
  ".pm-bar__track",
  ".pm-bar__fill",
  ".pm-bar__range",
  ".pm-bar__row",
  ".pm-bar__now-group",
  ".pm-bar__now",
  ".pm-bar__cover",
  ".pm-bar__meta",
  ".pm-bar__title",
  ".pm-bar__artist",
  ".pm-bar__transport",
  ".pm-tbtn",
  ".pm-tbtn--solid",
  ".pm-tbtn--bare",
  ".pm-repeat",
  ".pm-bar__extras",
  ".pm-bar__queue-btn",
  ".pm-bar__queue-count",
  ".pm-bar__volume",
  ".pm-bar__volume-range",
  ".pm-screen",
  ".pm-shelf",
  ".pm-card",
  ".pm-card__info",
  ".pm-nav",
  ".pm-nav__item",
  // Pantalla Canciones
  ".lib-root",
  ".lib-hero",
  ".lib-hero__title",
  ".lib-controls",
  ".lib-search",
  ".lib-genre-nav-wrap",
  ".lib-import",
  ".lib-group",
  ".lib-group__head",
  ".lib-grid",
  ".lib-card",
];

async function probe(page) {
  return page.evaluate(
    ({ selectors, props }) => {
      const out = {};
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (!node) {
          out[selector] = null;
          continue;
        }
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const values = {};
        for (const prop of props) values[prop] = style.getPropertyValue(prop);
        out[selector] = {
          tag: node.tagName.toLowerCase(),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
          values,
        };
      }
      return out;
    },
    { selectors: SELECTORS, props: PROPS },
  );
}

function compare(selector, a, b) {
  if (!a && !b) return null;
  if (!a) return `${selector}: SÓLO en 1235`;
  if (!b) return `${selector}: SÓLO en 1234`;
  const diffs = [];
  if (a.tag !== b.tag) diffs.push(`tag ${a.tag} ≠ ${b.tag}`);
  for (const key of ["x", "y", "w", "h"]) {
    if (a.rect[key] !== b.rect[key]) {
      diffs.push(`rect.${key} ${a.rect[key]} ≠ ${b.rect[key]}`);
    }
  }
  for (const prop of Object.keys(a.values)) {
    if (a.values[prop] !== b.values[prop]) {
      diffs.push(`${prop}: "${a.values[prop]}" ≠ "${b.values[prop]}"`);
    }
  }
  return diffs.length ? `${selector}: ${diffs.join(" | ")}` : null;
}

/**
 * Diff píxel a píxel de dos PNG, dentro del navegador (canvas, sin dependencias).
 *
 * TOLERANCIA DE ALINEACIÓN (±1 px). Dos páginas independientes pueden dejar un
 * elemento en `y = 210,5` y en `y = 137,0`: redondear el recorte a píxeles enteros
 * desplaza una captura medio píxel y entonces el degradado y el antialiasing del
 * texto difieren en TODA la superficie (medido: 87,7 % de píxeles "distintos" con
 * delta máximo de sólo 96/765 — o sea, la misma imagen corrida un pelo). Se prueban
 * los 9 desplazamientos de ±1 px y se informa el MEJOR: si con 1 px de corrimiento
 * la diferencia cae a ~0, lo que había era sub-píxel, no una diferencia visual.
 */
async function pixelDiff(page, pngA, pngB, { align = 1 } = {}) {
  return page.evaluate(
    async ([a, b, maxShift]) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return {
          mismatch: `tamaños distintos ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`,
        };
      }
      const canvas = document.createElement("canvas");
      canvas.width = ia.width;
      canvas.height = ia.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(ia, 0, 0);
      const da = ctx.getImageData(0, 0, ia.width, ia.height).data;

      // Una sola lectura de B por cada corrimiento candidato.
      const readB = (dx, dy) => {
        ctx.clearRect(0, 0, ia.width, ia.height);
        ctx.drawImage(ib, dx, dy);
        return ctx.getImageData(0, 0, ia.width, ia.height).data;
      };

      const score = (db) => {
        let differing = 0;
        let maxDelta = 0;
        // Se ignora el borde de 1 px: con un corrimiento, ese anillo compara
        // píxeles que en la otra imagen no existen.
        for (let y = 1; y < ia.height - 1; y++) {
          for (let x = 1; x < ia.width - 1; x++) {
            const i = (y * ia.width + x) * 4;
            const d =
              Math.abs(da[i] - db[i]) +
              Math.abs(da[i + 1] - db[i + 1]) +
              Math.abs(da[i + 2] - db[i + 2]);
            if (d > maxDelta) maxDelta = d;
            if (d > 12) differing += 1;
          }
        }
        return { differing, maxDelta };
      };

      let best = null;
      for (let dy = -maxShift; dy <= maxShift; dy++) {
        for (let dx = -maxShift; dx <= maxShift; dx++) {
          const db = readB(dx, dy);
          const s = score(db);
          if (!best || s.differing < best.differing) {
            best = { ...s, dx, dy };
          }
        }
      }

      // Imagen del MEJOR alineamiento, para poder mirar dónde queda lo que difiere.
      const db = readB(best.dx, best.dy);
      const out = ctx.createImageData(ia.width, ia.height);
      for (let i = 0; i < da.length; i += 4) {
        const d =
          Math.abs(da[i] - db[i]) +
          Math.abs(da[i + 1] - db[i + 1]) +
          Math.abs(da[i + 2] - db[i + 2]);
        if (d > 12) {
          out.data[i] = 255;
          out.data[i + 1] = 0;
          out.data[i + 2] = 128;
          out.data[i + 3] = 255;
        } else {
          out.data[i] = 30;
          out.data[i + 1] = 30;
          out.data[i + 2] = 34;
          out.data[i + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      return {
        total: ia.width * ia.height,
        differing: best.differing,
        ratio: best.differing / (ia.width * ia.height),
        maxDelta: best.maxDelta,
        shift: { dx: best.dx, dy: best.dy },
        diffPng: canvas.toDataURL("image/png"),
      };
    },
    [pngA, pngB, align],
  );
}

function saveDataUrl(dataUrl, path) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  writeFileSync(path, Buffer.from(base64, "base64"));
}

/** PNG del disco como data URL, para poder cargarlo en un canvas del navegador. */
const toDataUrl = (file) =>
  `data:image/png;base64,${readFileSync(file).toString("base64")}`;

async function shoot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  return path;
}

const findings = [];

// ── 1. Pantalla Música, catálogo cargado, barra vacía ────────────────────────
console.log("\n=== 1. Música · catálogo cargado · barra vacía ===");
const piano = await open(PIANO);
const player = await open(PLAYER);
await piano.page.waitForTimeout(2500);
await player.page.waitForTimeout(2500);

const pngPianoMusic = await shoot(piano.page, "piano-1234-musica");
const pngPlayerMusic = await shoot(player.page, "player-1235-musica");

const probePiano = await probe(piano.page);
const probePlayer = await probe(player.page);
for (const selector of SELECTORS) {
  const diff = compare(selector, probePiano[selector], probePlayer[selector]);
  if (diff) findings.push(`[Música] ${diff}`);
}
console.log(`  diferencias de geometría/estilo: ${findings.length}`);

// ── 2. Misma canción en la barra (pausada) ───────────────────────────────────
console.log("\n=== 2. Misma canción en la barra (pausada) ===");
const SONG_CARD = ".pm-card__info";
async function loadSameSong(ctx, title) {
  const card = ctx.page
    .locator(".pm-shelf")
    .filter({ hasText: "Vallenato" })
    .locator(SONG_CARD)
    .filter({ hasText: title })
    .first();
  await card.click({ timeout: 20000 });
  // La barra muestra el título cuando el reproductor la tomó.
  await ctx.page.waitForFunction(
    (t) => (document.querySelector(".pm-bar__title")?.textContent || "").includes(t),
    title,
    { timeout: 60000 },
  );
  // Pausar para congelar la MISMA superficie visual en los dos.
  const pause = ctx.page.locator('.pm-bar button[aria-label="Pausar"]');
  if (await pause.count()) await pause.click().catch(() => {});
  await ctx.page.waitForTimeout(1500);
}

await loadSameSong(piano, "El Osito Dormilón");
await loadSameSong(player, "El Osito Dormilón");

const barState = {};
for (const [name, ctx] of [["piano", piano], ["player", player]]) {
  barState[name] = await ctx.page.evaluate(() => ({
    title: (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
    artist: (document.querySelector(".pm-bar__artist")?.textContent || "").trim(),
    queue: (document.querySelector(".pm-bar__queue-count")?.textContent || "").trim(),
    seekerMax: Number(document.querySelector(".pm-bar__range")?.max ?? 0),
    seekerValue: Number(document.querySelector(".pm-bar__range")?.value ?? 0),
    clocks: [...document.querySelectorAll(".pm-bar__time")].map((e) => e.textContent.trim()),
    chips: [...document.querySelectorAll(".pm-bar__chip")].map((b) => (b.textContent || "").trim()),
    transportButtons: [...document.querySelectorAll(".pm-bar__transport button")].map((b) => ({
      label: b.getAttribute("aria-label"),
      disabled: b.disabled,
      pressed: b.getAttribute("aria-pressed"),
    })),
  }));
}
console.log("  piano :", JSON.stringify(barState.piano));
console.log("  player:", JSON.stringify(barState.player));

const pngPianoBar = await shoot(piano.page, "piano-1234-musica-cancion-en-barra");
const pngPlayerBar = await shoot(player.page, "player-1235-musica-cancion-en-barra");

// ── Diffs alineados por REGIÓN ───────────────────────────────────────────────
//
// Comparar capturas completas mide la diferencia de ARMADO (el piano tiene,
// arriba de la pantalla, la barra de transporte del Studio: 73 px), no la del
// reproductor. Así que cada región se recorta de SU propia caja: si el CSS y los
// componentes son los mismos, el recorte sale idéntico.
const reader = await browser.newPage({ viewport: VIEWPORT });

/** Recorta la caja de `selector` en las dos apps y devuelve el diff. */
async function regionDiff(name, selector, opts = {}) {
  try {
    return await regionDiffInner(name, selector, opts);
  } catch (error) {
    console.log(`  ${name}: no se pudo comparar (${String(error).split("\n")[0]})`);
    return null;
  }
}

async function regionDiffInner(name, selector, opts = {}) {
  const measure = async () => {
    const boxes = {};
    for (const [label, ctx] of [["piano", piano], ["player", player]]) {
      boxes[label] = await ctx.page.evaluate((sel) => {
        const node = document.querySelector(sel);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, selector);
    }
    return boxes;
  };

  let boxes = await measure();
  if (!boxes.piano || !boxes.player) {
    console.log(`  ${name}: SÓLO en ${boxes.piano ? "1234" : "1235"}`);
    return null;
  }

  // `opts.scroll` alinea los dos elementos al tope de su contenedor antes de
  // medir, para poder comparar algo que está debajo del pliegue. También se hace
  // solo cuando el elemento arranca por encima del viewport (contenido largo ya
  // scrolleado): recortar contra el borde compararía contenido distinto.
  if (opts.scroll || boxes.piano.y < 0 || boxes.player.y < 0) {
    for (const ctx of [piano, player]) {
      await ctx.page.evaluate((sel) => {
        document.querySelector(sel)?.scrollIntoView({ block: "start" });
      }, selector);
    }
    await piano.page.waitForTimeout(500);
    boxes = await measure();
  }
  if (boxes.piano.y < 0 || boxes.player.y < 0) {
    console.log(
      `  ${name}: no comparable (arranca fuera del viewport: y ${Math.round(boxes.piano.y)} en 1234, ${Math.round(boxes.player.y)} en 1235)`,
    );
    return null;
  }
  // Alto común acotado: a lo sumo el viewport (un elemento que arranca fuera de
  // pantalla no se puede recortar) y, si se pide, `opts.maxHeight` para comparar
  // sólo la parte ANCLADA ARRIBA y no arrastrar el corrimiento de lo anclado abajo.
  const tops = { piano: Math.max(0, boxes.piano.y), player: Math.max(0, boxes.player.y) };
  const height = Math.min(
    boxes.piano.height,
    boxes.player.height,
    opts.maxHeight ?? Infinity,
    VIEWPORT.height - Math.max(tops.piano, tops.player),
  );
  const width = Math.min(boxes.piano.width, boxes.player.width, VIEWPORT.width);
  if (height < 8 || width < 8) {
    console.log(`  ${name}: fuera del viewport (no comparable en una captura)`);
    return null;
  }
  const files = {};
  for (const [label, ctx] of [["piano", piano], ["player", player]]) {
    const box = boxes[label];
    const file = `${OUT}/region-${name}-${label}.png`;
    await ctx.page.screenshot({
      path: file,
      clip: {
        x: Math.max(0, Math.round(box.x + (opts.dx ?? 0))),
        y: Math.round(Math.max(0, box.y + (opts.dy ?? 0))),
        width: Math.round(width),
        height: Math.round(height),
      },
    });
    files[label] = file;
  }
  const diff = await pixelDiff(
    reader,
    toDataUrl(files.piano),
    toDataUrl(files.player),
  );
  if (diff.mismatch) {
    console.log(`  ${name}: ${diff.mismatch}`);
    return null;
  }
  console.log(
    `  ${name}: ${diff.differing}/${diff.total} píxeles distintos (${(diff.ratio * 100).toFixed(2)}%), delta máx ${diff.maxDelta}, mejor corrimiento ${diff.shift.dx},${diff.shift.dy}`,
  );
  saveDataUrl(diff.diffPng, `${OUT}/diff-${name}.png`);
  return diff;
}

console.log("\n--- diffs alineados por región (misma canción en la barra) ---");
await regionDiff("barra-completa", ".pm-bar");
await regionDiff("barra-transporte", ".pm-bar__transport");
await regionDiff("barra-ahora-suena", ".pm-bar__now-group");
await regionDiff("barra-volumen", ".pm-bar__volume");
await regionDiff("barra-progreso", ".pm-bar__progress");
// Sólo la parte de arriba de la pantalla Música: el bloque "Importar" del nav va
// anclado ABAJO, así que su posición absoluta depende del alto disponible.
await regionDiff("musica-nav", ".pm-nav", { maxHeight: 560 });
await regionDiff("musica-encabezado", ".pm-screen", { maxHeight: 260 });
// Las estanterías (tarjetas con carátula, título, artista y metadatos).
await regionDiff("musica-estanterias", ".pm-shelf", { maxHeight: 460 });
await regionDiff("musica-tarjeta", ".pm-card", { maxHeight: 260 });

// ── 3. Pantalla Canciones ────────────────────────────────────────────────────
console.log("\n=== 3. Pantalla Canciones ===");
for (const ctx of [piano, player]) {
  await ctx.page.locator('.rail-item[title="Canciones"]').click();
  await ctx.page.waitForTimeout(2500);
}
const pngPianoSongs = await shoot(piano.page, "piano-1234-canciones");
const pngPlayerSongs = await shoot(player.page, "player-1235-canciones");

const songsProbe = {};
for (const [name, ctx] of [["piano", piano], ["player", player]]) {
  songsProbe[name] = await ctx.page.evaluate(() => ({
    cards: document.querySelectorAll(".lib-card").length,
    play: document.querySelectorAll(".lib-card__play").length,
    h1: (document.querySelector(".lib-hero__title")?.textContent || "").trim(),
    count: (document.querySelector(".lib-hero__count")?.textContent || "").trim(),
    genres: [...document.querySelectorAll(".genre-chip, .lib-genre")].map((e) =>
      (e.textContent || "").replace(/\s+/g, " ").trim(),
    ),
  }));
}
console.log("  piano :", JSON.stringify(songsProbe.piano));
console.log("  player:", JSON.stringify(songsProbe.player));

console.log("\n--- diffs alineados por región (pantalla Canciones) ---");
await regionDiff("canciones-hero", ".lib-hero");
await regionDiff("canciones-controles", ".lib-controls");
await regionDiff("canciones-generos", ".lib-genre-nav-wrap");
await regionDiff("canciones-importar", ".lib-import", { maxHeight: 220 });

// Las tarjetas quedan debajo del pliegue en las dos: se alinean al tope antes de
// recortar (si no, el recorte cae en el borde del viewport y compara otra cosa).
await regionDiff("canciones-tarjetas", ".lib-grid", { maxHeight: 420, scroll: true });
await regionDiff("canciones-tarjeta-una", ".lib-card", { maxHeight: 300, scroll: true });

// ── 4. Diff píxel de la pantalla Música completa ─────────────────────────────
const musicDiff = await pixelDiff(
  reader,
  toDataUrl(pngPianoMusic),
  toDataUrl(pngPlayerMusic),
);
if (!musicDiff.mismatch) {
  console.log(
    `\n  píxeles distintos en Música (pantalla completa, mejor corrimiento ${musicDiff.shift.dx},${musicDiff.shift.dy}): ${musicDiff.differing}/${musicDiff.total} (${(musicDiff.ratio * 100).toFixed(2)}%)`,
  );
  saveDataUrl(musicDiff.diffPng, `${OUT}/diff-musica.png`);
}

// ── Informe ─────────────────────────────────────────────────────────────────
console.log("\n=== DIFERENCIAS DE GEOMETRÍA / ESTILO COMPUTADO ===");
if (findings.length === 0) console.log("  ninguna");
else for (const f of findings) console.log("  · " + f);

console.log("\n=== ERRORES DE CONSOLA ===");
console.log(`  1234 (piano) : ${piano.errors.length}`);
for (const e of piano.errors.slice(0, 10)) console.log("    " + e);
console.log(`  1235 (player): ${player.errors.length}`);
for (const e of player.errors.slice(0, 10)) console.log("    " + e);
console.log(
  `  recargas de pestaña (HMR): piano ${piano.reloads.length} · reproductor ${player.reloads.length}` +
    (player.reloads.length > 0
      ? "  ← el reproductor importa app/src: si otro proceso lo edita, Vite recarga"
      : ""),
);

const stampAtEnd = appTreeStamp();
console.log("\n=== ÁRBOL DE app/src ===");
console.log(
  `  ${stampAtStart} → ${stampAtEnd} (${stampAtStart === stampAtEnd ? "QUIETO durante la corrida" : "CAMBIÓ durante la corrida: puede haber HMR"})`,
);

console.log("\n=== CAPTURAS ===");
for (const f of [
  pngPianoMusic,
  pngPlayerMusic,
  pngPianoBar,
  pngPlayerBar,
  pngPianoSongs,
  pngPlayerSongs,
]) {
  console.log("  " + f);
}

await browser.close();
