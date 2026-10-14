/**
 * Mide QUÉ se come el hilo al escribir en el buscador de canciones.
 *
 * ── POR QUÉ ASÍ, Y NO CON IMPRESIONES ──────────────────────────────────────
 *
 * "Se traba al buscar" no dice qué arreglar. Este script separa las tres cosas
 * que pueden costar, porque se arreglan distinto:
 *
 *   1. **JavaScript** (`ScriptDuration`) — filtrar 3.977 canciones por tecla,
 *      reconciliar React, montar filas.
 *   2. **Estilo y layout** (`RecalcStyleDuration`, `LayoutDuration`) — el costo
 *      de que el navegador recomponga lo que se montó.
 *   3. **Tiempo total de tareas** (`TaskDuration`) — lo que el usuario percibe
 *      como "se congeló".
 *
 * La latencia por tecla se mide DENTRO de la página (del evento `input` a dos
 * frames después), no con relojes de Node: un `press()` de Playwright incluye
 * ida y vuelta por CDP y mediría el test, no la app.
 *
 * La memoria y los nodos salen de CDP (`Runtime.getHeapUsage`,
 * `Memory.getDOMCounters`) porque `performance.memory` está cuantizado: medido,
 * seguía diciendo 13,6 MB después de asignar 64 MB.
 *
 * Uso: node scripts/profile-busqueda.mjs [puerto] [pantalla] [consulta]
 *      pantalla = canciones | musica
 */

import { chromium } from "@playwright/test";

const PORT = process.argv[2] ?? "1236";
const PANTALLA = process.argv[3] ?? "musica";
const CONSULTA = process.argv[4] ?? "corazon";
const BASE = `http://localhost:${PORT}/`;

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const cdp = await context.newCDPSession(page);

const crashed = { value: false };
page.on("crash", () => {
  crashed.value = true;
  console.log("\n!!! CRASH DEL RENDERER !!!\n");
});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));

const firmas =
  PANTALLA === "musica"
    ? { input: ".pm-search__input", fila: ".pm-row", titulo: ".pm-row__title" }
    : { input: ".lib-search__input", fila: ".lib-card", titulo: ".lib-card__title" };

const heapMB = async () => +((await cdp.send("Runtime.getHeapUsage")).usedSize / 1048576).toFixed(1);
const domCounters = async () => cdp.send("Memory.getDOMCounters");
const elementos = () => page.evaluate(() => document.querySelectorAll("*").length);

/** Métricas acumuladas del proceso de render, en segundos. */
async function perfMetrics() {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const out = {};
  for (const m of metrics) out[m.name] = m.value;
  return out;
}

const seg = (a, b, k) => +(((b[k] ?? 0) - (a[k] ?? 0)) * 1000).toFixed(0);

console.log(`\n=== BUSCADOR — puerto ${PORT}, pantalla ${PANTALLA}, consulta "${CONSULTA}" ===`);

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

/**
 * Latencia por tecla, medida en la página: del `input` a dos frames después.
 * Se esperan dos `requestAnimationFrame` porque el montaje progresivo usa rAF:
 * dos frames es el mínimo en el que el efecto del tecleo ya está pintado.
 */
async function instalarMedidor() {
  await page.evaluate((firmas) => {
    const w = window;
    w.__lat = { claves: [], longTasks: [], picos: [] };
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
            w.__lat.claves.push({
              valor: objetivo.valor,
              ms: +(performance.now() - objetivo.t0).toFixed(1),
              elementos: document.querySelectorAll("*").length,
            });
            pendiente = null;
          }),
        );
      },
      true,
    );

    /**
     * Cuánto tarda la LISTA en reflejar lo que se escribió.
     *
     * Es distinto de la latencia del input: el valor del campo se actualiza al
     * instante, pero las filas se reemplazan cuando el filtro corre. Se mide
     * desde la última tecla hasta que cambia la cantidad de filas montadas, así
     * que sirve tanto si el filtrado es sincrónico como si tiene retardo.
     */
    w.__lista = { ultimoInput: 0, texto: "", eventos: [] };
    input?.addEventListener(
      "input",
      () => {
        w.__lista.ultimoInput = performance.now();
        w.__lista.texto = input.value;
      },
      true,
    );
    const obs = new MutationObserver(() => {
      if (!w.__lista.ultimoInput) return;
      const filas = document.querySelectorAll(firmas.fila).length;
      const ultimo = w.__lista.eventos[w.__lista.eventos.length - 1];
      if (ultimo && ultimo.filas === filas) return; // sólo cuando CAMBIA la cantidad
      w.__lista.eventos.push({
        t: +(performance.now() - w.__lista.ultimoInput).toFixed(1),
        filas,
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });

    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          w.__lat.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      /* sin soporte de longtask */
    }

    w.__latTimer = setInterval(() => {
      w.__lat.picos.push(document.querySelectorAll("*").length);
      if (w.__lat.picos.length > 5000) clearInterval(w.__latTimer);
    }, 50);
  }, firmas);
}

await instalarMedidor();
await cdp.send("Performance.enable");

const antes = {
  perf: await perfMetrics(),
  heap: await heapMB(),
  dom: await domCounters(),
  elementos: await elementos(),
  filas: await page.evaluate((s) => document.querySelectorAll(s.fila).length, firmas),
};
console.log(
  `\nEn reposo: ${antes.elementos} elementos (${antes.dom.nodes} nodos), ` +
    `${antes.filas} filas, heap ${antes.heap} MB, ${antes.dom.jsEventListeners} listeners`,
);

