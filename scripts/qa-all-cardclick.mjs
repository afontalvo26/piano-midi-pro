// ============================================================
// qa-all-cardclick — click dirigido por TÍTULO, no por índice.
//
// El probe mostró que `.pm-card__info` nth(2) se lee como "La Creciente" pero
// al pulsarlo la app reacciona como si fuera la tarjeta ya activa ("El Osito
// Dormilón") y alterna pausa. Este script elimina el índice de la ecuación:
// localiza la tarjeta por su texto, comprueba qué elemento hay en el punto de
// click (elementFromPoint), pulsa y mide.
//
// Salida: .logs/qa/results-cardclick.json  +  .logs/qa/cardclick-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";

const qa = await openQA();
const { page } = qa;
const bar = () => page.evaluate(BAR_STATE);

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(3000);
await qa.shot("cardclick-01-musica");

// Índice → título, leído del PROPIO nodo que se va a pulsar.
const listar = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".pm-card__info")].map((el, i) => ({
      i,
      titulo: (el.querySelector(".pm-card__title")?.textContent || "").trim(),
      cardActiva: el.closest(".pm-card")?.className.includes("is-active") ?? null,
      // ¿Cuántas .pm-card__info comparten este título? (duplicados en el DOM)
      gemelas: [...document.querySelectorAll(".pm-card__info")].filter(
        (o) => (o.querySelector(".pm-card__title")?.textContent || "").trim() ===
          (el.querySelector(".pm-card__title")?.textContent || "").trim(),
      ).length,
    })),
  );

const clickPorTitulo = async (titulo, etiqueta) => {
  const cands = page.locator(".pm-card__info").filter({ hasText: titulo });
  const n = await cands.count();
  // Preferir la copia visible más arriba (la primera estantería pintada).
  let elegido = -1;
  let box = null;
  for (let k = 0; k < n; k++) {
    const b = await cands.nth(k).boundingBox();
    if (b && (!box || b.y < box.y)) {
      box = b;
      elegido = k;
    }
  }
  if (!box) throw new Error(`no encontré caja para "${titulo}"`);
  const target = cands.nth(elegido);
  // OJO: boundingBox() da coordenadas de PÁGINA; page.mouse.click usa
  // coordenadas de VIEWPORT. Sin este scroll previo, pulsar una tarjeta que
  // está más abajo en la página acierta en el vacío (bug del arnés, corregido).
  await target.scrollIntoViewIfNeeded();
  const vbox = await target.boundingBox();
  const punto = { x: vbox.x + vbox.width / 2, y: vbox.y + vbox.height * 0.6 };
  const enPunto = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const info = el?.closest(".pm-card__info");
    return {
      tag: el?.tagName,
      cls: (el?.className || "").toString().slice(0, 50),
      dentroDeInfo: !!info,
      tituloDelInfo: (info?.querySelector(".pm-card__title")?.textContent || "").trim(),
      ariaLabel: el?.getAttribute?.("aria-label") || null,
    };
  }, punto);
  console.log(`\n>>> ${etiqueta}: "${titulo}" → ${n} coincidencia(s), uso la #${elegido}; tras scroll: y=${Math.round(vbox.y)} x=${Math.round(vbox.x)}`);
  console.log(`    elementFromPoint(${Math.round(punto.x)}, ${Math.round(punto.y)}) = <${enPunto.tag} class="${enPunto.cls}"> dentroDeInfo=${enPunto.dentroDeInfo} título="${enPunto.tituloDelInfo}"`);
  await page.screenshot({ path: `${OUT}/${etiqueta}-pre.png` });
  if (!enPunto.dentroDeInfo) throw new Error(`el punto de click no cae dentro de la tarjeta "${titulo}"`);
  await target.click();
  return { titulo, n, elegido, box, vbox, punto, enPunto };
};

const mapa = await listar();
console.log("### índice → título tal como lo ve el propio nodo");
mapa.slice(0, 6).forEach((m) => console.log(`  [${m.i}] "${m.titulo}" activa=${m.cardActiva} gemelas=${m.gemelas}`));

// ── 1. arrancar con "El Osito Dormilón" ─────────────────────────────────────
const t0 = await bar();
const c1 = await clickPorTitulo("El Osito Dormilón", "cardclick-02-osito");
await page.waitForTimeout(12000);
const s1 = await bar();
const r1 = await qa.rms(8, 130);
await qa.shot("cardclick-02-osito-post");
console.log(`    barra: "${s1.title}" cola=${s1.queueCount} ${s1.seekerVal?.toFixed(1)}/${s1.seekerMax?.toFixed(1)} ${s1.centralLabel} RMS=${r1 === -Infinity ? "-inf" : r1.toFixed(1)} dB`);
qa.add({
  control: 'Música: reproducir "El Osito Dormilón" (click por título)',
  selector: '.pm-card__info:has-text("El Osito Dormilón")',
  result: s1.title === "El Osito Dormilón" && r1 > -70 ? "OK" : "FAIL",
  evidence:
    `${c1.n} nodos con ese texto (el pulsado: y=${Math.round(c1.box.y)}); elementFromPoint devolvió <${c1.enPunto.tag}> dentro de la tarjeta=${c1.enPunto.dentroDeInfo}; ` +
    `barra "${t0.title}" → "${s1.title}", cola ${s1.queueCount}, ${s1.seekerVal?.toFixed(1)}s de ${s1.seekerMax?.toFixed(1)}s, botón central "${s1.centralLabel}", RMS ${r1 === -Infinity ? "-inf" : r1.toFixed(1)} dB`,
  shot: `${OUT}/cardclick-02-osito-pre.png · ${OUT}/cardclick-02-osito-post.png`,
  extra: { t0, s1, r1, c1 },
});

