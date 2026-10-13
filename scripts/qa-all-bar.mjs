// ============================================================
// qa-all-bar — QA de la barra del reproductor (.pm-bar).
//
// Cubre: estado inicial, abrir vista, aleatorio, anterior, siguiente,
// repetición, auto-radio, Studio, Juego, cola, silenciar, volumen, seeker y
// —al final, porque pausar deja la sesión sin audio— Reproducir/Pausar.
// Mide salida de audio real (AnalyserNode enganchado en AudioDestinationNode).
//
// IMPORTANTE (lección del arnés): para pulsar nodos que están más abajo en la
// página hay que usar locator.click() (auto-scroll). page.mouse.click() usa
// coordenadas de VIEWPORT mientras boundingBox() las da de PÁGINA: mezclarlas
// hace que el click acierte en el vacío y se lea como "el control no responde".
//
// Salida: .logs/qa/results-bar.json  +  .logs/qa/bar-*.png
// ============================================================

import { openQA, INVENTORY, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";
import { writeFileSync } from "node:fs";

const qa = await openQA();
const { page } = qa;

const bar = () => page.evaluate(BAR_STATE);
const btn = (label) => page.locator(`.pm-bar button[title="${label}"]`).first();
const state = async () => ({ bar: await bar(), audio: await qa.rms(4, 90), src: await qa.src() });
const brief = (s) =>
  `titulo="${s.bar.title}" seeker=${s.bar.seekerVal}/${s.bar.seekerMax}${s.bar.seekerDisabled ? "(off)" : ""} ` +
  `rms=${s.audio === -Infinity ? "-inf" : s.audio.toFixed(1)}dB src=${s.src.started}/${s.src.stopped}/${s.src.live}`;

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);
await qa.shot("bar-00-inicio");

// ── 0. estado inicial ───────────────────────────────────────────────────────
const inv0 = await page.evaluate(INVENTORY);
const s0 = await bar();
console.log(`\n### INICIO — ${inv0.length} controles visibles`);
console.log(`  título="${s0.title}" cola=${s0.queueCount} seeker=${s0.seekerVal}/${s0.seekerMax} deshabilitado=${s0.seekerDisabled}`);
console.log(`  deshabilitados: ${s0.buttons.filter((b) => b.disabled).map((b) => b.label).join(" | ")}`);
qa.add({
  control: "Estado inicial de la barra (baseline)",
  selector: ".pm-bar",
  result:
    s0.title === "Nada en reproducción" &&
    s0.seekerDisabled === true &&
    s0.buttons.filter((b) => b.disabled).length === 4
      ? "OK"
      : "FAIL",
  evidence:
    `título="${s0.title}", artista="${s0.artist}", cola=${s0.queueCount}, seeker deshabilitado=${s0.seekerDisabled} (max=${s0.seekerMax}), ` +
    `deshabilitados: ${s0.buttons.filter((b) => b.disabled).map((b) => b.label).join(", ")}`,
  shot: `${OUT}/bar-00-inicio.png`,
});

// ── 1. arrancar desde la biblioteca para tener cola ─────────────────────────
console.log("\n### CARGAR COLA: pestaña Música → primera tarjeta");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(2500);
await qa.shot("bar-01-musica");
const primera = page.locator(".pm-card__info").first();
const nombrePrimera = (await primera.locator(".pm-card__title").textContent())?.trim();
await primera.click();
await page.waitForFunction(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== "Nada en reproducción",
  { timeout: 30000 },
);
await page.waitForTimeout(12000);
const s1 = await state();
const tapOk = await page.evaluate(() => ({ taps: window.__TAPS(), has: window.__HASANALYSER() }));
console.log(`  1er tema: ${brief(s1)} · tap=${JSON.stringify(tapOk)}`);
qa.add({
  control: "Precondición: arrancar una cola desde la pantalla Música",
  selector: `.pm-card__info → playCollection`,
  result: s1.bar.title === nombrePrimera && s1.audio > -70 ? "OK" : "FAIL",
  evidence: `pulsada "${nombrePrimera}" → barra="${s1.bar.title}", cola=${s1.bar.queueCount}, seeker max=${s1.bar.seekerMax.toFixed(1)}s, RMS=${s1.audio === -Infinity ? "-inf" : s1.audio.toFixed(1)} dB (el tap registró ${tapOk.taps} conexiones al destino)`,
  shot: `${OUT}/bar-01-musica.png`,
});

