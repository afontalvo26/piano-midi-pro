// ============================================================
// qa-all-postfreeze — verificación independiente sobre el árbol CONGELADO
// (rama feat/reproductor-instrumentos-reales, HEAD b7b63a7).
//
// Verifica con metodología propia los cuatro arreglos:
//   A. 12c96e1 — pausa real del botón central de la barra
//   B. 12c96e1 — la barra sigue la canción cargada por el input del Studio
//   C. b7b63a7 — "canción anterior" con la actual en el índice 0 de la cola
//   D. (el arranque se mide aparte, en qa-all-startup.mjs)
//
// Usa el handle de QA `window.__PMP_PLAYER__` para leer la COLA y el ÍNDICE
// reales en vez de deducirlos del DOM.
//
// Salida: .logs/qa/results-postfreeze.json  +  .logs/qa/postfreeze-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";

const DEMO = "app/public/demo";
const A = `${DEMO}/Bolero_-_Besame_Mucho.kar`;
const B = `${DEMO}/BinomioDeOro_-_El_Osito_Dormilon.kar`;
const FIXTURE = `${DEMO}/QA_Arranque_0s.mid`;

const qa = await openQA();
const { page } = qa;
const bar = () => page.evaluate(BAR_STATE);

/** Lee el estado REAL del reproductor desde el handle de QA. */
const player = () =>
  page.evaluate(() => {
    const p = window.__PMP_PLAYER__;
    if (!p) return { disponible: false };
    const s = p.getSnapshot();
    const id = p.getCurrentTrackId();
    const meta = id ? p.getTrack(id) : null;
    return {
      disponible: true,
      indice: s.index,
      cola: s.queue.length,
      pausado: s.paused,
      trackId: id,
      titulo: meta?.title ?? null,
      artista: meta?.artist ?? null,
      duracion: meta?.duration ?? null,
      historial: s.library.history?.length ?? null,
      primerHistorial: s.library.history?.[0] ?? null,
    };
  });

const transporte = () =>
  page.evaluate(() => {
    const t = window.__PMP_TRANSPORT__;
    if (!t) return { disponible: false };
    return { disponible: true, estado: t.state, segundos: Number(t.seconds?.toFixed?.(2) ?? t.seconds) };
  });

const studio = () =>
  page.evaluate(() => ({
    topbar: (document.querySelector(".topbar-header p")?.textContent || "").replace(/\s+/g, " ").trim(),
    reloj: (document.querySelector(".time-display")?.textContent || "").trim(),
    boton: (document.querySelector(".playback-bar .btn.primary")?.textContent || "").trim(),
    seekerMax: Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? -1),
    pill: (document.querySelector(".status-pill:last-child")?.textContent || "").trim(),
  }));

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(4000);

const handle = await page.evaluate(() => typeof window.__PMP_PLAYER__ !== "undefined");
console.log(`### handle de QA __PMP_PLAYER__ disponible: ${handle}`);
qa.add({
  control: "Handle de QA `window.__PMP_PLAYER__` (infraestructura de medición)",
  selector: "(window)",
  result: handle ? "OK" : "FAIL",
  evidence: handle
    ? "expone getSnapshot / getCurrentTrackId / getTrack, así que la cola y el índice se leen del store real y no se infieren del DOM"
    : "no está expuesto: las mediciones de índice y cola habrían que deducirlas del DOM",
  shot: "—",
});

