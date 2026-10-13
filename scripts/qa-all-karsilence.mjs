// ============================================================
// qa-all-karsilence — por qué Besame_Mucho.kar no suena en el Studio.
//
// Datos que ya tenemos:
//   • .mid (Yann Tiersen, The Entertainer): RMS −26 dB / −20 dB, avanza bien.
//   • .kar (Bolero Besame Mucho): RMS −inf en 18 muestras, botón "Cargando…",
//     píldora de estado "Esperando activación".
//
// Este script mide lo que decide el asunto: estado del AudioContext, si su
// reloj avanza, si el transporte del Studio avanza, y si un gesto de usuario
// (click en el documento) o un segundo click en Reproducir lo desbloquean.
//
// Salida: .logs/qa/results-karsilence.json  +  .logs/qa/karsilence-*.png
// ============================================================

import { openQA, URL, OUT } from "./qa-all-lib.mjs";

const SONG = "app/public/demo/Bolero_-_Besame_Mucho.kar";
const SONG2 = "app/public/demo/BinOMIO_PLACEHOLDER";

// Instrumentación extra: espiar cada AudioContext creado y sus resume().
const CTX_TAP = `
(() => {
  window.__CTX = [];
  const Orig = window.AudioContext;
  const track = (ctx) => {
    const rec = { ctx, resumen: 0, creado: performance.now() };
    window.__CTX.push(rec);
    const oResume = ctx.resume.bind(ctx);
    ctx.resume = function (...a) { rec.resumen++; return oResume(...a); };
  };
  window.AudioContext = function (...a) {
    const ctx = new Orig(...a);
    track(ctx);
    return ctx;
  };
  window.AudioContext.prototype = Orig.prototype;
  if (window.webkitAudioContext) window.webkitAudioContext = window.AudioContext;
  window.__CTXSTATE = () =>
    window.__CTX.map((r) => ({
      estado: r.ctx.state,
      reloj: Number(r.ctx.currentTime.toFixed(2)),
      sampleRate: r.ctx.sampleRate,
      resumen: r.resumen,
      edadMs: Math.round(performance.now() - r.creado),
    }));
})();
`;

const qa = await openQA();
const { page } = qa;
await page.addInitScript(CTX_TAP);

const muestra = () =>
  page.evaluate(() => {
    const seek = document.querySelector('.seeker-container input[type="range"]');
    return {
      studioPos: seek ? Number(seek.value) : null,
      reloj: (document.querySelector(".time-display")?.textContent || "").trim(),
      boton: (document.querySelector(".playback-bar .btn.primary")?.textContent || "").trim(),
      pill: (document.querySelector(".status-pill:last-child")?.textContent || "").trim(),
      ctx: window.__CTXSTATE ? window.__CTXSTATE() : null,
    };
  });

const seguir = async (n, etiqueta) => {
  const filas = [];
  for (let i = 0; i < n; i++) {
    const m = await muestra();
    const rms = await qa.rms(3, 90);
    const c = m.ctx?.[0];
    filas.push({ t: i * 0.6, pos: m.studioPos, reloj: m.reloj, boton: m.boton, rms, ctx: c?.estado, ctxReloj: c?.reloj, resumen: c?.resumen });
    await page.waitForTimeout(600);
  }
  const silencioso = filas.every((f) => f.rms < -70);
  const posAvance = (filas[filas.length - 1].pos ?? 0) - (filas[0].pos ?? 0);
  const ctxAvance = (filas[filas.length - 1].ctxReloj ?? 0) - (filas[0].ctxReloj ?? 0);
  console.log(
    `\n--- ${etiqueta} ---\n` +
      `    posición Studio ${filas[0].pos?.toFixed(1)}s → ${filas[filas.length - 1].pos?.toFixed(1)}s (Δ=${posAvance.toFixed(1)}s) · botón "${filas[0].boton}" → "${filas[filas.length - 1].boton}"\n` +
      `    AudioContext estado="${filas[0].ctx}" reloj ${filas[0].ctxReloj}s → ${filas[filas.length - 1].ctxReloj}s (Δ=${ctxAvance.toFixed(2)}s) resume()=${filas[filas.length - 1].resumen}\n` +
      `    RMS ${silencioso ? "TODO < −70 dB" : `pico ${Math.max(...filas.map((f) => f.rms)).toFixed(1)} dB`} · muestras ${filas.filter((_, i) => i % 4 === 0).map((f) => `${f.rms === -Infinity ? "-inf" : f.rms.toFixed(1)}`).join(" ")}\n` +
      `    píldora "${filas[0].pill}"`,
  );
  return { filas, silencioso, posAvance, ctxAvance };
};

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(SONG);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.waitForTimeout(3000);
await qa.shot("karsilence-01-cargado");