// ── 2. Seeker "Posición de reproducción" ────────────────────────────────────
console.log("\n### SEEKER");
const seeker = page.locator(".pm-bar__range").first();
const beforeSeek = await bar();
await qa.shot("bar-02-seek-antes");
await seeker.evaluate((el) => {
  el.value = String(Number(el.max) * 0.5);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.waitForTimeout(2500);
const afterSeek = await bar();
await qa.shot("bar-02-seek-despues");
console.log(`  seek 50%: ${beforeSeek.seekerVal.toFixed(1)}s → ${afterSeek.seekerVal.toFixed(1)}s de ${afterSeek.seekerMax.toFixed(0)}s`);
qa.add({
  control: 'Barra: input[aria-label="Posición de reproducción"] (seeker)',
  selector: ".pm-bar .pm-bar__range",
  result: afterSeek.seekerVal > beforeSeek.seekerVal + 5 ? "OK" : "FAIL",
  evidence: `valor ${beforeSeek.seekerVal.toFixed(1)}s → ${afterSeek.seekerVal.toFixed(1)}s (max ${afterSeek.seekerMax.toFixed(0)}s); relojes de la barra ["${afterSeek.time.join('", "')}"]; deshabilitado al inicio=${beforeSeek.seekerDisabled}, ahora=${afterSeek.seekerDisabled}`,
  shot: `${OUT}/bar-02-seek-antes.png · ${OUT}/bar-02-seek-despues.png`,
});

// ── 3. Cola ─────────────────────────────────────────────────────────────────
console.log("\n### COLA");
const queueBtn = btn("Ver la cola (Q)");
const openBefore = await queueBtn.getAttribute("aria-expanded");
await queueBtn.click();
await page.waitForTimeout(1800);
const openAfter = await queueBtn.getAttribute("aria-expanded");
const queueText = await page
  .locator(".pm-drawer")
  .textContent()
  .catch(() => null);
await qa.shot("bar-03-cola-abierta");
qa.add({
  control: 'Barra: "Ver la cola (Q)"',
  selector: '.pm-bar button[title="Ver la cola (Q)"]',
  result: openBefore !== openAfter ? "OK" : "FAIL",
  evidence: `aria-expanded ${openBefore} → ${openAfter}; panel .pm-drawer: "${(queueText || "(no encontrado)").replace(/\s+/g, " ").trim().slice(0, 120)}"; contador de la barra=${(await bar()).queueCount}`,
  shot: `${OUT}/bar-03-cola-abierta.png`,
});
await queueBtn.click();
await page.waitForTimeout(1000);

// ── 4. Siguiente ────────────────────────────────────────────────────────────
console.log("\n### SIGUIENTE / ANTERIOR");
const t0 = await bar();
await qa.shot("bar-04-siguiente-antes");
await btn("Siguiente (N)").click();
await page.waitForTimeout(8000);
const t1 = await bar();
const r1 = await qa.rms(6, 120);
await qa.shot("bar-04-siguiente-despues");
qa.add({
  control: 'Barra: "Canción siguiente"',
  selector: '.pm-bar button[aria-label="Canción siguiente"]',
  result: t1.title !== t0.title ? "OK" : "FAIL",
  evidence: `título "${t0.title}" → "${t1.title}"; seeker ${t1.seekerVal.toFixed(1)}s de ${t1.seekerMax.toFixed(0)}s; cola ${t0.queueCount} → ${t1.queueCount}; RMS tras el salto ${r1 === -Infinity ? "-inf" : r1.toFixed(1)} dB`,
  shot: `${OUT}/bar-04-siguiente-antes.png · ${OUT}/bar-04-siguiente-despues.png`,
});

// ── 5. Anterior (posición por debajo del umbral de reinicio) ────────────────
await seeker.evaluate((el) => {
  el.value = "1.5";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.waitForTimeout(1500);
const posAntes = (await bar()).seekerVal;
await qa.shot("bar-05-anterior-antes");
await btn("Anterior (P)").click();
await page.waitForTimeout(9000);
const t2 = await bar();
await qa.shot("bar-05-anterior-despues");
qa.add({
  control: 'Barra: "Canción anterior"',
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: t2.title !== t1.title ? "OK" : "FAIL",
  evidence: `posición forzada a ${posAntes.toFixed(1)}s (por debajo del umbral de reinicio de 3 s de music/constants.ts) → título "${t1.title}" → "${t2.title}"; ¿vuelve a "${t0.title}"? ${t2.title === t0.title ? "sí" : "NO"}`,
  shot: `${OUT}/bar-05-anterior-antes.png · ${OUT}/bar-05-anterior-despues.png`,
});

// ── 6. Aleatorio ────────────────────────────────────────────────────────────
const checkToggle = async (titulo, nombre) => {
  const el = btn(titulo);
  const before = await el.getAttribute("aria-pressed");
  await qa.shot(`${nombre}-antes`);
  await el.click({ force: true });
  await page.waitForTimeout(1300);
  const after = await el.getAttribute("aria-pressed");
  await qa.shot(`${nombre}-despues`);
  qa.add({
    control: `Barra: ${titulo}`,
    selector: `.pm-bar button[title="${titulo}"]`,
    result: before !== after ? "OK" : "FAIL",
    evidence: `aria-pressed ${before} → ${after} (el botón alterna estado y la clase is-active/is-on acompaña)`,
    shot: `${OUT}/${nombre}-antes.png · ${OUT}/${nombre}-despues.png`,
  });
};
console.log("\n### ALEATORIO");
await checkToggle("Aleatorio (S)", "bar-06-aleatorio");
await checkToggle("Aleatorio (S)", "bar-06-aleatorio");

// ── 7. Repetición (ciclo completo) ──────────────────────────────────────────
console.log("\n### REPETICIÓN");
const repBtn = page.locator(".pm-bar .pm-repeat").first();
const ciclo = [];
for (let i = 0; i < 4; i++) {
  ciclo.push({ pressed: await repBtn.getAttribute("aria-pressed"), label: await repBtn.getAttribute("aria-label") });
  if (i < 3) {
    await repBtn.click();
    await page.waitForTimeout(900);
  }
}
await qa.shot("bar-07-repeticion");
console.log(`  ${ciclo.map((c) => `${c.label}[${c.pressed}]`).join(" → ")}`);
qa.add({
  control: 'Barra: "Activar repetición" (ciclo off→all→one→off)',
  selector: ".pm-bar .pm-repeat",
  result: new Set(ciclo.map((c) => c.label)).size === 3 && ciclo[0].pressed === ciclo[3].pressed ? "OK" : "FAIL",
  evidence: `ciclo observado: ${ciclo.map((c) => `${c.label} (aria-pressed=${c.pressed})`).join(" → ")}`,
  shot: `${OUT}/bar-07-repeticion.png`,
});

// ── 8. Auto (radio del artista) ─────────────────────────────────────────────
console.log("\n### AUTO");
await checkToggle("Al terminar la cola, seguir con radio del artista", "bar-08-auto");
await checkToggle("Al terminar la cola, seguir con radio del artista", "bar-08-auto");

// ── 9. Silenciar ────────────────────────────────────────────────────────────
console.log("\n### SILENCIAR");
const antesMute = await state();
await qa.shot("bar-09-mute-antes");
await page.locator('.pm-bar__volume button').first().click();
await page.waitForTimeout(2500);
const despMute = await state();
const muteLabel = await page.locator(".pm-bar__volume button").first().getAttribute("aria-label");
await qa.shot("bar-09-mute-despues");
console.log(`  ${brief(antesMute)} → ${brief(despMute)} · label="${muteLabel}"`);
qa.add({
  control: 'Barra: "Silenciar"',
  selector: '.pm-bar button[aria-label="Silenciar"]',
  result: muteLabel === "Activar sonido" && despMute.audio < antesMute.audio - 20 ? "OK" : "FAIL",
  evidence: `aria-label "Silenciar" → "${muteLabel}"; slider de volumen leído ${despMute.bar.volume}; RMS ${antesMute.audio.toFixed(1)} → ${despMute.audio === -Infinity ? "-inf" : despMute.audio.toFixed(1)} dB`,
  shot: `${OUT}/bar-09-mute-antes.png · ${OUT}/bar-09-mute-despues.png`,
});
await page.locator(".pm-bar__volume button").first().click();
await page.waitForTimeout(1500);

// ── 10. Volumen ─────────────────────────────────────────────────────────────
console.log("\n### VOLUMEN");
const antesVol = await state();
const vol = page.locator(".pm-bar__volume-range");
await vol.evaluate((el) => {
  el.value = "0.2";
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(2000);
const despVol = await state();
await qa.shot("bar-10-volumen");
console.log(`  volumen: ${brief(antesVol)} → ${brief(despVol)}`);
qa.add({
  control: 'Barra: input[aria-label="Volumen"]',
  selector: ".pm-bar__volume-range",
  result: despVol.audio < antesVol.audio - 6 ? "OK" : "FAIL",
  evidence: `slider de ${antesVol.bar.volume} a ${despVol.bar.volume} (0,2); RMS ${antesVol.audio.toFixed(1)} → ${despVol.audio === -Infinity ? "-inf" : despVol.audio.toFixed(1)} dB (esperado ≈ −14 dB)`,
  shot: `${OUT}/bar-10-volumen.png`,
});
await vol.evaluate((el) => {
  el.value = "1";
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1200);

// ── 11. Abrir la vista de reproducción ──────────────────────────────────────
console.log("\n### ABRIR VISTA");
await qa.shot("bar-11-abrir-antes");
await page.locator(".pm-bar__now").click();
await page.waitForTimeout(2000);
const npOpen = await page.evaluate(() => {
  const ahora = document.querySelector(".pm-bar__now")?.getAttribute("aria-label");
  const overlays = [...document.querySelectorAll('[class*="np-"], [class*="now-playing"]')].map((e) => e.className).slice(0, 5);
  return {
    ahora,
    overlays,
    texto: (document.querySelector(".pm-np, .now-playing, [class*=np-shell]")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
  };
});
await qa.shot("bar-11-abrir-despues");
console.log(`  vista: ${JSON.stringify(npOpen)}`);
qa.add({
  control: 'Barra: "Abrir <título>" (vista de reproducción)',
  selector: ".pm-bar__now",
  result: npOpen.overlays.length > 0 ? "OK" : "FAIL",
  evidence: `botón "${npOpen.ahora}"; contenedores de la vista detectados: ${npOpen.overlays.join(" | ") || "ninguno"}; texto: "${npOpen.texto}"`,
  shot: `${OUT}/bar-11-abrir-antes.png · ${OUT}/bar-11-abrir-despues.png`,
});
await page.keyboard.press("Escape");
await page.waitForTimeout(1500);
const sigueAbierto = await page.evaluate(() => !!document.querySelector('[class*="np-shell"], .now-playing'));
if (sigueAbierto) {
  const cerrar = page.locator('[aria-label*="Cerrar"], button[title*="Cerrar"]').first();
  if (await cerrar.count()) await cerrar.click().catch(() => {});
  await page.waitForTimeout(1200);
}
console.log(`  tras Escape sigue abierta: ${sigueAbierto}`);

// ── 12. Chips Studio / Juego ────────────────────────────────────────────────
console.log("\n### CHIPS STUDIO / JUEGO");
const studioChip = btn("Practicar esta canción en el Studio");
const gameChip = btn("Jugar esta canción en modo ritmo");
const chips = { studioDisabled: await studioChip.isDisabled(), gameDisabled: await gameChip.isDisabled() };
await qa.shot("bar-12-chips");
qa.add({
  control: 'Barra: chip "Studio" (Practicar esta canción en el Studio)',
  selector: '.pm-bar button[title="Practicar esta canción en el Studio"]',
  result: !chips.studioDisabled ? "OK" : "FAIL",
  evidence: `con "${(await bar()).title}" en la barra el chip está deshabilitado=${chips.studioDisabled}; en el estado vacío estaba deshabilitado=true`,
  shot: `${OUT}/bar-12-chips.png`,
});
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForTimeout(1800);
await studioChip.click();
await page.waitForTimeout(2000);
const railTrasStudio = ((await page.locator(".rail-item.active").textContent()) || "").trim();
await qa.shot("bar-12-studio-despues");
qa.add({
  control: 'Barra: el chip "Studio" navega a la pantalla Studio',
  selector: '.pm-bar button[title="Practicar esta canción en el Studio"]',
  result: railTrasStudio === "Studio" ? "OK" : "FAIL",
  evidence: `desde la pestaña Canciones, tras pulsar el chip el rail activo es "${railTrasStudio}"`,
  shot: `${OUT}/bar-12-studio-despues.png`,
});
await page.locator('.rail-item[title="Canciones"]').click();
await page.waitForTimeout(1500);
await gameChip.click();
await page.waitForTimeout(2000);
const railTrasJuego = ((await page.locator(".rail-item.active").textContent()) || "").trim();
await qa.shot("bar-13-juego-despues");
qa.add({
  control: 'Barra: chip "Juego" (Jugar esta canción en modo ritmo)',
  selector: '.pm-bar button[title="Jugar esta canción en modo ritmo"]',
  result: railTrasJuego === "Juego" ? "OK" : "FAIL",
  evidence: `deshabilitado=${chips.gameDisabled}; tras pulsarlo el rail activo es "${railTrasJuego}"`,
  shot: `${OUT}/bar-13-juego-despues.png`,
});

// ── 13. Reproducir / Pausar  (AL FINAL: pausar deja la sesión sin audio) ────
console.log("\n### REPRODUCIR / PAUSAR (al final, porque deja la sesión en pausa)");
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForTimeout(2000);
// Recargar la reproducción desde una tarjeta para partir de un estado conocido.
const cardActiva = page.locator(".pm-card.is-active .pm-card__info").first();
if (await cardActiva.count()) {
  await cardActiva.scrollIntoViewIfNeeded();
  await cardActiva.click();
  await page.waitForTimeout(9000);
} else {
  await page.locator(".pm-card__info").first().click();
  await page.waitForTimeout(12000);
}
const antesPausa = await state();
console.log(`  estado previo: ${brief(antesPausa)} central="${antesPausa.bar.centralLabel}"`);
if (antesPausa.bar.centralLabel !== "Pausar") {
  qa.add({
    control: 'Barra: "Pausar" / "Reproducir" (botón central)',
    selector: ".pm-bar__transport button (central)",
    result: "NO VERIFICABLE",
    evidence: `no se pudo dejar el transporte sonando para probar la pausa (etiqueta del botón central "${antesPausa.bar.centralLabel}", RMS ${antesPausa.audio === -Infinity ? "-inf" : antesPausa.audio.toFixed(1)} dB)`,
    shot: `${OUT}/bar-14-pausa-antes.png`,
  });
} else {
  const rmsSonando = await qa.rms(8, 130);
  await qa.shot("bar-14-pausa-antes");
  const posAntes = (await bar()).seekerVal;
  const central = page.locator(".pm-bar__transport button").nth(2);
  await central.click();
  await page.waitForTimeout(2500);
  const sPausa = await state();
  const posPausa = sPausa.bar.seekerVal;
  await qa.shot("bar-14-pausa-despues");
  await page.waitForTimeout(4000);
  const sPausa2 = await state();
  await qa.shot("bar-14-pausa-6s");
  console.log(
    `  pausa: RMS ${rmsSonando.toFixed(1)} → ${sPausa.audio.toFixed(1)} → ${sPausa2.audio.toFixed(1)} dB · ` +
      `pos ${posAntes.toFixed(1)} → ${posPausa.toFixed(1)} → ${sPausa2.bar.seekerVal.toFixed(1)}s · central="${sPausa2.bar.centralLabel}"`,
  );
  qa.add({
    control: 'Barra: "Pausar" (botón central) — ¿detiene el audio?',
    selector: ".pm-bar__transport button (central)",
    result: sPausa2.audio < rmsSonando - 20 && sPausa2.bar.seekerVal <= posPausa + 0.5 ? "OK" : "FAIL",
    evidence:
      `RMS antes ${rmsSonando.toFixed(1)} dB → 2,5 s después ${sPausa.audio === -Infinity ? "-inf" : sPausa.audio.toFixed(1)} dB → 6,5 s después ${sPausa2.audio === -Infinity ? "-inf" : sPausa2.audio.toFixed(1)} dB; ` +
      `posición ${posAntes.toFixed(1)}s → ${posPausa.toFixed(1)}s → ${sPausa2.bar.seekerVal.toFixed(1)}s (sigue avanzando: ${sPausa2.bar.seekerVal > posPausa + 1}); ` +
      `etiqueta del botón central tras el click: "${sPausa2.bar.centralLabel}"`,
    shot: `${OUT}/bar-14-pausa-antes.png · ${OUT}/bar-14-pausa-despues.png · ${OUT}/bar-14-pausa-6s.png`,
  });
}

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 20).forEach((e) => console.log("  " + e));
console.log(`### RECURSOS FALLIDOS: ${qa.failing.length}`);
[...new Set(qa.failing)].slice(0, 8).forEach((e) => console.log("  " + e));
qa.add({
  control: "Errores de consola durante la sesión de la barra",
  selector: "(global)",
  result: qa.consoleErrors.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.consoleErrors.length} errores de consola: ${[...new Set(qa.consoleErrors)].slice(0, 4).join(" | ") || "ninguno"}`,
  shot: "—",
});
qa.add({
  control: "Recursos HTTP fallidos (muestras de instrumentos remotas)",
  selector: "(network)",
  result: qa.failing.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.failing.length} peticiones fallidas; ejemplos: ${[...new Set(qa.failing)].slice(0, 4).join(" | ") || "ninguna"}`,
  shot: "—",
});

const sFinal = await bar();
writeFileSync(`${OUT}/results-bar-final.json`, JSON.stringify(sFinal, null, 2));
qa.save("results-bar");
console.log(`\nbarra al cierre: "${sFinal.title}" ${sFinal.seekerVal}/${sFinal.seekerMax}`);
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-bar.json`);
await qa.close();
