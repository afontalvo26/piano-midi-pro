// ============================================================
// qa-all-pausefix — ¿el botón central de la barra pausa de verdad?
// (verificación posterior al arreglo de 12c96e1)
//
// Historia: en la versión ANTERIOR a 12c96e1 este mismo experimento midió que
// el botón NO pausaba (RMS −19,6 → −19,8 dB y la posición siguiendo de 12,4 s a
// 15,4 s, con icono y etiqueta intactos). Aquella medición es el BUG 1 del
// informe; sus capturas quedaron archivadas en .logs/qa/pre-12c96e1/.
//
// Este script sirve para las dos cosas: deja capturas frescas del
// comportamiento ACTUAL y verifica explícitamente que el click llega al nodo
// (contador propio), para que un "no pausa" no se pueda confundir con un
// "el click no llegó".
//
// Salida: .logs/qa/results-pausefix.json  +  .logs/qa/pausefix-*.png
// ============================================================

import { openQA, URL, OUT } from "./qa-all-lib.mjs";

const qa = await openQA();
const { page } = qa;

const probe = () =>
  page.evaluate(() => {
    const bar = document.querySelector(".pm-bar");
    const range = bar?.querySelector(".pm-bar__range");
    const central = [...(bar?.querySelectorAll(".pm-bar__transport button") || [])].find((b) =>
      /^(Pausar|Reproducir)$/.test(b.getAttribute("aria-label") || ""),
    );
    return {
      pos: range ? Number(range.value) : null,
      max: range ? Number(range.max) : null,
      reloj: bar?.querySelector(".pm-bar__time")?.textContent.trim(),
      centralLabel: central?.getAttribute("aria-label"),
      // Forma del icono: pausa son dos barras, play es un triángulo.
      centralPath: central?.querySelector("path")?.getAttribute("d")?.slice(0, 30),
      barTitle: bar?.querySelector(".pm-bar__title")?.textContent.trim(),
      clicks: central?.dataset.qaClicks ?? null,
    };
  });

const rms = (n = 6, gap = 120) => qa.rms(n, gap);
const db = (v) => (v === -Infinity ? "-inf" : v.toFixed(1));

await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3500);
await page.locator('.rail-item[title="Música — tu reproductor"]').click();
await page.waitForSelector(".pm-card__info", { timeout: 25000 });
await page.waitForTimeout(2500);
await page.locator(".pm-card__info").first().click();
await page.waitForFunction(
  () => (document.querySelector(".pm-bar__title")?.textContent || "").trim() !== "Nada en reproducción",
  { timeout: 30000 },
);
// Margen generoso: el arranque en frío tarda ~8 s hasta la primera señal.
await page.waitForTimeout(14000);
await qa.shot("pausefix-00-sonando");

// Contador propio en el nodo: si el click no llega, no es culpa de la app.
await page.evaluate(() => {
  const bar = document.querySelector(".pm-bar");
  const central = [...bar.querySelectorAll(".pm-bar__transport button")].find((b) =>
    /^(Pausar|Reproducir)$/.test(b.getAttribute("aria-label") || ""),
  );
  central.dataset.qaClicks = "0";
  central.addEventListener("click", () => {
    central.dataset.qaClicks = String(Number(central.dataset.qaClicks) + 1);
  });
});

const s0 = await probe();
const r0 = await rms(10, 130);
console.log(`\n### antes de pausar: label="${s0.centralLabel}" icono=${s0.centralPath} pos=${s0.pos?.toFixed(1)}s RMS=${db(r0)} dB`);
await qa.shot("pausefix-01-antes");

await page.locator(".pm-bar__transport button").nth(2).click();
await page.waitForTimeout(2500);
const s1 = await probe();
const r1 = await rms(10, 140);
await qa.shot("pausefix-02-despues");

await page.waitForTimeout(5000);
const s2 = await probe();
const r2 = await rms(10, 140);
await qa.shot("pausefix-03-seis-segundos");
console.log(
  `### después del click (el nodo contó ${s2.clicks} click/s)\n` +
    `   a los 2,5 s: label="${s1.centralLabel}" icono=${s1.centralPath} pos=${s1.pos?.toFixed(1)}s RMS=${db(r1)} dB\n` +
    `   a los 7,5 s: label="${s2.centralLabel}" icono=${s2.centralPath} pos=${s2.pos?.toFixed(1)}s RMS=${db(r2)} dB`,
);

const bajo = r2 < r0 - 20;
const congelada = s2.pos <= (s1.pos ?? 0) + 0.5;
const iconoPlay = (s2.centralPath || "").startsWith("M8 5v14");
qa.add({
  control: 'Barra: "Pausar" / "Reproducir" (botón central) — ¿detiene el audio?',
  selector: ".pm-bar__transport button (central)",
  result: bajo && congelada ? "OK" : "FAIL",
  evidence:
    `partiendo de "${s0.centralLabel}" (icono ${s0.centralPath}) con RMS ${db(r0)} dB y la posición en ${s0.pos?.toFixed(1)}s: el nodo registró ${s2.clicks} click(s); ` +
    `a los 2,5 s el RMS quedó en ${db(r1)} dB y la posición en ${s1.pos?.toFixed(1)}s, y a los 7,5 s en ${db(r2)} dB con la posición en ${s2.pos?.toFixed(1)}s; ` +
    `etiqueta ahora "${s2.centralLabel}" con icono ${s2.centralPath} (el de play es "M8 5v14l11-7z"). Bajó ≥20 dB: ${bajo} · la posición se congeló: ${congelada} · icono de play: ${iconoPlay}`,
  shot: `${OUT}/pausefix-01-antes.png · ${OUT}/pausefix-02-despues.png · ${OUT}/pausefix-03-seis-segundos.png`,
  extra: { s0, s1, s2, r0, r1, r2, bajo, congelada, iconoPlay },
});

// Contraste: el mismo tap, el mismo audio, un control que sí funciona.
const rAntesMute = await rms(8, 130);
await page.locator(".pm-bar__volume button, .pm-bar__volume .pm-tbtn").first().click();
await page.waitForTimeout(2500);
const rMute = await rms(10, 140);
await qa.shot("pausefix-04-silenciado");
console.log(`### contraste (Silenciar): ${db(rAntesMute)} → ${db(rMute)} dB`);
qa.add({
  control: "Control de sanidad: el tap detecta señal en la misma sesión",
  selector: ".pm-bar__volume button",
  result: rMute < rAntesMute - 20 ? "OK" : "FAIL",
  evidence: `el botón Silenciar, medido con el MISMO tap y sobre el MISMO audio, baja el nivel de ${db(rAntesMute)} a ${db(rMute)} dB — un resultado plano en la fila del botón central no puede atribuirse entonces al instrumento de medida`,
  shot: `${OUT}/pausefix-04-silenciado.png`,
  extra: { rAntesMute, rMute },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.save("results-pausefix");
console.log(`resultados: ${qa.results.length} filas → ${OUT}/results-pausefix.json`);
await qa.close();
