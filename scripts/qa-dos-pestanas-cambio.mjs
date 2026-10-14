/**
 * Cambio de canción con DOS pestañas hermanas abiertas (el escenario del dueño).
 *
 * ── POR QUÉ HACE FALTA ─────────────────────────────────────────────────────
 *
 * `qa-cambio-cancion.mjs` mide el camino feliz en UNA pestaña limpia y da 12/12.
 * El dueño usa el piano (1234) y el reproductor (1235) al mismo tiempo, y reporta
 * que el cambio de canción se queda "Cargando…" y la app deja de responder.
 *
 * Las pestañas tienen que ser HERMANAS (`context.newPage()`): un contexto nuevo
 * por pestaña está aislado y no comparte `BroadcastChannel` ni `localStorage`, así
 * que se medirían dos navegadores distintos y la coordinación de audio no tendría
 * forma de funcionar.
 *
 * ── QUÉ MIDE ───────────────────────────────────────────────────────────────
 *
 * Por cada clic en una tarjeta distinta de la biblioteca:
 *
 *   - ¿cambió el título de la barra?
 *   - ¿CUÁNDO empezó a sonar de verdad? (tap de RMS en la salida del AudioContext,
 *     no el botón ni el reloj: que la UI diga "Pausar" no prueba que suene)
 *   - ¿la app sigue respondiendo? (una lectura de DOM después del cambio)
 *   - **la pregunta diagnóstica**: cuando queda trabado, ¿la posición avanza?
 *       (A) avanza  → está sonando y la UI miente (estado/publicación)
 *       (B) 0:00 fijo → nunca arrancó (espera de audio o carga)
 *
 * Uso: node scripts/qa-dos-pestanas-cambio.mjs [puerto] [n] [puerto2]
 *      node scripts/qa-dos-pestanas-cambio.mjs 1235 12 1235   ← dos del reproductor
 *      node scripts/qa-dos-pestanas-cambio.mjs 1235 12 1234   ← reproductor + piano
 */

import { chromium } from "@playwright/test";

const PORT = process.argv[2] ?? "1235";
const CAMBIOS = Number(process.argv[3] ?? 10);
const PORT2 = process.argv[4] ?? "";
const BASE = `http://localhost:${PORT}/`;

/** Tap de RMS sobre la salida real del AudioContext + contador de tareas largas. */
const TAP = `
(() => {
  let analyser = null, buf = null;
  const ensure = (ctx) => { if (analyser) return analyser; analyser = ctx.createAnalyser(); analyser.fftSize = 2048; buf = new Float32Array(analyser.fftSize); return analyser; };
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target && target.constructor && target.constructor.name === "AudioDestinationNode") {
      try { orig.call(this, ensure(this.context)); } catch {}
    }
    return orig.call(this, target, ...rest);
  };
  window.__RMS = () => { if (!analyser) return null; analyser.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i]*buf[i]; const r = Math.sqrt(s/buf.length); return r > 0 ? 20*Math.log10(r) : -Infinity; };
  window.__LONG = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) window.__LONG++; }).observe({ entryTypes: ["longtask"] });
  window.__REJECTS = [];
  window.addEventListener("unhandledrejection", (e) => {
    window.__REJECTS.push(String((e.reason && (e.reason.stack || e.reason.message)) || e.reason).slice(0, 300));
  });
  window.__ERRS = [];
  window.addEventListener("error", (e) => { window.__ERRS.push(String(e.message).slice(0, 300)); });
})();
`;

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
// UNA sola context → pestañas hermanas de verdad (mismo origen, mismo
// BroadcastChannel y mismo localStorage). `browser.newPage()` daría contextos
// aislados y mediría dos navegadores distintos.
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addInitScript(TAP);

const p1 = await context.newPage();
p1.setDefaultTimeout(30000);
const errores = [];
p1.on("pageerror", (e) => errores.push(e.message.slice(0, 200)));
p1.on("console", (m) => {
  if (m.type() === "error") errores.push(`console: ${m.text().slice(0, 200)}`);
});

/** Abre una pestaña hermana en `port`, la deja cargada y con el motor listo. */
async function abrir(port, etiqueta) {
  const p = await context.newPage();
  p.setDefaultTimeout(30000);
  await p.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".pm-bar", { timeout: 30000 });
  await p.waitForTimeout(4000);
  console.log(`  pestaña ${etiqueta} lista en :${port}`);
  return p;
}