// ── Tipeo letra por letra ─────────────────────────────────────────────────
console.log(`\nEscribiendo "${CONSULTA}" letra por letra…`);
for (const ch of CONSULTA) {
  if (crashed.value) break;
  await search.press(ch).catch(() => {});
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1200);

const datos = await page.evaluate(() => {
  clearInterval(window.__latTimer);
  return window.__lat;
});
const despues = {
  perf: await perfMetrics(),
  heap: await heapMB(),
  dom: await domCounters(),
  elementos: await elementos(),
  filas: await page.evaluate((s) => document.querySelectorAll(s.fila).length, firmas),
};

// ── Tiempo hasta que la LISTA se actualiza, con tipeo rápido ──────────────
//
// 120 ms entre teclas es más rápido que el retardo del buscador (250 ms), así
// que este caso mide lo que hace un usuario escribiendo de verdad: una sola
// búsqueda, disparada al soltar el teclado.
await search.fill("");
await page.waitForTimeout(900);
await page.evaluate(() => {
  window.__lista.eventos = [];
  window.__lista.ultimoInput = 0;
});
for (const ch of CONSULTA) {
  await search.press(ch).catch(() => {});
  await page.waitForTimeout(120);
}
await page.waitForTimeout(2000);
const lista = await page.evaluate(
  (firmas) => ({
    eventos: window.__lista.eventos,
    filas: document.querySelectorAll(firmas.fila).length,
    texto: window.__lista.texto,
  }),
  firmas,
);

console.log("\n=== LATENCIA POR TECLA (medida en la página: input -> 2 frames) ===");
console.log("  valor          ms    elementos");
for (const c of datos.claves) {
  console.log(`  ${String(c.valor).padEnd(12)} ${String(c.ms).padStart(6)}  ${String(c.elementos).padStart(8)}`);
}
if (datos.claves.length) {
  const ms = datos.claves.map((c) => c.ms).sort((a, b) => a - b);
  const el = datos.claves.map((c) => c.elementos);
  console.log(
    `  min ${ms[0]} ms · mediana ${ms[Math.floor(ms.length / 2)]} ms · max ${ms[ms.length - 1]} ms`,
  );
  console.log(`  elementos: min ${Math.min(...el)} · max ${Math.max(...el)}`);
}
if (datos.picos.length) {
  console.log(
    `  elementos muestreados cada 50 ms: min ${Math.min(...datos.picos)} · max ${Math.max(...datos.picos)}`,
  );
}

console.log(`\n=== TIEMPO DE HILO POR TIPO — ${CONSULTA.length} teclas (ms) ===`);console.log(`  Script (JS)        : ${seg(antes.perf, despues.perf, "ScriptDuration")}`);
console.log(`  Estilo (RecalcStyle): ${seg(antes.perf, despues.perf, "RecalcStyleDuration")}`);
console.log(`  Layout             : ${seg(antes.perf, despues.perf, "LayoutDuration")}`);
console.log(`  Tareas (total)     : ${seg(antes.perf, despues.perf, "TaskDuration")}`);
console.log(
  `  Script por tecla   : ${(seg(antes.perf, despues.perf, "ScriptDuration") / CONSULTA.length).toFixed(0)} ms`,
);

console.log("\n=== MEMORIA Y DOM (CDP, no performance.memory) ===");
console.log(`  heap   : ${antes.heap} MB -> ${despues.heap} MB  (Δ ${(despues.heap - antes.heap).toFixed(1)} MB)`);
console.log(`  nodos  : ${antes.dom.nodes} -> ${despues.dom.nodes}`);
console.log(`  elementos: ${antes.elementos} -> ${despues.elementos}`);
console.log(`  filas  : ${antes.filas} -> ${despues.filas}`);
console.log(`  listeners: ${antes.dom.jsEventListeners} -> ${despues.dom.jsEventListeners}`);

console.log(`\n=== LISTA: cuánto tarda en reflejar "${lista.texto}" (tipeo a 120 ms/tecla) ===`);
if (lista.eventos.length === 0) {
  console.log("  la lista nunca cambió");
} else {
  console.log("  ms desde la última tecla -> filas montadas:");
  for (const e of lista.eventos) console.log(`    ${String(e.t).padStart(7)} ms -> ${e.filas} filas`);
  const conFilas = lista.eventos.filter((e) => e.filas > 0);
  if (conFilas.length) {
    console.log(
      `  primeras filas: ${conFilas[0].t} ms · lista completa: ` +
        `${conFilas[conFilas.length - 1].t} ms (${lista.filas} filas)`,
    );
  } else {
    console.log("  no se montó ninguna fila");
  }
}

const largas = datos.longTasks.filter((t) => t.dur > 50);
console.log(`\n=== TAREAS LARGAS (>50 ms): ${largas.length} ===`);
for (const t of largas.slice(0, 10)) console.log(`  +${t.start} ms -> ${t.dur} ms`);
if (largas.length > 10) console.log(`  … y ${largas.length - 10} más`);

console.log("\n=== ERRORES ===");
console.log(`  crash      : ${crashed.value ? "SÍ" : "no"}`);
console.log(`  errores JS : ${pageErrors.length}`);
for (const e of pageErrors.slice(0, 4)) console.log(`    ${e}`);

try {
  await browser.close();
} catch {
  /* ya cerrada */
}
