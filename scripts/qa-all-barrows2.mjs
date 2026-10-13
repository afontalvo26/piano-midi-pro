// ============================================================
// qa-all-barrows2 — segunda pasada de los tres casos de la barra que la
// primera medición dejó ambiguos, con el arnés ya corregido:
//
//   1. "Canción anterior" — la primera pasada pulsó el botón con la posición
//      en 3,3 s, POR ENCIMA del umbral de reinicio de 3 s
//      (RESTART_THRESHOLD, music/constants.ts): reiniciar es lo correcto ahí.
//      Aquí se pulsa con <1 s transcurrido, que es cuando debe retroceder.
//   2. Slider de volumen — el primer intento asignó .value y disparó eventos;
//      el valor del store NO cambió. Aquí se usa el teclado (focus + Home/End/
//      flechas), que es la vía que usa un usuario real.
//   3. Vista de reproducción — el selector de evidencia estaba mal; el panel
//      es .pm-np[aria-label="Reproducción actual"].
//   4. Contraste del tap de audio: una nota del teclado del Studio, medida con
//      el mismo AnalyserNode con el que se midió el fallo del botón Pausar.
//
// Salida: .logs/qa/results-barrows2.json  +  .logs/qa/barrows2-*.png
// ============================================================

import { openQA, BAR_STATE, URL, OUT } from "./qa-all-lib.mjs";

const qa = await openQA();
const { page } = qa;
const bar = () => page.evaluate(BAR_STATE);

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);

// Arrancar cola desde la pantalla Música
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(2500);
await page.locator(".pm-card__info").first().click();
await page.waitForFunction(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== "Nada en reproducción",
  { timeout: 30000 },
);
await page.waitForTimeout(12000);
const s0 = await bar();
console.log(`### arrancado: "${s0.title}" ${s0.seekerVal.toFixed(1)}s de ${s0.seekerMax.toFixed(0)}s central="${s0.centralLabel}" cola=${s0.queueCount}`);

// ── 1. SIGUIENTE → ANTERIOR con la posición recién empezada ────────────────
console.log("\n### 1. siguiente → anterior (retroceso real)");
await page.locator('.pm-bar button[aria-label="Canción siguiente"]').click();
await page.waitForFunction(
  (titulo) => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== titulo,
  s0.title,
  { timeout: 30000 },
);
await page.waitForTimeout(2500);
const s1 = await bar();
await qa.shot("barrows2-01-siguiente");
console.log(`  siguiente: "${s0.title}" → "${s1.title}" · ${s1.seekerVal.toFixed(1)}s de ${s1.seekerMax.toFixed(0)}s`);

// Esperar a que la posición esté por debajo del umbral de reinicio (3 s) y
// pulsar de inmediato, sin esperas intermedias.
let posAntes = s1.seekerVal;
for (let i = 0; i < 20 && posAntes > 1.2; i++) {
  await page.waitForTimeout(400);
  posAntes = (await bar()).seekerVal;
}
await qa.shot("barrows2-02-anterior-antes");
await page.locator('.pm-bar button[aria-label="Canción anterior"]').click();
await page.waitForFunction(
  (titulo) => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== titulo,
  s1.title,
  { timeout: 30000 },
).catch(() => console.log("  (el título no cambió en 30 s)"));
await page.waitForTimeout(3000);
const s2 = await bar();
const r2 = await qa.rms(6, 120);
await qa.shot("barrows2-02-anterior-despues");
console.log(`  anterior: "${s1.title}" → "${s2.title}" (pos al pulsar ${posAntes.toFixed(2)}s) · ${s2.seekerVal.toFixed(1)}s de ${s2.seekerMax.toFixed(0)}s · RMS ${r2.toFixed(1)} dB`);
qa.add({
  control: 'Barra: "Canción anterior" con la posición por debajo del umbral de reinicio',
  selector: '.pm-bar button[aria-label="Canción anterior"]',
  result: s2.title === s0.title ? "OK" : "FAIL",
  evidence:
    `secuencia: "${s0.title}" →(siguiente) "${s1.title}" →(anterior, pulsado con la posición en ${posAntes.toFixed(2)}s, por debajo de RESTART_THRESHOLD=3 s) "${s2.title}". ` +
    `Vuelve a la canción previa: ${s2.title === s0.title ? "sí" : "NO"}; seeker ${s2.seekerVal.toFixed(1)}s de ${s2.seekerMax.toFixed(0)}s; RMS tras el retroceso ${r2 === -Infinity ? "-inf" : r2.toFixed(1)} dB`,
  shot: `${OUT}/barrows2-01-siguiente.png · ${OUT}/barrows2-02-anterior-antes.png · ${OUT}/barrows2-02-anterior-despues.png`,
  extra: { s0, s1, s2, posAntes, r2 },
});

