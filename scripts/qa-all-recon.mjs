// ============================================================
// qa-all-recon — inventario en vivo de TODOS los controles.
//
// No afirma nada: sólo vuelca lo que ve el navegador para que el informe
// pueda citar selectores reales en vez de suposiciones.
//
// Salida: .logs/qa/recon.json  +  .logs/qa/recon-*.png
// ============================================================

import { openQA, INVENTORY, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";
import { writeFileSync } from "node:fs";

const dump = async (qa, etiqueta) => {
  const inv = await qa.page.evaluate(INVENTORY);
  const bar = await qa.page.evaluate(BAR_STATE);
  const rail = await qa.page.$$eval(".rail-item", (els) =>
    els.map((e) => ({
      title: e.getAttribute("title"),
      text: (e.textContent || "").trim(),
      active: e.classList.contains("active"),
    })),
  );
  console.log(`\n=== ${etiqueta} — ${inv.length} controles visibles ===`);
  inv.forEach((c, i) =>
    console.log(
      `${String(i + 1).padStart(2)}. [${c.tag}${c.type ? ":" + c.type : ""}] "${c.name}"` +
        `${c.disabled ? " DESHABILITADO" : ""}${c.pressed !== null ? ` pressed=${c.pressed}` : ""} .${c.cls}`,
    ),
  );
  console.log(`  barra .pm-bar: ${JSON.stringify(bar)}`);
  console.log(`  rail: ${rail.map((r) => `${r.text}${r.active ? "*" : ""}`).join(" | ")}`);
  return { etiqueta, inv, bar, rail };
};

const qa = await openQA({ record: true });
const out = {};

await qa.page.goto(URL);
await qa.page.waitForSelector(".pm-bar", { timeout: 25000 });
// El catálogo de demos se parsea en un worker: darle margen antes de inventariar.
await qa.page.waitForTimeout(4000);
await qa.shot("recon-01-inicio");
out.inicio = await dump(qa, "INICIO (Studio, biblioteca vacía)");

// ¿Cuántas tarjetas trae la biblioteca?
const lib = await qa.page.evaluate(() => ({
  cards: document.querySelectorAll(".lib-card, .song-card, [class*=lib-card]").length,
  titles: [...document.querySelectorAll(".lib-card__title, .song-card__title")]
    .slice(0, 5)
    .map((e) => e.textContent.trim()),
}));
console.log(`\nbiblioteca: ${lib.cards} tarjetas; primeras: ${lib.titles.join(" / ")}`);
out.library = lib;

// Pantalla Canciones
const canciones = qa.page.locator('.rail-item[title="Canciones"]');
await canciones.click();
await qa.page.waitForTimeout(3000);
await qa.shot("recon-02-canciones");
const songDom = await qa.page.evaluate(() => ({
  classes: [...new Set([...document.querySelectorAll("main *")].map((e) => e.className).filter((c) => typeof c === "string" && /card|song|row|list/i.test(c)))].slice(0, 40),
  counts: {
    "lib-card": document.querySelectorAll(".lib-card").length,
    "song-card": document.querySelectorAll(".song-card").length,
    "lib-row": document.querySelectorAll(".lib-row").length,
    "lib-card__title": document.querySelectorAll(".lib-card__title").length,
  },
  firstCardText: (document.querySelector(".lib-card, .song-card")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
}));
console.log(`\n=== PANTALLA CANCIONES ===\n  conteos: ${JSON.stringify(songDom.counts)}`);
console.log(`  primera tarjeta: "${songDom.firstCardText}"`);
console.log(`  clases: ${songDom.classes.join(", ")}`);
out.canciones = songDom;

// Resto de pantallas de navegación: ¿el workspace cambia?
for (const [title, file] of [
  ["Modo Juego", "recon-03-juego"],
  ["Música — tu reproductor", "recon-04-musica"],
  ["Pistas", "recon-05-pistas"],
  ["Configuración MIDI", "recon-06-midi"],
  ["Ajustes", "recon-07-ajustes"],
  ["Partitura", "recon-08-partitura"],
  ["Studio", "recon-09-studio"],
]) {
  await qa.page.locator(`.rail-item[title="${title}"]`).click();
  await qa.page.waitForTimeout(1800);
  await qa.shot(file);
  const st = await qa.page.evaluate(() => ({
    h1: (document.querySelector(".topbar-header h1")?.textContent || "").trim(),
    subtitles: [...document.querySelectorAll("h2, h3")].slice(0, 4).map((e) => e.textContent.trim().slice(0, 48)),
    activeRail: (document.querySelector(".rail-item.active")?.textContent || "").trim(),
    hasStudioWorkspace: !!document.querySelector(".studio-workspace"),
    hasPianoKeyboard: !!document.querySelector(".piano-wrapper"),
    hasPianoOnly: !!document.querySelector(".piano-only-toggle"),
    hasPedals: !!document.querySelector(".ic-pedal"),
    hasKeyFx: !!document.querySelector(".keyfx-panel"),
  }));
  console.log(`\n=== ${title} ===\n  ${JSON.stringify(st)}`);
  out[title] = st;
}

writeFileSync(`${OUT}/recon.json`, JSON.stringify(out, null, 2));
console.log(`\nERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 15).forEach((e) => console.log("  " + e));
console.log(`\nrecon.json escrito en ${OUT}/recon.json (${qa.shots.length} capturas)`);
await qa.close();