/** Estado visible de la pestaña principal. */
async function estado() {
  return p1.evaluate(() => {
    const bar = document.querySelector(".pm-bar");
    const titulo = bar?.querySelector(".pm-bar__title")?.textContent?.trim() ?? "";
    const tiempos = [...(bar?.querySelectorAll(".pm-bar__time") ?? [])]
      .map((n) => /^(\d{1,2}):(\d{2})$/.exec((n.textContent ?? "").trim()))
      .filter(Boolean)
      .map((m) => Number(m[1]) * 60 + Number(m[2]));
    const botones = [...(bar?.querySelectorAll("button") ?? [])].map((b) =>
      b.getAttribute("aria-label"),
    );
    // El texto de la píldora de estado del topbar: ahí aparece "Cargando…" y los errores.
    const pildora = [...document.querySelectorAll(".topbar *, .app-container *")]
      .filter((n) => n.children.length === 0)
      .map((n) => (n.textContent ?? "").trim())
      .find((t) => /^Cargando…|^No se pudo/.test(t));
    return {
      titulo,
      pos: tiempos[0] ?? null,
      dur: tiempos[1] ?? null,
      pausar: botones.includes("Pausar"),
      spinner: document.querySelectorAll('[aria-label="Cargando"]').length > 0,
      pildora: pildora ?? "",
      rms: window.__RMS(),
      longTasks: window.__LONG,
    };
  });
}

// ── pestañas ────────────────────────────────────────────────────────────────

console.log(`Pestaña principal: reproductor :${PORT}`);
await p1.goto(BASE, { waitUntil: "domcontentloaded" });
await p1.waitForSelector(".pm-bar", { timeout: 30000 });
await p1.waitForTimeout(4000);

if (PORT2) {
  console.log(`Segunda pestaña (hermana): :${PORT2}`);
  var p2 = await abrir(PORT2, "B");
  // Que B REPRODUZCA de verdad: es el estado del dueño (el piano sonando mientras
  // toca una canción en el reproductor). Si no arranca, igual sirve: quedan las
  // dos pestañas vivas compitiendo por el audio.
  const cardB = p2.locator(".lib-card__play").first();
  if ((await cardB.count()) === 0) {
    const railB = p2.locator(".rail-item").filter({ hasText: "Canciones" }).first();
    if ((await railB.count()) > 0) {
      await railB.click();
      await p2.waitForTimeout(4000);
    }
  }
  if ((await p2.locator(".lib-card__play").count()) > 0) {
    await p2.locator(".lib-card__play").first().click();
    await p2.waitForTimeout(5000);
    const rmsB = await p2.evaluate(() => window.__RMS());
    console.log(`  B sonando: ${rmsB === null ? "sin tap" : `${rmsB.toFixed(1)} dB`}`);
  }
}

// ── llegar a la biblioteca de tarjetas ──────────────────────────────────────

const rail = p1.locator(".rail-item").filter({ hasText: "Canciones" }).first();
if ((await rail.count()) > 0) {
  await rail.click();
  await p1.waitForTimeout(4000);
}
await p1.waitForSelector(".lib-card", { timeout: 30000 });
const total = await p1.locator(".lib-card").count();
console.log(`  biblioteca: ${total} tarjetas`);

// Arrancar con la primera para que el motor esté caliente.
await p1.locator(".lib-card__play").first().click();
await p1.waitForTimeout(6000);

console.log("\n=== CAMBIOS (clic en tarjetas distintas) ===");
let fallos = 0;
let anterior = await estado();
console.log(
  `  inicio: "${anterior.titulo}"  ${anterior.pos}s/${anterior.dur}s  pausar=${anterior.pausar}  rms=${anterior.rms === null ? "n/a" : anterior.rms.toFixed(1)}`,
);

/** Espera a que se cumpla `listo(estado)` muestreando cada 250 ms. */
async function esperar(listo, topeMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < topeMs) {
    const ahora = await estado();
    if (listo(ahora)) return { at: Date.now() - t0, estado: ahora };
    await p1.waitForTimeout(250);
  }
  return null;
}