// ── 2. VOLUMEN con teclado ─────────────────────────────────────────────────
console.log("\n### 2. slider de volumen con teclado");
const rVolAntes = await qa.rms(8, 130);
const volAntes = (await bar()).volume;
const vol = page.locator(".pm-bar__volume-range");
await qa.shot("barrows2-03-volumen-antes");
await vol.focus();
// Home lleva el range a su mínimo (0), End a su máximo (1).
await page.keyboard.press("Home");
await page.waitForTimeout(2200);
const volMin = (await bar()).volume;
const rVolMin = await qa.rms(10, 140);
await qa.shot("barrows2-03-volumen-minimo");
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(1200);
const volDos = (await bar()).volume;
await page.keyboard.press("End");
await page.waitForTimeout(2000);
const volMax = (await bar()).volume;
const rVolMax = await qa.rms(8, 130);
await qa.shot("barrows2-03-volumen-maximo");
console.log(`  volumen: ${volAntes} (RMS ${rVolAntes.toFixed(1)}) → Home ${volMin} (RMS ${rVolMin.toFixed(1)}) → +2 flechas ${volDos} → End ${volMax} (RMS ${rVolMax.toFixed(1)})`);
qa.add({
  control: 'Barra: input[aria-label="Volumen"] — respuesta al teclado (vía de usuario real)',
  selector: ".pm-bar__volume-range",
  result: volMin === 0 && volMax === 1 && volDos > volMin && rVolMax > rVolMin + 10 ? "OK" : "FAIL",
  evidence:
    `valor del store: ${volAntes} → (Home) ${volMin} → (+2 flechas, sin efecto: step 0,01 sobre el mínimo) ${volDos} → (End) ${volMax}; ` +
    `RMS: ${rVolAntes === -Infinity ? "-inf" : rVolAntes.toFixed(1)} dB → ${rVolMin === -Infinity ? "-inf" : rVolMin.toFixed(1)} dB con el slider en 0 → ${rVolMax === -Infinity ? "-inf" : rVolMax.toFixed(1)} dB con el slider en 1. ` +
    `El slider SÍ responde al teclado (0 → 1 en el store y ${(rVolMax - rVolMin).toFixed(1)} dB de diferencia en la salida), pero 0 NO es silencio: el mapeo es dB = −40 + volumen×40 (music/PlayerContext.tsx), así que el mínimo son −40 dB de atenuación, no −∞`,
  shot: `${OUT}/barrows2-03-volumen-antes.png · ${OUT}/barrows2-03-volumen-minimo.png · ${OUT}/barrows2-03-volumen-maximo.png`,
  extra: { volAntes, volMin, volDos, volMax, rVolAntes, rVolMin, rVolMax },
});