await page.locator('.seeker-container input[type="range"]').evaluate((el) => {
  el.value = String(Number(el.max) * 0.25);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1200);

const pre = await muestra();
console.log(`### antes de pulsar Reproducir: ctx=${JSON.stringify(pre.ctx)} botón="${pre.boton}" píldora="${pre.pill}"`);

// PASO 1: click en Reproducir
await page.locator(".playback-bar .btn.primary").click();
const p1 = await seguir(18, "1. tras pulsar Reproducir (18 muestras / ~11 s)");
await qa.shot("karsilence-02-tras-reproducir");
qa.add({
  control: 'Studio: reproducir "Bolero_-_Besame_Mucho.kar" (archivo .kar real)',
  selector: ".playback-bar .btn.primary",
  result: p1.silencioso ? "FAIL" : "OK",
  evidence:
    `píldora de estado del audio "${pre.pill}"; AudioContext estado="${p1.filas[0].ctx}" con reloj ${p1.filas[0].ctxReloj}s → ${p1.filas[p1.filas.length - 1].ctxReloj}s (Δ=${p1.ctxAvance.toFixed(2)}s); ` +
    `posición del Studio ${p1.filas[0].pos?.toFixed(1)}s → ${p1.filas[p1.filas.length - 1].pos?.toFixed(1)}s (Δ=${p1.posAvance.toFixed(1)}s); ` +
    `botón "${p1.filas[0].boton}" → "${p1.filas[p1.filas.length - 1].boton}"; RMS ${p1.silencioso ? "SIEMPRE < −70 dB en las 18 muestras" : `pico ${Math.max(...p1.filas.map((f) => f.rms)).toFixed(1)} dB`}`,
  shot: `${OUT}/karsilence-01-cargado.png · ${OUT}/karsilence-02-tras-reproducir.png`,
  extra: { pre, p1 },
});

// PASO 2: gesto de usuario sobre el documento (desbloqueo de autoplay)
await page.mouse.click(800, 400);
const p2 = await seguir(12, "2. tras un click en el documento");
await qa.shot("karsilence-03-tras-click");

// PASO 3: segundo click en Reproducir
const btn2 = page.locator(".playback-bar .btn.primary");
const etiqueta2 = ((await btn2.textContent()) || "").trim();
if (etiqueta2 === "Reproducir") await btn2.click();
else {
  // Está en "Pausa" o "Cargando…": pulsar Pausa y volver a Reproducir.
  await btn2.click();
  await page.waitForTimeout(1500);
  if (((await btn2.textContent()) || "").trim() === "Reproducir") await btn2.click();
}
const p3 = await seguir(18, `3. tras volver a pulsar el botón (venía de "${etiqueta2}")`);
await qa.shot("karsilence-04-segundo-click");
qa.add({
  control: 'Studio: ¿se desbloquea el audio de "Bolero_-_Besame_Mucho.kar"?',
  selector: ".playback-bar .btn.primary",
  result: p3.silencioso ? "FAIL" : "OK",
  evidence:
    `tras un click en el documento y un segundo intento de reproducción: AudioContext estado="${p3.filas[0].ctx}" (resume() llamado ${p3.filas[p3.filas.length - 1].resumen} veces), ` +
    `posición ${p3.filas[0].pos?.toFixed(1)}s → ${p3.filas[p3.filas.length - 1].pos?.toFixed(1)}s, botón "${p3.filas[p3.filas.length - 1].boton}", RMS ${p3.silencioso ? "sigue < −70 dB" : `pico ${Math.max(...p3.filas.map((f) => f.rms)).toFixed(1)} dB`}`,
  shot: `${OUT}/karsilence-03-tras-click.png · ${OUT}/karsilence-04-segundo-click.png`,
  extra: { p2, p3, etiqueta2 },
});

// PASO 4: mismo examen con un .mid — control de que el entorno sí suena
console.log("\n################ control: un .mid en el mismo entorno ################");
await page.locator('.playback-bar button:has-text("Detener")').click();
await page.waitForTimeout(2500);
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles("app/public/demo/Yann_Tiersen_-_Comptine_dun_autre_ete.mid");
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.waitForTimeout(2500);
await page.locator(".playback-bar .btn.primary").click();
const p4 = await seguir(14, "4. control .mid (mismo entorno, misma sesión)");
await qa.shot("karsilence-05-control-mid");
qa.add({
  control: 'Studio: reproducir un .mid en el MISMO entorno (control del diagnóstico)',
  selector: ".playback-bar .btn.primary",
  result: p4.silencioso ? "FAIL" : "OK",
  evidence:
    `misma sesión y mismo navegador que el .kar: AudioContext estado="${p4.filas[0].ctx}", posición ${p4.filas[0].pos?.toFixed(1)}s → ${p4.filas[p4.filas.length - 1].pos?.toFixed(1)}s, ` +
    `botón "${p4.filas[p4.filas.length - 1].boton}", RMS ${p4.silencioso ? "silencio" : `pico ${Math.max(...p4.filas.map((f) => f.rms)).toFixed(1)} dB`}`,
  shot: `${OUT}/karsilence-05-control-mid.png`,
  extra: { p4 },
});

// PASO 5: ¿y el .kar DESPUÉS de que el motor ya está caliente con el .mid?
console.log("\n################ volver al .kar con el motor ya caliente ################");
await page.locator('.playback-bar button:has-text("Detener")').click();
await page.waitForTimeout(2500);
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(SONG);
await page.waitForFunction(
  () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
  { timeout: 40000 },
);
await page.waitForTimeout(3000);
await page.locator('.seeker-container input[type="range"]').evaluate((el) => {
  el.value = String(Number(el.max) * 0.25);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1200);
await page.locator(".playback-bar .btn.primary").click();
const p5 = await seguir(18, "5. .kar con el motor ya caliente");
await qa.shot("karsilence-06-kar-caliente");
qa.add({
  control: "Studio: .kar de nuevo, con el motor de audio ya inicializado por un .mid",
  selector: ".playback-bar .btn.primary",
  result: p5.silencioso ? "FAIL" : "OK",
  evidence:
    `mismo archivo que falló en el paso 1, ahora con el AudioContext ya construido: estado="${p5.filas[0].ctx}", posición ${p5.filas[0].pos?.toFixed(1)}s → ${p5.filas[p5.filas.length - 1].pos?.toFixed(1)}s, ` +
    `botón "${p5.filas[p5.filas.length - 1].boton}", RMS ${p5.silencioso ? "sigue < −70 dB" : `pico ${Math.max(...p5.filas.map((f) => f.rms)).toFixed(1)} dB`}`,
  shot: `${OUT}/karsilence-06-kar-caliente.png`,
  extra: { p5 },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 12).forEach((e) => console.log("  " + e));
console.log(`### RECURSOS FALLIDOS: ${qa.failing.length}`);
[...new Set(qa.failing)].slice(0, 12).forEach((e) => console.log("  " + e));
qa.add({
  control: "Recursos HTTP fallidos durante el diagnóstico del .kar",
  selector: "(network)",
  result: qa.failing.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.failing.length} fallos; ejemplos: ${[...new Set(qa.failing)].slice(0, 6).join(" | ") || "ninguno"}`,
  shot: "—",
});
void SONG2;
qa.save("results-karsilence");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-karsilence.json`);
await qa.close();