// ── 2. cambiar a "La Creciente" (misma estantería) ──────────────────────────
const t1 = await bar();
const c2 = await clickPorTitulo("La Creciente", "cardclick-03-creciente");
await page.waitForTimeout(12000);
const s2 = await bar();
const r2 = await qa.rms(8, 130);
await qa.shot("cardclick-03-creciente-post");
console.log(`    barra: "${s2.title}" cola=${s2.queueCount} ${s2.seekerVal?.toFixed(1)}/${s2.seekerMax?.toFixed(1)} ${s2.centralLabel} RMS=${r2 === -Infinity ? "-inf" : r2.toFixed(1)} dB`);
qa.add({
  control: '(3) Música: cambiar a otra canción de la MISMA estantería ("La Creciente")',
  selector: '.pm-card__info:has-text("La Creciente")',
  result: s2.title === "La Creciente" ? "OK" : "FAIL",
  evidence:
    `antes "${t1.title}" (${t1.seekerVal?.toFixed(1)}s/${t1.seekerMax?.toFixed(1)}s, central "${t1.centralLabel}") → después de pulsar "La Creciente" (${c2.n} nodos coincidentes) la barra dice "${s2.title}" con ${s2.seekerVal?.toFixed(1)}s de ${s2.seekerMax?.toFixed(1)}s, ` +
    `central "${s2.centralLabel}", cola ${s2.queueCount}, RMS ${r2 === -Infinity ? "-inf" : r2.toFixed(1)} dB`,
  shot: `${OUT}/cardclick-03-creciente-pre.png · ${OUT}/cardclick-03-creciente-post.png`,
  extra: { t1, s2, r2, c2 },
});

// ── 3. cambiar a una canción de OTRA estantería ("Boleros") ─────────────────
const otra = await page.evaluate(() => {
  const shelfs = [...document.querySelectorAll(".pm-shelf")];
  const bol = shelfs.find((s) => /Boleros/i.test(s.querySelector("h2, h3")?.textContent || ""));
  const info = bol?.querySelector(".pm-card__info");
  return {
    estanteria: (bol?.querySelector("h2, h3")?.textContent || "").trim(),
    titulo: (info?.querySelector(".pm-card__title")?.textContent || "").trim(),
    enMismaEstanteria: false,
  };
});
console.log(`\n### otra estantería: "${otra.estanteria}" → "${otra.titulo}"`);
if (otra.titulo) {
  const t2 = await bar();
  const c3 = await clickPorTitulo(otra.titulo, "cardclick-04-otra-estanteria");
  await page.waitForTimeout(12000);
  const s3 = await bar();
  const r3 = await qa.rms(8, 130);
  await qa.shot("cardclick-04-otra-estanteria-post");
  console.log(`    barra: "${s3.title}" cola=${s3.queueCount} ${s3.seekerVal?.toFixed(1)}/${s3.seekerMax?.toFixed(1)} ${s3.centralLabel} RMS=${r3 === -Infinity ? "-inf" : r3.toFixed(1)} dB`);
  qa.add({
    control: "(3) Música: cambiar a una canción de OTRA estantería (Boleros)",
    selector: ".pm-shelf (Boleros) .pm-card__info",
    result: s3.title === otra.titulo ? "OK" : "FAIL",
    evidence:
      `de "${t2.title}" (estantería Vallenato) a "${otra.titulo}" (estantería ${otra.estanteria}): la barra quedó en "${s3.title}", ` +
      `cola ${t2.queueCount} → ${s3.queueCount} (la cola se reemplaza por la de la estantería nueva: ${t2.queueCount !== s3.queueCount}), ` +
      `${s3.seekerVal?.toFixed(1)}s de ${s3.seekerMax?.toFixed(1)}s, central "${s3.centralLabel}", RMS ${r3 === -Infinity ? "-inf" : r3.toFixed(1)} dB`,
    shot: `${OUT}/cardclick-04-otra-estanteria-pre.png · ${OUT}/cardclick-04-otra-estanteria-post.png`,
    extra: { t2, s3, r3, otra, c3 },
  });
}

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.save("results-cardclick");
console.log(`resultados: ${qa.results.length} filas`);
await qa.close();