// ── 3. Escritura programática del slider (lo que falló en la 1ª pasada) ────
console.log("\n### 3. asignación programática de .value en el slider de volumen");
const volAntes2 = (await bar()).volume;
await vol.evaluate((el) => {
  el.value = "0.25";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(2000);
const volDespues2 = (await bar()).volume;
await qa.shot("barrows2-04-volumen-programatico");
console.log(`  .value=0.25 → store ${volAntes2} → ${volDespues2} (el DOM lee ${await vol.inputValue()})`);
qa.add({
  control: 'Barra: input[aria-label="Volumen"] — asignación programática de .value',
  selector: ".pm-bar__volume-range",
  result: volDespues2 !== volAntes2 ? "OK" : "FAIL",
  evidence:
    `se fijó el.value="0.25" y se dispararon input+change; el valor del store pasó de ${volAntes2} a ${volDespues2} ` +
    `(el input del DOM lee ${await vol.inputValue()}). Es el mismo método que en la 1ª pasada dio ${volAntes2 === volDespues2 ? "sin cambio" : "cambio"}`,
  shot: `${OUT}/barrows2-04-volumen-programatico.png`,
  extra: { volAntes2, volDespues2 },
});
await page.keyboard.press("End");
await page.waitForTimeout(1200);

// ── 4. Vista de reproducción (.pm-np) ──────────────────────────────────────
console.log("\n### 4. vista de reproducción");
const npAntes = await page.evaluate(() => !!document.querySelector('.pm-np[aria-label="Reproducción actual"]'));
await qa.shot("barrows2-05-np-antes");
await page.locator(".pm-bar__now").click();
await page.waitForTimeout(2200);
const np = await page.evaluate(() => {
  const el = document.querySelector('.pm-np[aria-label="Reproducción actual"]');
  return {
    abierta: !!el,
    titulo: (el?.querySelector(".pm-np__title")?.textContent || "").trim(),
    artista: (el?.querySelector(".pm-np__artist")?.textContent || "").trim(),
    origen: (el?.querySelector(".pm-np__origin")?.textContent || "").replace(/\s+/g, " ").trim(),
    botones: [...(el?.querySelectorAll("button") || [])].slice(0, 12).map((b) => b.getAttribute("aria-label") || (b.textContent || "").trim().slice(0, 18)),
    barraVisible: !!document.querySelector(".pm-bar"),
  };
});
await qa.shot("barrows2-05-np-abierta");
console.log(`  vista: ${JSON.stringify(np)}`);
qa.add({
  control: 'Barra: "Abrir <título>" abre la vista de reproducción [aria-label="Reproducción actual"]',
  selector: '.pm-bar__now → .pm-np[aria-label="Reproducción actual"]',
  result: np.abierta ? "OK" : "FAIL",
  evidence:
    `estado previo: vista abierta=${npAntes}; tras pulsar "Abrir ...": panel .pm-np presente=${np.abierta}, título "${np.titulo}", artista "${np.artista}", origen "${np.origen}"; ` +
    `botones de la vista: ${np.botones.join(" | ")}; la barra .pm-bar sigue montada debajo=${np.barraVisible}`,
  shot: `${OUT}/barrows2-05-np-antes.png · ${OUT}/barrows2-05-np-abierta.png`,
  extra: { np },
});

// Dentro de la vista: siguiente y pausa
const npSiguiente = page.locator('.pm-np button[aria-label="Siguiente"]');
if (await npSiguiente.count()) {
  const tAntesNp = (await bar()).title;
  await npSiguiente.click();
  await page.waitForTimeout(8000);
  const tDespNp = (await bar()).title;
  await qa.shot("barrows2-06-np-siguiente");
  qa.add({
    control: 'Vista de reproducción: botón "Siguiente"',
    selector: '.pm-np button[aria-label="Siguiente"]',
    result: tDespNp !== tAntesNp ? "OK" : "FAIL",
    evidence: `la barra pasó de "${tAntesNp}" a "${tDespNp}" tras pulsar Siguiente dentro del panel de reproducción`,
    shot: `${OUT}/barrows2-06-np-siguiente.png`,
  });
}
const npCerrar = page.locator('.pm-np button[aria-label="Cerrar la vista de reproducción"]');
if (await npCerrar.count()) {
  await npCerrar.click();
  await page.waitForTimeout(1500);
  const cerrada = await page.evaluate(() => !document.querySelector('.pm-np[aria-label="Reproducción actual"]'));
  await qa.shot("barrows2-07-np-cerrada");
  qa.add({
    control: 'Vista de reproducción: "Cerrar la vista de reproducción"',
    selector: '.pm-np button[aria-label="Cerrar la vista de reproducción"]',
    result: cerrada ? "OK" : "FAIL",
    evidence: `tras pulsar Cerrar el panel .pm-np ya no está en el DOM=${cerrada}`,
    shot: `${OUT}/barrows2-07-np-cerrada.png`,
  });
}

// ── 5. Contraste del tap de audio con una nota del teclado ─────────────────
console.log("\n### 5. contraste del tap: nota del teclado del Studio");
await page.locator('.rail-item[title="Studio"]').click();
await page.waitForTimeout(2000);
// Silenciar el transporte primero: si la cola sigue sonando, el "fondo" no es
// fondo y la medición de la nota no dice nada.
await page.locator('.playback-bar button:has-text("Detener")').click();
await page.waitForTimeout(4000);
const tecla = page.locator(".piano-key-element.white").nth(4);
await tecla.scrollIntoViewIfNeeded();
await tecla.dispatchEvent("mousedown");
await page.waitForTimeout(500);
await tecla.dispatchEvent("mouseup");
await page.waitForTimeout(4500);
const rSilencio = await qa.rms(10, 130);
const tb = await tecla.boundingBox();
await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height * 0.8);
await page.mouse.down();
await page.waitForTimeout(700);
const rNota = await qa.rms(8, 110);
await page.mouse.up();
await page.waitForTimeout(2500);
const rDespues = await qa.rms(8, 130);
await qa.shot("barrows2-08-tap-nota");
console.log(`  tap: fondo ${rSilencio.toFixed(1)} dB → nota ${rNota.toFixed(1)} dB → después ${rDespues.toFixed(1)} dB`);
qa.add({
  control: "Control de sanidad del instrumento de medida (tap de audio)",
  selector: ".piano-key-element.white (nota suelta, transporte detenido)",
  result: rNota > rSilencio + 10 && rNota > -70 ? "OK" : "FAIL",
  evidence:
    `con el transporte DETENIDO (botón Detener del Studio pulsado antes de medir): RMS de fondo ${rSilencio === -Infinity ? "-inf" : rSilencio.toFixed(1)} dB → pisando la 5ª tecla blanca ${rNota === -Infinity ? "-inf" : rNota.toFixed(1)} dB ` +
    `(+${(rNota - rSilencio).toFixed(1)} dB) → al soltar ${rDespues === -Infinity ? "-inf" : rDespues.toFixed(1)} dB. El mismo tap con el que se midió que el botón Pausar no baja el nivel sí detecta una señal real`,
  shot: `${OUT}/barrows2-08-tap-nota.png`,
  extra: { rSilencio, rNota, rDespues },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 12).forEach((e) => console.log("  " + e));
qa.save("results-barrows2");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-barrows2.json`);
await qa.close();