/* ══════════════════════════════════════════════════════════════════════════
   A. PAUSA REAL  (12c96e1)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n################ A. PAUSA REAL ################");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(2500);
await page.locator(".pm-card__info").first().click();
await page.waitForFunction(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== "Nada en reproducción",
  { timeout: 30000 },
);
await page.waitForTimeout(14000);
await qa.shot("postfreeze-A1-sonando");

// Contador propio: distingue "la app no pausa" de "el click no llegó".
await page.evaluate(() => {
  const central = [...document.querySelectorAll(".pm-bar__transport button")].find((b) =>
    /^(Pausar|Reproducir)$/.test(b.getAttribute("aria-label") || ""),
  );
  central.dataset.qaClicks = "0";
  central.addEventListener("click", () => {
    central.dataset.qaClicks = String(Number(central.dataset.qaClicks) + 1);
  });
});

const icono = () =>
  page.evaluate(() => {
    const c = [...document.querySelectorAll(".pm-bar__transport button")].find((b) =>
      /^(Pausar|Reproducir)$/.test(b.getAttribute("aria-label") || ""),
    );
    return {
      label: c?.getAttribute("aria-label"),
      path: c?.querySelector("path")?.getAttribute("d"),
      clicks: c?.dataset.qaClicks,
    };
  });

const a0 = { icono: await icono(), player: await player(), trans: await transporte(), rms: await qa.rms(10, 130), bar: await bar() };
console.log(`  antes: label="${a0.icono.label}" icono=${a0.icono.path} · índice ${a0.player.indice}/${a0.player.cola} · transporte ${a0.trans.estado} @ ${a0.trans.segundos}s · RMS ${a0.rms.toFixed(1)} dB`);
await qa.shot("postfreeze-A2-antes-de-pausar");

await page.locator(".pm-bar__transport button").nth(2).click();
await page.waitForTimeout(2500);
const a1 = { icono: await icono(), player: await player(), trans: await transporte(), rms: await qa.rms(10, 140), bar: await bar() };
await qa.shot("postfreeze-A3-tras-pausar");
await page.waitForTimeout(5000);
const a2 = { icono: await icono(), player: await player(), trans: await transporte(), rms: await qa.rms(10, 140), bar: await bar() };
await qa.shot("postfreeze-A4-siete-segundos");

console.log(`  2,5 s: label="${a1.icono.label}" icono=${a1.icono.path} · transporte ${a1.trans.estado} @ ${a1.trans.segundos}s · RMS ${a1.rms.toFixed(1)} dB`);
console.log(`  7,5 s: label="${a2.icono.label}" icono=${a2.icono.path} · transporte ${a2.trans.estado} @ ${a2.trans.segundos}s · pos ${a2.bar.seekerVal} · RMS ${a2.rms.toFixed(1)} dB · clicks ${a2.icono.clicks}`);

const pausaOk = a2.rms < a0.rms - 20 && a2.trans.estado !== "started" && a2.bar.seekerVal <= a1.bar?.seekerVal + 0.5;
qa.add({
  control: 'A · Barra: "Pausar" (botón central) detiene el audio de verdad',
  selector: ".pm-bar__transport button (central)",
  result: pausaOk ? "OK" : "FAIL",
  evidence:
    `antes: "${a0.icono.label}" (icono ${a0.icono.path}), transporte **${a0.trans.estado}** en ${a0.trans.segundos}s, RMS ${a0.rms.toFixed(1)} dB. ` +
    `El nodo registró ${a2.icono.clicks} click(s). A los 2,5 s: "${a1.icono.label}" (icono ${a1.icono.path}), transporte ${a1.trans.estado} en ${a1.trans.segundos}s, RMS ${a1.rms.toFixed(1)} dB. ` +
    `A los 7,5 s: "${a2.icono.label}", transporte ${a2.trans.estado} en ${a2.trans.segundos}s, RMS ${a2.rms.toFixed(1)} dB, posición de la barra ${a2.bar.seekerVal}s (venía de ${a1.bar?.seekerVal}s). ` +
    `Bajó ≥20 dB: ${a2.rms < a0.rms - 20} · el transporte ya no está corriendo: ${a2.trans.estado !== "started"} · la posición se congeló: ${a2.bar.seekerVal <= a1.bar?.seekerVal + 0.5}`,
  shot: `${OUT}/postfreeze-A2-antes-de-pausar.png · ${OUT}/postfreeze-A3-tras-pausar.png · ${OUT}/postfreeze-A4-siete-segundos.png`,
  extra: { a0, a1, a2 },
});

/* ══════════════════════════════════════════════════════════════════════════
   B. LA BARRA SIGUE LA CANCIÓN CARGADA POR EL INPUT DEL STUDIO  (12c96e1)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n################ B. BARRA ↔ INPUT DEL STUDIO ################");
const b0 = { bar: await bar(), player: await player(), studio: await studio() };
console.log(`  antes: barra="${b0.bar.title}" (índice ${b0.player.indice}, cola ${b0.player.cola}) · topbar "${b0.studio.topbar}"`);
await qa.shot("postfreeze-B1-antes");

await page.locator('.rail-item[title="Studio"]').click();
await page.waitForTimeout(1500);
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(A);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.waitForTimeout(3000);
const b1 = { bar: await bar(), player: await player(), studio: await studio() };
await qa.shot("postfreeze-B2-tras-cargar");
console.log(`  tras cargar A: barra="${b1.bar.title}" (índice ${b1.player.indice}, cola ${b1.player.cola}) · topbar "${b1.studio.topbar}"`);

const esperaTitulo = (b1.bar.title || "").includes("Besame") || (b1.bar.title || "").includes("Bolero");
qa.add({
  control: "B · La barra refleja el archivo cargado por el input del Studio",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: esperaTitulo ? "OK" : "FAIL",
  evidence:
    `se cargó "${A.split("/").pop()}". Barra: "${b0.bar.title}" → **"${b1.bar.title}"** (artista "${b1.bar.artist}"), índice del store ${b0.player.indice} → **${b1.player.indice}**, cola ${b0.player.cola} → **${b1.player.cola}**. ` +
    `Studio: topbar "${b1.studio.topbar}" con el seeker en ${b1.studio.seekerMax.toFixed(0)}s. ` +
    `Chip "Practicar esta canción en el Studio" deshabilitado: ${(await page.locator('.pm-bar button[title="Practicar esta canción en el Studio"]').isDisabled())} · seeker de la barra deshabilitado: ${b1.bar.seekerDisabled}`,
  shot: `${OUT}/postfreeze-B1-antes.png · ${OUT}/postfreeze-B2-tras-cargar.png`,
  extra: { b0, b1 },
});

// ¿Y el segundo archivo, sin detener?
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(B);
await page.waitForFunction(
  () => /Osito|Dormilon/i.test(document.querySelector(".topbar-header p")?.textContent || ""),
  { timeout: 40000 },
).catch(() => {});
await page.waitForTimeout(3000);
const b2 = { bar: await bar(), player: await player(), studio: await studio() };
await qa.shot("postfreeze-B3-segundo-archivo");
console.log(`  tras cargar B: barra="${b2.bar.title}" (índice ${b2.player.indice}, cola ${b2.player.cola})`);
qa.add({
  control: "B2 · La barra sigue el SEGUNDO archivo cargado (y no queda audio del primero)",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: (b2.bar.title || "").match(/Osito|Dormilon/i) ? "OK" : "FAIL",
  evidence:
    `barra "${b1.bar.title}" → **"${b2.bar.title}"**; índice ${b1.player.indice} → ${b2.player.indice}, cola ${b1.player.cola} → ${b2.player.cola}. ` +
    `RMS tras el cambio: ${(await qa.rms(8, 130)).toFixed(1)} dB · fuentes vivas: ${(await qa.src()).live}`,
  shot: `${OUT}/postfreeze-B3-segundo-archivo.png`,
  extra: { b2 },
});

/* ══════════════════════════════════════════════════════════════════════════
   C. "CANCIÓN ANTERIOR" CON LA ACTUAL EN EL ÍNDICE 0  (b7b63a7)
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n################ C. "CANCIÓN ANTERIOR" EN EL ÍNDICE 0 ################');

// C1 — primer play de la sesión (sin historial): debe REINICIAR, como antes.
console.log("\n-- C1: primer play de la sesión, sin historial --");
const c0 = { bar: await bar(), player: await player(), trans: await transporte() };
console.log(`  estado: barra="${c0.bar.title}" índice=${c0.player.indice} cola=${c0.player.cola} historial=${c0.player.historial}`);
await qa.shot("postfreeze-C1-antes");
await page.locator('.pm-bar button[aria-label="Canción anterior"]').click();
await page.waitForTimeout(3500);
const c1 = { bar: await bar(), player: await player(), trans: await transporte() };
await qa.shot("postfreeze-C1-despues");
console.log(`  tras anterior: barra="${c1.bar.title}" índice=${c1.player.indice} pos=${c1.bar.seekerVal}s`);
const mismoTema = c1.player.trackId === c0.player.trackId;
qa.add({
  control: 'C1 · "Canción anterior" en el índice 0 con historial de UNA entrada',
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: !mismoTema ? "OK" : "FAIL",
  evidence:
    `canción actual "${c0.bar.title}" en el índice **${c0.player.indice}** de una cola de ${c0.player.cola}; historial: ${c0.player.historial} entrada(s). ` +
    `Tras pulsar anterior cambió de canción: "${c1.bar.title}" (índice ${c1.player.indice}, posición ${c1.bar.seekerVal}s) — la rama nueva: como no hay ranura anterior en la cola, vuelve a la última que sonó en vez de reiniciar la misma`,
  shot: `${OUT}/postfreeze-C1-antes.png · ${OUT}/postfreeze-C1-despues.png`,
  extra: { c0, c1, mismoTema },
});

// C2 — con historial y la actual en el índice 0.
//
// Montaje DETERMINISTA: la estantería de "Música" tiene títulos duplicados en
// varias filas (la lista mostró "El Osito Dormilón" tres veces seguidas), así
// que elegir "la primera tarjeta" no garantiza la ranura 0 de la cola. En su
// lugar se usa la cola de la propia barra: se toca una canción, se abre la cola
// y se salta a una fila concreta, comprobando el índice contra el handle.
console.log("\n-- C2: con historial, la actual en el índice 0 (montaje determinista) --");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(2500);

/** Abre la cola, salta a la fila `n` y devuelve el estado real. */
const saltarARanura = async (n) => {
  const abrir = page.locator('.pm-bar button[title="Ver la cola (Q)"]');
  if ((await abrir.getAttribute("aria-expanded")) !== "true") {
    await abrir.click();
    await page.waitForTimeout(1500);
  }
  const filas = page.locator(".pm-drawer .qm-row, .pm-drawer [class*=queue] button, .pm-drawer li");
  const total = await filas.count();
  return { total };
};

