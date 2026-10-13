// ============================================================
// qa-all-library — CASO 3: flujo de biblioteca.
//
// Dos superficies distintas que la app expone como "biblioteca":
//   • pestaña "Canciones"  (.lib-card → App.onSelectSong → setSong + Detener)
//   • pestaña "Música"     (.pm-card → player.playCollection → cola real)
//
// Salida: .logs/qa/results-library.json  +  .logs/qa/library-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";

const DEMO = "app/public/demo";

const qa = await openQA();
const { page } = qa;
const bar = () => page.evaluate(BAR_STATE);
const studioState = () =>
  page.evaluate(() => ({
    topbar: (document.querySelector(".topbar-header p")?.textContent || "").replace(/\s+/g, " ").trim(),
    reloj: (document.querySelector(".time-display")?.textContent || "").trim(),
    boton: (document.querySelector(".playback-bar .btn.primary")?.textContent || "").trim(),
    seekerMax: Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? -1),
    pistas: document.querySelectorAll("[class*=track-row], .mixer-strip").length,
  }));

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);

// ═══ PESTAÑA "CANCIONES" ═══════════════════════════════════════════════════
console.log("\n################ PESTAÑA CANCIONES ################");
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForSelector(".lib-card", { timeout: 20000 });
await page.waitForTimeout(3000);
await qa.shot("library-01-canciones");

const lib = await page.evaluate(() => ({
  tarjetas: document.querySelectorAll(".lib-card").length,
  grid: document.querySelectorAll(".lib-card--grid").length,
  list: document.querySelectorAll(".lib-card--list").length,
  primera: (document.querySelector(".lib-card__title")?.textContent || "").trim(),
  botonesTocar: document.querySelectorAll(".lib-card__play").length,
  buscador: !!document.querySelector('input[aria-label="Buscar canciones por título o artista"]'),
  generos: document.querySelectorAll('[aria-label="Filtrar por género"] option').length,
  import: !!document.querySelector('[aria-label="Subir tu propio MIDI"]'),
}));
console.log(`  biblioteca: ${JSON.stringify(lib)}`);
qa.add({
  control: 'Pestaña "Canciones": la biblioteca lista las canciones',
  selector: ".lib-card / .lib-card__play",
  result: lib.tarjetas > 100 && lib.botonesTocar > 0 ? "OK" : "FAIL",
  evidence: `${lib.tarjetas} tarjetas (${lib.grid} en cuadrícula, ${lib.list} en lista), ${lib.botonesTocar} botones .lib-card__play, buscador=${lib.buscador}, selector de género con ${lib.generos} opciones, bloque de importación=${lib.import}; primera tarjeta: "${lib.primera}"`,
  shot: `${OUT}/library-01-canciones.png`,
});

// 3a. elegir una canción
const barAntes = await bar();
const stAntes = await studioState();
const cardA = page.locator(".lib-card__play").nth(0);
const nombreA = (await page.locator(".lib-card__title").nth(0).textContent())?.trim();
await qa.shot("library-02-elegir-antes");
await cardA.click();
await page.waitForTimeout(4000);
const barPostA = await bar();
const stPostA = await studioState();
await qa.shot("library-02-elegir-despues");
console.log(`  elegir "${nombreA}": rail=${await page.locator(".rail-item.active").textContent()} topbar="${stPostA.topbar}" barra="${barPostA.title}"`);
qa.add({
  control: '(3) Canciones → elegir una canción ("Tocar ...")',
  selector: ".lib-card__play",
  result: stPostA.topbar.includes((nombreA || "").slice(0, 12)) || stPostA.seekerMax > 0 ? "OK" : "FAIL",
  evidence:
    `elegida "${nombreA}": pantalla pasó a "${(await page.locator(".rail-item.active").textContent())?.trim()}", topbar="${stPostA.topbar}" (antes "${stAntes.topbar}"), ` +
    `seeker del Studio max=${stPostA.seekerMax.toFixed(0)}s, botón="${stPostA.boton}"; BARRA: "${barAntes.title}" → "${barPostA.title}" (cola ${barPostA.queueCount})`,
  shot: `${OUT}/library-02-elegir-antes.png · ${OUT}/library-02-elegir-despues.png`,
  extra: { barAntes, barPostA, stAntes, stPostA },
});

