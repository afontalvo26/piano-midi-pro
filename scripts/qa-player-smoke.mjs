// ============================================================
// qa-player-smoke.mjs — ¿el reproductor nuevo arranca sin errores?
//
// Carga http://localhost:1235, espera el catálogo, reporta:
//   · errores de consola / pageerror
//   · qué componentes del piano están montados (.pm-bar, .pm-screen, .lib-root…)
//   · cantidad de tarjetas de las dos pantallas
// Uso: node scripts/qa-player-smoke.mjs
// ============================================================
import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(20000);

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

await page.goto("http://localhost:1235/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 25000 });
console.log("OK .pm-bar montada");

// Esperar el catálogo (las tarjetas de Música salen del libraryStore).
await page
  .waitForFunction(() => document.querySelectorAll(".pm-card").length > 0, null, { timeout: 60000 })
  .catch(() => console.log("⚠️  no aparecieron .pm-card en 60 s"));

const state = await page.evaluate(() => {
  const q = (selector) => document.querySelectorAll(selector).length;
  return {
    appContainer: q(".app-container"),
    rail: q(".sidebar-rail"),
    railItems: [...document.querySelectorAll(".rail-item")].map((b) =>
      (b.textContent || "").trim(),
    ),
    topbar: q(".topbar-header"),
    panelScreen: q(".panel-screen"),
    pmSection: q(".pm-section"),
    pmBar: q(".pm-bar"),
    pmScreen: q(".pm-screen"),
    pmCards: q(".pm-card"),
    pmShelves: q(".pm-shelf"),
    barTitle: (document.querySelector(".pm-bar__title")?.textContent || "").trim(),
    barArtist: (document.querySelector(".pm-bar__artist")?.textContent || "").trim(),
    barButtons: [...document.querySelectorAll(".pm-bar button")].map(
      (b) => b.getAttribute("aria-label") || b.getAttribute("title") || (b.textContent || "").trim().slice(0, 18),
    ),
    trackCount: window.__PLAYER__ ? 1 : 0,
    engineStatus: (document.querySelector(".status-pill:last-child")?.textContent || "").trim(),
    songsCount: (document.querySelectorAll(".status-pill")[1]?.textContent || "").trim(),
  };
});
console.log(JSON.stringify(state, null, 2));

// Pantalla Canciones
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForTimeout(1200);
const songs = await page.evaluate(() => ({
  libRoot: document.querySelectorAll(".lib-root").length,
  cards: document.querySelectorAll(".lib-card").length,
  play: document.querySelectorAll(".lib-card__play").length,
  search: Boolean(document.querySelector('input[aria-label="Buscar canciones por título o artista"]')),
  groups: [...document.querySelectorAll(".lib-group__label")].map((e) => e.textContent),
}));
await page.screenshot({ path: ".logs/qa/player-vs-piano/smoke-1235-canciones.png" });
console.log("CANCIONES:", JSON.stringify(songs));

// Pantalla Música
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: ".logs/qa/player-vs-piano/smoke-1235-musica.png" });

// Pantalla Pistas
await page.locator('.rail-item[title="Pistas"]').click();
await page.waitForTimeout(600);
const tracks = await page.evaluate(() => ({
  header: (document.querySelector(".panel-screen-header h2")?.textContent || "").trim(),
  cards: document.querySelectorAll(".track-item-card").length,
}));
await page.screenshot({ path: ".logs/qa/player-vs-piano/smoke-1235-pistas.png" });
console.log("PISTAS:", JSON.stringify(tracks));

console.log(`\nERRORES DE CONSOLA: ${errors.length}`);
for (const e of errors.slice(0, 25)) console.log("  " + e);

await browser.close();