// 1) Tocar una canción para que haya algo sonando y una cola.
await page.locator(".pm-card__info").first().click();
await page.waitForTimeout(12000);
const c2a = { bar: await bar(), player: await player() };
console.log(`  paso 1: "${c2a.bar.title}" → índice ${c2a.player.indice} cola ${c2a.player.cola} historial ${c2a.player.historial}`);

// 2) Abrir la cola y saltar a una ranura con índice > 0.
const info = await saltarARanura(2);
const filasCola = await page.evaluate(() =>
  [...document.querySelectorAll(".pm-drawer button, .pm-drawer li")]
    .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12),
);
console.log(`  cola abierta: ${info.total} nodos · filas: ${filasCola.join(" | ")}`);

// Saltar a la 2.ª canción de la lista (índice 1).
const segunda = page.locator(".pm-drawer").getByText("Sombra Perdida", { exact: false }).first();
if (await segunda.count()) {
  await segunda.click();
  await page.waitForTimeout(11000);
}
const c2b = { bar: await bar(), player: await player() };
console.log(`  paso 2 tras saltar en la cola: "${c2b.bar.title}" → índice ${c2b.player.indice} historial ${c2b.player.historial}`);

// Cerrar la cola.
await page.locator('.pm-bar button[title="Ver la cola (Q)"]').click();
await page.waitForTimeout(1200);