// 3b. reproducir la canción elegida, desde el Studio.
// OJO: el motor de audio tarda ~8 s en dar la primera señal en arranque frío
// (medido en qa-all-warmup.mjs), así que la ventana de escucha es larga.
await page.locator(".playback-bar .btn.primary").click();
await page.waitForTimeout(16000);
const rCancion1 = await qa.rms(10, 140);
const srcCancion1 = await qa.src();
await qa.shot("library-03-reproduciendo");
const barSonando = await bar();
console.log(`  reproduciendo desde el Studio: RMS ${rCancion1.toFixed(1)} dB, barra="${barSonando.title}"`);
qa.add({
  control: "(3) Canciones → reproducir la canción elegida",
  selector: ".playback-bar .btn.primary",
  result: rCancion1 > -70 ? "OK" : "FAIL",
  evidence: `RMS ${rCancion1 === -Infinity ? "-inf" : rCancion1.toFixed(1)} dB a los 16 s del click (el arranque en frío del motor tarda ~8 s, ver qa-all-warmup.mjs); ${srcCancion1.live} fuentes vivas; la barra sigue en "${barSonando.title}" (cola ${barSonando.queueCount})`,
  shot: `${OUT}/library-03-reproduciendo.png`,
  extra: { rCancion1, srcCancion1, barSonando },
});

// 3c. cambiar a otra canción desde la biblioteca
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForSelector(".lib-card", { timeout: 15000 });
await page.waitForTimeout(2000);
const nombreB = (await page.locator(".lib-card__title").nth(3).textContent())?.trim();
const rmsAntesCambio = await qa.rms(8, 130);
await qa.shot("library-04-cambiar-antes");
// locator.click() hace auto-scroll: con page.mouse.click + boundingBox se
// mezclan coordenadas de página y de viewport y el click cae en el vacío.
await page.locator(".lib-card__play").nth(3).click();
await page.waitForTimeout(5000);
const stPostB = await studioState();
const barPostB = await bar();
const rmsPostCambio = await qa.rms(10, 130);
const srcPostCambio = await qa.src();
await qa.shot("library-04-cambiar-despues");
console.log(`  cambiar a "${nombreB}": topbar="${stPostB.topbar}" reloj="${stPostB.reloj}" barra="${barPostB.title}" RMS ${rmsPostCambio.toFixed(1)} dB fuentes=${srcPostCambio.live}`);
qa.add({
  control: "(3) Canciones → cambiar a otra canción",
  selector: ".lib-card__play (4ª tarjeta)",
  result: stPostB.topbar !== stPostA.topbar && rmsPostCambio < -70 ? "OK" : "FAIL",
  evidence:
    `de "${nombreA}" a "${nombreB}": topbar "${stPostA.topbar}" → "${stPostB.topbar}"; reloj "${stPostB.reloj}" (el tiempo del transporte volvió a 0: ${stPostB.reloj.startsWith("0:0")}); ` +
    `audio: ${rmsAntesCambio === -Infinity ? "-inf" : rmsAntesCambio.toFixed(1)} dB sonando → ${rmsPostCambio === -Infinity ? "-inf" : rmsPostCambio.toFixed(1)} dB tras el cambio, fuentes vivas ${srcCancion1.live} → ${srcPostCambio.live}`,
  shot: `${OUT}/library-04-cambiar-antes.png · ${OUT}/library-04-cambiar-despues.png`,
  extra: { stPostB, barPostB, rmsPostCambio, srcPostCambio },
});

// 3d. reproducir la segunda y comprobar que suena
await page.locator(".playback-bar .btn.primary").click();
await page.waitForTimeout(12000);
const rCancion2 = await qa.rms(10, 140);
await qa.shot("library-05-segunda-sonando");
qa.add({
  control: "(3) Canciones → reproducir la segunda canción tras el cambio",
  selector: ".playback-bar .btn.primary",
  result: rCancion2 > -70 ? "OK" : "FAIL",
  evidence: `RMS ${rCancion2 === -Infinity ? "-inf" : rCancion2.toFixed(1)} dB; topbar="${(await studioState()).topbar}"`,
  shot: `${OUT}/library-05-segunda-sonando.png`,
  extra: { rCancion2 },
});