for (let i = 1; i <= CAMBIOS; i++) {
  // Tarjeta distinta cada vez: se recorre la grilla de a una.
  const tarjeta = p1.locator(".lib-card__play").nth(i % Math.max(total, 1));
  await tarjeta.scrollIntoViewIfNeeded().catch(() => {});
  const t0 = Date.now();
  await tarjeta.click().catch((e) => errores.push(`click ${i}: ${String(e).slice(0, 80)}`));

  // 1) ¿cambió el título?
  const cambio = await esperar((e) => e.titulo && e.titulo !== anterior.titulo, 20000);

  if (!cambio) {
    fallos++;
    const quieto = await estado();
    // ── LA PREGUNTA DIAGNÓSTICA ──
    await p1.waitForTimeout(3000);
    const despues = await estado();
    const avanza = (despues.pos ?? 0) > (quieto.pos ?? 0);
    console.log(
      `  ${i}. FALLO no cambió el título en 20 s  (sigue "${anterior.titulo}")`,
    );
    console.log(
      `       diagnóstico: posición ${quieto.pos}s → ${despues.pos}s  ⇒ ${avanza ? "(A) AVANZA: suena y la UI miente" : "(B) 0:00 CONGELADO: nunca arrancó"}  ·  spinner=${despues.spinner}  píldora="${despues.pildora}"  rms=${despues.rms === null ? "n/a" : despues.rms.toFixed(1)}  pausar=${despues.pausar}`,
    );
    anterior = despues;
    continue;
  }

  // 2) ¿empezó a sonar de verdad? RMS de la salida por encima de −40 dB.
  const sono = await esperar((e) => (e.rms ?? -Infinity) > -40, 20000);

  if (sono) {
    console.log(
      `  ${i}. OK   título en ${(cambio.at / 1000).toFixed(1)} s, suena en ${((Date.now() - t0) / 1000).toFixed(1)} s  "${cambio.estado.titulo}"  rms=${sono.estado.rms.toFixed(1)} dB  ${sono.estado.pos}s/${sono.estado.dur}s`,
    );
  } else {
    fallos++;
    const quieto = await estado();
    await p1.waitForTimeout(3000);
    const despues = await estado();
    const avanza = (despues.pos ?? 0) > (quieto.pos ?? 0);
    const avanzoReloj = await esperar((e) => (e.pos ?? 0) > (cambio.estado.pos ?? 0), 6000);
    console.log(
      `  ${i}. FALLO cambió el título en ${(cambio.at / 1000).toFixed(1)} s pero NO suena en 20 s  "${cambio.estado.titulo}"`,
    );
    console.log(
      `       diagnóstico: ${avanzoReloj ? "el RELOJ avanza" : "el reloj NO avanza"}  ⇒ ${avanzoReloj ? "(A) suena y la UI miente" : "(B) nunca arrancó"}  ·  posición ${quieto.pos}s → ${despues.pos}s  rms=${despues.rms === null ? "n/a" : despues.rms.toFixed(1)}  pausar=${despues.pausar}  spinner=${despues.spinner}  píldora="${despues.pildora}"`,
    );
  }
  anterior = await estado();
}

// ── ¿la app sigue respondiendo? ─────────────────────────────────────────────

await p1.evaluate(() => (window.__LONG = 0));
const tResp = Date.now();
let responde = true;
try {
  await p1.locator(".pm-bar").first().scrollIntoViewIfNeeded({ timeout: 5000 });
} catch {
  responde = false;
}
const msRespuesta = Date.now() - tResp;
await p1.waitForTimeout(2500);
const final = await estado();

const rejects = await p1.evaluate(() => window.__REJECTS);
const errs = await p1.evaluate(() => window.__ERRS);

console.log("\n=== VEREDICTO ===");
console.log(`  cambios fallidos:            ${fallos} / ${CAMBIOS}`);
console.log(`  ¿la app responde?            ${responde ? `SÍ (${msRespuesta} ms)` : "NO"}`);
console.log(`  estado final:                "${final.titulo}"  ${final.pos}s/${final.dur}s  pausar=${final.pausar}`);
console.log(`  rms final:                   ${final.rms === null ? "sin tap" : `${final.rms.toFixed(1)} dB`}`);
console.log(`  tareas largas (>50 ms):      ${final.longTasks}`);
console.log(`  promesas rechazadas sin dueño: ${rejects.length}`);
for (const r of rejects.slice(0, 6)) console.log(`     ${r.split("\n")[0]}`);
console.log(`  errores JS (window):         ${errs.length}`);
for (const e of errs.slice(0, 6)) console.log(`     ${e.split("\n")[0]}`);
console.log(`  errores de consola/página:   ${errores.length}`);
for (const e of errores.slice(0, 6)) console.log(`     ${e.split("\n")[0]}`);

await browser.close();
if (fallos > 0) process.exitCode = 1;
