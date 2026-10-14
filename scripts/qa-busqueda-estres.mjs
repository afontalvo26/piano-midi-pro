/**
 * Estrés del buscador: ¿la app se cae o se degrada al usarla muchas veces?
 *
 * ── QUÉ SEPARA ESTE TEST ───────────────────────────────────────────────────
 *
 * Un heap que crece al tipear puede ser dos cosas muy distintas:
 *
 *   a) **basura sin recolectar** — el GC la va a liberar; no es fuga.
 *   b) **fuga real** — cada ciclo retiene memoria, y con uso repetido el
 *      renderer termina muriendo por OOM. ESO sería "se cae la app".
 *
 * Para distinguirlas se mide con `HeapProfiler.collectGarbage` antes de cada
 * muestra: si tras forzar el GC el heap sigue subiendo ciclo a ciclo, es fuga.
 * Si vuelve al mismo valor, era basura.
 *
 * Uso: node scripts/qa-busqueda-estres.mjs [puerto] [pantalla] [ciclos]
 */

import { chromium } from "@playwright/test";

const PORT = process.argv[2] ?? "1236";
const PANTALLA = process.argv[3] ?? "musica";
const CICLOS = Number(process.argv[4] ?? 12);
const BASE = `http://localhost:${PORT}/`;

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const cdp = await context.newCDPSession(page);

let crasheado = false;
let crashEn = null;
page.on("crash", () => {
  crasheado = true;
  console.log("\n!!! page.on('crash') — EL RENDERER SE CAYÓ !!!\n");
});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
});

const firmas =
  PANTALLA === "musica"
    ? { input: ".pm-search__input", fila: ".pm-row" }
    : { input: ".lib-search__input", fila: ".lib-card" };

async function muestra() {
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = (await cdp.send("Runtime.getHeapUsage")).usedSize;
  const dom = await cdp.send("Memory.getDOMCounters");
  const elementos = await page.evaluate(() => document.querySelectorAll("*").length);
  return { heapMB: +(heap / 1048576).toFixed(1), nodos: dom.nodes, elementos };
}

console.log(`\n=== ESTRÉS DEL BUSCADOR — puerto ${PORT}, pantalla ${PANTALLA}, ${CICLOS} ciclos ===`);

await page.goto(BASE, { waitUntil: "domcontentloaded" });
if (PANTALLA === "musica") {
  await page.getByRole("button", { name: /^Música$/ }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^Buscar$/ }).first().click();
  await page.waitForSelector(".pm-search__input", { timeout: 60000 });
} else {
  await page.getByRole("button", { name: /Canciones/ }).first().click();
  await page.waitForSelector(".lib-card", { timeout: 60000 });
}
await page.waitForTimeout(2500);

const search = page.locator(firmas.input).first();
await search.click();

// Latencia por tecla medida en la página.
await page.evaluate(() => {
  const w = window;
  w.__lat = { claves: [], longTasks: [] };
  const input = document.querySelector('input[type="search"]');
  let pendiente = null;
  input?.addEventListener(
    "input",
    () => {
      pendiente = { valor: input.value, t0: performance.now() };
      const objetivo = pendiente;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!objetivo) return;
          w.__lat.claves.push({ valor: objetivo.valor, ms: +(performance.now() - objetivo.t0).toFixed(1) });
          pendiente = null;
        }),
      );
    },
    true,
  );
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__lat.longTasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    /* sin longtask */
  }
});

const inicial = await muestra();
console.log(
  `\nArranque (tras GC): heap ${inicial.heapMB} MB, ${inicial.elementos} elementos, ${inicial.nodos} nodos`,
);
console.log("\n  ciclo   heap(MB)  Δheap   elementos   nodos   ms del ciclo");

const serie = [inicial];
for (let i = 1; i <= CICLOS; i++) {
  if (crasheado) {
    console.log(`  ${String(i).padStart(5)}   — la pestaña ya no responde —`);
    break;
  }
  const t0 = Date.now();
  try {
    // Escribir letra por letra (caso del dueño) y después vaciar.
    await search.fill("");
    await page.waitForTimeout(150);
    for (const ch of "cor") {
      await search.press(ch);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(400);
    await search.fill("");
    await page.waitForTimeout(400);
  } catch (error) {
    crasheado = true;
    crashEn = i;
    console.log(`  ${String(i).padStart(5)}   — falló al interactuar: ${String(error).slice(0, 90)}`);
    break;
  }
  const m = await muestra();
  const previa = serie[serie.length - 1];
  serie.push(m);
  console.log(
    `  ${String(i).padStart(5)}   ${String(m.heapMB).padStart(7)}  ` +
      `${String((m.heapMB - previa.heapMB).toFixed(1)).padStart(6)}   ` +
      `${String(m.elementos).padStart(9)}   ${String(m.nodos).padStart(5)}   ${Date.now() - t0}`,
  );
}

let datos = { claves: [], longTasks: [] };
if (!crasheado) {
  try {
    datos = await page.evaluate(() => window.__lat);
  } catch {
    /* la página ya no está */
  }
}

if (datos.claves.length) {
  const ms = datos.claves.map((c) => c.ms).sort((a, b) => a - b);
  console.log(
    `\nLatencia por tecla (en la página): min ${ms[0]} · mediana ${ms[Math.floor(ms.length / 2)]} · ` +
      `p90 ${ms[Math.floor(ms.length * 0.9)]} · max ${ms[ms.length - 1]} ms  (${ms.length} teclas)`,
  );
}
if (datos.longTasks.length) {
  const l = [...datos.longTasks].sort((a, b) => b - a);
  console.log(
    `Tareas largas >50 ms: ${l.length} · peor ${l[0]} ms · mediana ${l[Math.floor(l.length / 2)]} ms`,
  );
}

// Tendencia: ¿el heap retenido sube ciclo a ciclo?
if (serie.length >= 4) {
  const primero = serie[1].heapMB;
  const ultimo = serie[serie.length - 1].heapMB;
  const pendiente = (ultimo - primero) / (serie.length - 2);
  console.log(
    `\nHeap retenido (tras GC forzado): ${primero} MB -> ${ultimo} MB en ${serie.length - 2} ciclos ` +
      `= ${pendiente >= 0 ? "+" : ""}${pendiente.toFixed(2)} MB por ciclo`,
  );
  console.log(
    pendiente > 0.5
      ? "  OJO: el heap retenido crece con el uso — hay fuga."
      : "  OK: el heap retenido no crece con el uso (lo que sube es basura, no fuga).",
  );
}

console.log("\n=== ERRORES ===");
console.log(`  crash            : ${crasheado ? `SÍ${crashEn ? ` (ciclo ${crashEn})` : ""}` : "no"}`);
console.log(`  errores de JS    : ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 5)) console.log(`    ${e}`);
console.log(`  errores consola  : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 5)) console.log(`    ${e}`);

try {
  await browser.close();
} catch {
  /* ya cerrada */
}

if (crasheado || pageErrors.length) process.exitCode = 1;