// ═══ PESTAÑA "MÚSICA" ══════════════════════════════════════════════════════
console.log("\n################ PESTAÑA MÚSICA ################");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(3000);
await qa.shot("library-06-musica");
const music = await page.evaluate(() => ({
  pmCards: document.querySelectorAll(".pm-card").length,
  pmInfo: document.querySelectorAll(".pm-card__info").length,
  playArt: document.querySelectorAll(".pm-card__art [class*=cover], .pm-card__art button").length,
  generos: [...document.querySelectorAll("h2, h3")].slice(0, 6).map((e) => e.textContent.trim().slice(0, 34)),
  filas: document.querySelectorAll(".pm-row, [class*=pm-list] [role=button]").length,
}));
console.log(`  música: ${JSON.stringify(music)}`);
qa.add({
  control: 'Pestaña "Música — tu reproductor": la biblioteca del reproductor carga',
  selector: ".pm-card",
  result: music.pmCards > 0 ? "OK" : "FAIL",
  evidence: `${music.pmCards} tarjetas .pm-card (${music.pmInfo} con botón de info), estanterías: ${music.generos.join(" / ")}`,
  shot: `${OUT}/library-06-musica.png`,
});

// ═══ PESTAÑA "MÚSICA" — cambio de canción entre tarjetas ═══════════════════
// Se elige la tarjeta POR TÍTULO, no por índice: la lista se re-renderiza
// durante la reproducción y los índices se mueven entre que se lee el título y
// se pulsa (bug del arnés detectado en qa-all-probe.mjs).
const clickTarjetaPorTitulo = async (titulo) => {
  const cand = page.locator(".pm-card__info").filter({ hasText: titulo }).first();
  await cand.scrollIntoViewIfNeeded();
  const b = await cand.boundingBox();
  const enPunto = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const info = el?.closest(".pm-card__info");
    return { dentro: !!info, titulo: (info?.querySelector(".pm-card__title")?.textContent || "").trim() };
  }, { x: b.x + b.width / 2, y: b.y + b.height * 0.6 });
  if (!enPunto.dentro) throw new Error(`el punto de click no cae en la tarjeta "${titulo}"`);
  await cand.click();
  return enPunto;
};

const titulo1 = (await page.locator(".pm-card__title").nth(0).textContent())?.trim();
const titulo2 = (await page.locator(".pm-card__title").nth(2).textContent())?.trim();
const t0 = await bar();
await clickTarjetaPorTitulo(titulo1);
await page.waitForFunction(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== "Nada en reproducción",
  { timeout: 30000 },
);
await page.waitForTimeout(12000);
const t1 = await bar();
await qa.shot("library-07-tarjeta1");
const r1 = await qa.rms(8, 130);
console.log(`  tarjeta "${titulo1}": barra="${t1.title}" RMS ${r1.toFixed(1)} dB`);

const rmsAntesT2 = r1;
await clickTarjetaPorTitulo(titulo2);
await page.waitForFunction(
  (titulo) => (document.querySelector(".pm-bar__title")?.textContent || "").trim() === titulo,
  titulo2,
  { timeout: 30000 },
).catch(() => console.log(`  (la barra no llegó a "${titulo2}" en 30 s)`));
await page.waitForTimeout(11000);
const t2 = await bar();
const r2 = await qa.rms(8, 130);
const src2 = await qa.src();
await qa.shot("library-08-tarjeta3");
console.log(`  tarjeta "${titulo2}": barra="${t2.title}" RMS ${r2.toFixed(1)} dB fuentes=${src2.live}`);
qa.add({
  control: "(3) Música → cambiar de canción desde una tarjeta (dirigido por título)",
  selector: `.pm-card__info:has-text("${titulo2}")`,
  result: t2.title === titulo2 && r2 > -70 ? "OK" : "FAIL",
  evidence:
    `barra "${t0.title}" → "${t1.title}" (tarjeta "${titulo1}", ${t1.seekerMax.toFixed(0)}s, RMS ${r1 === -Infinity ? "-inf" : r1.toFixed(1)} dB) → ` +
    `"${t2.title}" (tarjeta "${titulo2}", ${t2.seekerMax.toFixed(0)}s, RMS ${r2 === -Infinity ? "-inf" : r2.toFixed(1)} dB). ` +
    `Antes del segundo click sonaba a ${rmsAntesT2 === -Infinity ? "-inf" : rmsAntesT2.toFixed(1)} dB; fuentes vivas después ${src2.live} (start ${src2.started}/stop ${src2.stopped}); ` +
    `el título de la barra coincide con la tarjeta pulsada: ${t2.title === titulo2}`,
  shot: `${OUT}/library-07-tarjeta1.png · ${OUT}/library-08-tarjeta3.png`,
  extra: { t0, t1, t2, titulo1, titulo2, r1, r2, src2 },
});