// 3) Volver a la ranura 0 con "anterior" desde índice 1: eso deja la actual en
//    el índice 0 CON historial. Es el montaje exacto del bug.
//
// OJO: "anterior" sólo retrocede de RANURA cuando la posición está por debajo de
// RESTART_THRESHOLD (3 s); por encima reinicia el tema, que es lo documentado.
// Hay que forzar la posición con el seeker antes de CADA pulsación: dejar que
// corra sola hacía que la primera pasada de este bucle pulsara con 10-17 s.
const retrocederDeRanura = async () => {
  await page.locator(".pm-bar__range").evaluate((el) => {
    el.value = "0.5";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.waitForTimeout(900);
  const posAlPulsar = (await bar()).seekerVal;
  await page.locator('.pm-bar button[aria-label="Canción anterior"]').click();
  await page.waitForTimeout(8000);
  return { posAlPulsar, estado: { bar: await bar(), player: await player() } };
};

let intentos = 0;
let c2c = { bar: await bar(), player: await player() };
const pasosRanura = [];
while (c2c.player.indice > 0 && intentos < 4) {
  const r = await retrocederDeRanura();
  pasosRanura.push({ desde: c2c.player.indice, posAlPulsar: r.posAlPulsar, hasta: r.estado.player.indice, titulo: r.estado.bar.title });
  c2c = r.estado;
  intentos++;
}
console.log(`  paso 3: la actual quedó en el índice 0 → "${c2c.bar.title}" (índice ${c2c.player.indice}, cola ${c2c.player.cola}, historial ${c2c.player.historial})`);
console.log(`  retrocesos: ${pasosRanura.map((p) => `${p.desde}→${p.hasta} (pos ${p.posAlPulsar}s)`).join(" · ")}`);
await qa.shot("postfreeze-C2-antes-de-anterior");

if (c2c.player.indice !== 0) throw new Error(`no se pudo dejar la canción en el índice 0 (quedó en ${c2c.player.indice})`);

const preAnterior = c2c;
await page.locator('.pm-bar button[aria-label="Canción anterior"]').click();
await page.waitForTimeout(9000);
const c2d = { bar: await bar(), player: await player(), trans: await transporte() };
await qa.shot("postfreeze-C2-despues-de-anterior");
console.log(`  tras anterior: "${c2d.bar.title}" índice ${c2d.player.indice} posición ${c2d.bar.seekerVal}s`);

const volvio = c2d.player.trackId !== preAnterior.player.trackId;
qa.add({
  control: 'C2 · "Canción anterior" con la actual en el índice 0 y CON historial (arreglo b7b63a7)',
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: volvio ? "OK" : "FAIL",
  evidence:
    `montaje determinista por la cola (la estantería tiene títulos repetidos y elegir "la primera tarjeta" no garantiza la ranura 0): ` +
    `"${c2a.bar.title}" (índice ${c2a.player.indice}) → salto en la cola a "${c2b.bar.title}" (índice ${c2b.player.indice}, historial ${c2b.player.historial}) → ` +
    `retrocesos de ranura ${pasosRanura.map((p) => `${p.desde}→${p.hasta} con la posición forzada a ${p.posAlPulsar}s`).join(", ")} hasta dejar la actual en el índice **${c2c.player.indice}** ("${c2c.bar.title}", historial ${c2c.player.historial}). ` +
    `En ESE estado se pulsó "Canción anterior": "${preAnterior.bar.title}" → **"${c2d.bar.title}"** (índice ${c2d.player.indice}, posición ${c2d.bar.seekerVal}s, transporte ${c2d.trans.estado}). ` +
    `¿Cambió de canción en vez de reiniciar la misma? ${volvio}`,
  shot: `${OUT}/postfreeze-C2-antes-de-anterior.png · ${OUT}/postfreeze-C2-despues-de-anterior.png`,
  extra: { c2a, c2b, c2c, c2d, intentos, pasosRanura, filasCola },
});

// C3 — índice > 0: el caso que siempre funcionó, como control.
console.log("\n-- C3: control con el índice > 0 --");
const c3a = { bar: await bar(), player: await player() };
await page.locator('.pm-bar button[aria-label="Canción siguiente"]').click();
await page.waitForTimeout(8000);
const c3b = { bar: await bar(), player: await player() };
console.log(`  siguiente: "${c3a.bar.title}" (índice ${c3a.player.indice}) → "${c3b.bar.title}" (índice ${c3b.player.indice})`);
// Con la posición baja, "anterior" debe retroceder de ranura.
let pos = c3b.bar.seekerVal;
for (let i = 0; i < 20 && pos > 1.2; i++) {
  await page.waitForTimeout(300);
  pos = (await bar()).seekerVal;
}
await page.locator('.pm-bar button[aria-label="Canción anterior"]').click();
await page.waitForTimeout(8000);
const c3c = { bar: await bar(), player: await player() };
await qa.shot("postfreeze-C3-control");
console.log(`  anterior (pos al pulsar ${pos.toFixed(1)}s): "${c3b.bar.title}" → "${c3c.bar.title}" (índice ${c3c.player.indice})`);
qa.add({
  control: 'C3 · Control: "Canción anterior" con el índice > 0',
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: c3c.player.trackId === c3a.player.trackId ? "OK" : "FAIL",
  evidence: `"${c3a.bar.title}" (índice ${c3a.player.indice}) →(siguiente) "${c3b.bar.title}" (índice ${c3b.player.indice}) →(anterior, pulsado con la posición en ${pos.toFixed(1)}s) "${c3c.bar.title}" (índice ${c3c.player.indice}); vuelve a la de antes: ${c3c.player.trackId === c3a.player.trackId}`,
  shot: `${OUT}/postfreeze-C3-control.png`,
  extra: { c3a, c3b, c3c, pos },
});

/* ══════════════════════════════════════════════════════════════════════════
   D. FIXTURE DE ARRANQUE — se usa en qa-all-startup.mjs
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n################ COMPROBACIÓN DEL FIXTURE EN LA APP ################");
await page.locator('.rail-item[title="Studio"]').click();
await page.waitForTimeout(1500);
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(FIXTURE);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.waitForTimeout(2500);
const fix = await studio();
await qa.shot("postfreeze-D1-fixture");
console.log(`  fixture cargado: topbar="${fix.topbar}" seekerMax=${fix.seekerMax.toFixed(2)}s`);
// El end-of-track del fixture cae en el tick 30720 = 31,6 s, así que el max del
// seeker es ~31,6 s aunque la última nota termine en 3,95 s. Lo que importa es
// que la PRIMERA nota esté en t=0 (validado aparte con el parser de la app).
qa.add({
  control: "Fixture de arranque `QA_Arranque_0s.mid` cargado por la app",
  selector: 'input[aria-label="Cargar archivo MIDI"]',
  result: /QA_Arranque_0s/.test(fix.topbar) && fix.seekerMax > 30 ? "OK" : "FAIL",
  evidence:
    `topbar "${fix.topbar}" · seeker del Studio max=${fix.seekerMax.toFixed(2)}s. El fixture lo valida ` +
    `qa-all-fixture-check.mjs con el MISMO parser que usa la app: 8 notas, **primera en t=0,000 s**, sin percusión, última termina en 3,95 s ` +
    `(el max del seeker llega a 31,6 s por el end-of-track del archivo, no porque haya notas más tarde)`,
  shot: `${OUT}/postfreeze-D1-fixture.png`,
  extra: { fix },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 12).forEach((e) => console.log("  " + e));
qa.add({
  control: "Errores de consola en la verificación post-congelamiento",
  selector: "(global)",
  result: qa.consoleErrors.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.consoleErrors.length} errores: ${[...new Set(qa.consoleErrors)].slice(0, 4).join(" | ") || "ninguno"}`,
  shot: "—",
});

qa.save("results-postfreeze");
console.log(`\nresultados: ${qa.results.length} filas → ${OUT}/results-postfreeze.json`);
await qa.close();