// ═══ IMPORTAR DESDE LA PESTAÑA CANCIONES ═══════════════════════════════════
console.log("\n################ IMPORTAR EN CANCIONES ################");
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForSelector(".lib-card", { timeout: 15000 });
await page.waitForTimeout(2000);
const antes = await page.evaluate(() => ({
  tarjetas: document.querySelectorAll(".lib-card").length,
  titulos: [...document.querySelectorAll(".lib-card__title")].slice(0, 3).map((e) => e.textContent.trim()),
}));
const impInput = page.locator('[aria-label="Subir tu propio MIDI"] input[type=file]');
const impCount = await impInput.count();
console.log(`  input de importación encontrado: ${impCount}; tarjetas antes: ${antes.tarjetas}`);
if (impCount) {
  await impInput.setInputFiles("app/public/demo/Yann_Tiersen_-_Comptine_dun_autre_ete.mid");
  await page.waitForTimeout(7000);
  await qa.shot("library-09-importado-efimero");
  const trasImport = await page.evaluate(() => ({
    ruta: (document.querySelector(".rail-item.active")?.textContent || "").trim(),
    tarjetas: document.querySelectorAll(".lib-card").length,
    topbar: (document.querySelector(".topbar-header p")?.textContent || "").replace(/\s+/g, " ").trim(),
  }));
  console.log(`  tras importar: pestaña activa="${trasImport.ruta}" tarjetas=${trasImport.tarjetas} topbar="${trasImport.topbar}"`);

  // Si la importación cambia de pantalla, hay que VOLVER a Canciones para
  // comprobar que la canción quedó registrada en la biblioteca.
  await page.locator('.rail-item[title="Canciones"]').click();
  await page.waitForSelector(".lib-card", { timeout: 20000 });
  await page.waitForTimeout(3000);
  const desp = await page.evaluate(() => ({
    tarjetas: document.querySelectorAll(".lib-card").length,
    primera: (document.querySelector(".lib-card__title")?.textContent || "").trim(),
    titulos: [...document.querySelectorAll(".lib-card__title")].slice(0, 3).map((e) => e.textContent.trim()),
    badgeImportado: [...document.querySelectorAll(".lib-card__badge-label")].filter((e) => /Importado/i.test(e.textContent || "")).length,
    seccionImportaciones: (document.querySelector("h2, h3")?.textContent || "").trim(),
    importados: [...document.querySelectorAll(".lib-card__title")]
      .filter((e) => /Comptine/i.test(e.textContent || ""))
      .map((e) => e.textContent.trim()),
  }));
  await qa.shot("library-09-importado");
  console.log(`  de vuelta en Canciones: ${desp.tarjetas} tarjetas, primera="${desp.primera}", insignias Importado=${desp.badgeImportado}, títulos Comptine=${JSON.stringify(desp.importados)}`);
  qa.add({
    control: 'Biblioteca: importar un MIDI propio ([aria-label="Subir tu propio MIDI"])',
    selector: '[aria-label="Subir tu propio MIDI"] input[type=file]',
    result: desp.importados.length > 0 || desp.tarjetas > antes.tarjetas ? "OK" : "FAIL",
    evidence:
      `antes: ${antes.tarjetas} tarjetas (${antes.titulos.join(" / ")}). Tras cargar "Yann_Tiersen_-_Comptine_dun_autre_ete.mid": la app saltó a la pestaña "${trasImport.ruta}" con topbar "${trasImport.topbar}" ` +
      `(la pantalla de Canciones se desmontó: ${trasImport.tarjetas} .lib-card en ese momento). De vuelta en Canciones: ${desp.tarjetas} tarjetas, título "${desp.primera}", ` +
      `insignias "Importado"=${desp.badgeImportado}, coincidencias de "Comptine"=${JSON.stringify(desp.importados)}`,
    shot: `${OUT}/library-09-importado-efimero.png · ${OUT}/library-09-importado.png`,
    extra: { antes, trasImport, desp },
  });
} else {
  qa.add({
    control: 'Biblioteca: importar un MIDI propio',
    selector: '[aria-label="Subir tu propio MIDI"] input[type=file]',
    result: "NO VERIFICABLE",
    evidence: 'no se encontró input[type=file] dentro de [aria-label="Subir tu propio MIDI"]',
    shot: `${OUT}/library-01-canciones.png`,
  });
}

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 12).forEach((e) => console.log("  " + e));
qa.add({
  control: "Errores de consola durante la sesión de biblioteca",
  selector: "(global)",
  result: qa.consoleErrors.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.consoleErrors.length} errores: ${[...new Set(qa.consoleErrors)].slice(0, 4).join(" | ") || "ninguno"}`,
  shot: "—",
});

qa.save("results-library");
console.log(`\nresultados: ${qa.results.length} filas → ${OUT}/results-library.json`);
await qa.close();
