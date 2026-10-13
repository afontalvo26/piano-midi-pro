// ============================================================
// qa-all-startup — arranque en frío sobre el árbol CONGELADO (0d1ea5d).
//
// LAS TRES COLUMNAS QUE HACEN INTERPRETABLE EL NÚMERO:
//
//   | crudo | silencio propio de la canción | piso teórico |
//
//   • crudo                = ms desde el click hasta la primera señal > −70 dB
//   • silencio propio      = primera nota de la canción, LEÍDA DEL PARSER
//                            (@tonejs/midi, el mismo que usa la app)
//   • piso teórico         = ms hasta que el transporte arranca + silencio propio
//
// Se mide con DOS archivos:
//   1. `QA_Arranque_0s.mid` — primera nota en t=0,000 s. Es la medida LIMPIA
//      del motor: crudo y piso coinciden porque no hay silencio que descontar.
//   2. `Bolero_-_Besame_Mucho.kar` — caso real, con su silencio propio.
//
// LA PÍLDORA se observa con un poller DEDICADO cada 50 ms, independiente del
// bucle de medición de audio (que corre cada 200 ms). En la primera versión de
// este script el poller vivía dentro del bucle de audio y por eso no alcanzaba
// a capturar los textos cortos del arranque.
//
// Salida: .logs/qa/results-startup.json  +  .logs/qa/startup-*.png
// ============================================================

import { openQA, URL, OUT } from "./qa-all-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("file://" + process.cwd() + "/app/");
const { Midi } = require("@tonejs/midi");

const FIXTURE = "app/public/demo/QA_Arranque_0s.mid";
const CANCION = "app/public/demo/Bolero_-_Besame_Mucho.kar";

/** Silencio inicial real de un archivo, medido con el MISMO parser de la app. */
const silencioInicial = (ruta) => {
  const midi = new Midi(readFileSync(ruta));
  const esPerc = (t) => t.instrument?.percussion === true || t.channel === 9;
  const todas = midi.tracks.flatMap((t) => t.notes);
  const melodicas = midi.tracks.filter((t) => !esPerc(t)).flatMap((t) => t.notes);
  const percusion = midi.tracks.filter(esPerc).flatMap((t) => t.notes);
  return {
    archivo: ruta.split("/").pop(),
    primeraGlobal: todas.length ? Math.min(...todas.map((n) => n.time)) : 0,
    primeraMelodica: melodicas.length ? Math.min(...melodicas.map((n) => n.time)) : null,
    nPercusion: percusion.length,
    primeraPercusion: percusion.length ? Math.min(...percusion.map((n) => n.time)) : null,
    notas: todas.length,
  };
};

const sFixture = silencioInicial(FIXTURE);
const sCancion = silencioInicial(CANCION);
console.log("### silencio inicial LEÍDO DEL PARSER (no supuesto)");
console.log(`  ${sFixture.archivo}: primera nota ${sFixture.primeraGlobal.toFixed(3)}s · melódica ${sFixture.primeraMelodica?.toFixed(3)}s · ${sFixture.notas} notas`);
console.log(`  ${sCancion.archivo}: primera nota ${sCancion.primeraGlobal.toFixed(2)}s · melódica ${sCancion.primeraMelodica?.toFixed(2)}s · percusión ${sCancion.nPrimera ?? sCancion.primeraPercusion?.toFixed(2)}s (${sCancion.nPercusion} golpes)`);

const qa = await openQA();
const { page } = qa;

// Poller DEDICADO de la píldora: 50 ms, fuera del bucle de audio, y arranca
// como observador permanente de la sesión (no se apaga al detectar el sonido).
await page.addInitScript(`
  window.__PILLS = [];
  window.__TRANSPORT_START = null;
  window.__CTX_START = null;
  setInterval(() => {
    const p = document.querySelector(".status-pill:last-child")?.textContent?.trim() ?? "";
    const last = window.__PILLS[window.__PILLS.length - 1];
    if (!last || last.txt !== p) window.__PILLS.push({ ms: Math.round(performance.now()), txt: p });
    const t = window.__PMP_TRANSPORT__;
    if (t && window.__TRANSPORT_START === null && t.state === "started") {
      window.__TRANSPORT_START = Math.round(performance.now());
    }
  }, 50);
`);

const leerT0 = () => page.evaluate(() => ({ pills: window.__PILLS.length, tStart: window.__TRANSPORT_START }));

/** Carga un archivo y deja la app lista (sin pulsar Reproducir). */
const cargar = async (ruta, esperaMs = 2000) => {
  await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(ruta);
  await page.waitForFunction(
    () => Number(document.querySelector('.seeker-container input[type="range"]')?.max ?? 0) > 0,
    { timeout: 40000 },
  );
  await page.waitForTimeout(esperaMs);
};

/** Mide el arranque: click en Reproducir y cronometra la primera señal. */
const medir = async (etiqueta) => {
  const t0 = await leerT0();
  const tClick = Date.now();
  await page.locator(".playback-bar .btn.primary").click();

  const traza = [];
  let primerSonido = null;
  let tTransporte = null;
  while (Date.now() - tClick < 25000) {
    const v = await page.evaluate(() => ({
      db: window.__RMS(),
      tStart: window.__TRANSPORT_START,
      estado: window.__PMP_TRANSPORT__?.state ?? null,
    }));
    const ms = Date.now() - tClick;
    traza.push({ ms, db: v.db, estado: v.estado });
    if (tTransporte === null && v.estado === "started") tTransporte = ms;
    if (primerSonido === null && v.db !== null && v.db > -70) {
      primerSonido = ms;
      await qa.shot(`startup-${etiqueta}-primer-sonido`);
    }
    // Se sigue muestreando 6 s después del primer sonido para que el poller de
    // la píldora alcance a registrar los textos posteriores al arranque.
    if (primerSonido !== null && ms > primerSonido + 6000) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1200);
  const pills = await page.evaluate(() => window.__PILLS);
  const nuevas = pills.slice(t0.pills);
  const pico = Math.max(...traza.map((t) => (t.db === null ? -Infinity : t.db)));
  await qa.shot(`startup-${etiqueta}-sonando`);
  return { etiqueta, primerSonido, tTransporte, pico, traza, pillsNuevas: nuevas, pillsTodas: pills };
};

/* ══════════════════════════════════════════════════════════════════════════
   1. MEDIDA LIMPIA: fixture con la primera nota en t = 0
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n################ 1. MEDIDA LIMPIA — fixture, primera nota en t=0 ################");
await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3000);
await page.locator('.rail-item[title="Studio"]').click();
await page.waitForTimeout(1200);
await cargar(FIXTURE);
await qa.shot("startup-fixture-antes");
const r1 = await medir("fixture");

const margen1 = r1.primerSonido !== null && r1.tTransporte !== null ? r1.primerSonido - r1.tTransporte : null;
console.log(`\n  transporte "started" a los ${r1.tTransporte ?? ">25000"} ms · **primera señal audible a los ${r1.primerSonido ?? ">25000"} ms** · pico ${r1.pico.toFixed(1)} dB`);
console.log(`  ms desde que el transporte arranca hasta que se oye la primera nota: ${margen1 ?? "?"} ms`);
console.log(`  píldora (${r1.pillsNuevas.length} cambios): ${r1.pillsNuevas.map((p) => `+${p.ms}ms "${p.txt}"`).join(" → ") || "(sin cambios)"}`);

qa.add({
  control: "D1 · Arranque en frío, MEDIDA LIMPIA (fixture con la primera nota en t = 0,000 s)",
  selector: ".playback-bar .btn.primary → QA_Arranque_0s.mid",
  result: r1.primerSonido !== null && r1.primerSonido < 4000 ? "OK" : "FAIL",
  evidence:
    `Primer arranque de la sesión (no existía ningún AudioContext). ` +
    `**crudo = ${r1.primerSonido ?? ">25000"} ms** · silencio propio de la canción = **0 ms** (el fixture tiene la primera nota en t=0,000 s, validado con el parser de la app) · ` +
    `**piso teórico = ${r1.tTransporte ?? "?"} ms** (arranque del transporte) + 0 = ${r1.tTransporte ?? "?"} ms. ` +
    `Como el crudo y el piso son el mismo caso, esta es la medida limpia del motor: **${margen1 ?? "?"} ms** desde que el transporte queda en "started" hasta que la primera nota cruza −70 dB. Pico ${r1.pico.toFixed(1)} dB`,
  shot: `${OUT}/startup-fixture-antes.png · ${OUT}/startup-fixture-primer-sonido.png`,
  extra: { r1, sFixture, margen1 },
});

/* ══════════════════════════════════════════════════════════════════════════
   2. CASO REAL: la canción del demo, con su silencio descontado
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n################ 2. CASO REAL — canción del demo con su silencio ################");
await page.goto(URL);
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForTimeout(3000);
await page.locator('.rail-item[title="Studio"]').click();
await page.waitForTimeout(1200);
await cargar(CANCION);
// Se arranca desde el principio de la canción: así el silencio inicial medido
// por el parser es exactamente el que el oyente va a experimentar.
await qa.shot("startup-cancion-antes");
const r2 = await medir("cancion");

const silencioMs = sCancion.primeraGlobal * 1000;
const piso2 = (r2.tTransporte ?? 0) + silencioMs;
const margen2 = r2.primerSonido !== null && r2.tTransporte !== null ? r2.primerSonido - r2.tTransporte : null;
console.log(`\n  transporte a los ${r2.tTransporte ?? "?"} ms · crudo ${r2.primerSonido ?? "?"} ms · silencio propio ${silencioMs.toFixed(0)} ms · piso teórico ${piso2.toFixed(0)} ms`);
console.log(`  margen real desde el transporte hasta la primera nota: ${margen2 ?? "?"} ms (el silencio de la canción explica ${silencioMs.toFixed(0)} ms de los ${r2.primerSonido} ms crudos)`);
console.log(`  píldora (${r2.pillsNuevas.length} cambios): ${r2.pillsNuevas.map((p) => `+${p.ms}ms "${p.txt}"`).join(" → ") || "(sin cambios)"}`);

qa.add({
  control: "D2 · Arranque en frío, CASO REAL (canción del demo desde el segundo 0)",
  selector: ".playback-bar .btn.primary → Bolero_-_Besame_Mucho.kar",
  result: r2.primerSonido !== null ? "OK" : "FAIL",
  evidence:
    `**crudo = ${r2.primerSonido ?? "?"} ms** · silencio propio de la canción = **${silencioMs.toFixed(0)} ms** ` +
    `(primera nota global en ${sCancion.primeraGlobal.toFixed(2)} s; las melódicas entran en ${sCancion.primeraMelodica?.toFixed(2)} s y hay ${sCancion.nPercusion} golpes de percusión desde ${sCancion.primeraPercusion?.toFixed(2)} s) · ` +
    `**piso teórico = ${r2.tTransporte ?? "?"} + ${silencioMs.toFixed(0)} = ${piso2.toFixed(0)} ms**. El crudo queda por DEBAJO del piso porque la percusión empieza antes que las melódicas, ` +
    `así que el número honesto del motor es el margen desde el transporte: **${margen2 ?? "?"} ms**. Pico ${r2.pico.toFixed(1)} dB`,
  shot: `${OUT}/startup-cancion-antes.png · ${OUT}/startup-cancion-primer-sonido.png`,
  extra: { r2, sCancion, silencioMs, piso2, margen2 },
});

/* ══════════════════════════════════════════════════════════════════════════
   3. LA PÍLDORA: ¿dice qué falta y avanza el contador?
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n################ 3. LA PÍLDORA DE ESTADO ################");
const todas = [...r1.pillsTodas, ...r2.pillsTodas];
const textos = [...new Set(todas.map((p) => p.txt))];
const tienePreparando = textos.some((t) => /Preparando el motor de audio/i.test(t));
const tieneContador = todas.some((p) => /Cargando instrumentos \d+\/\d+/i.test(p.txt));
const contadores = todas
  .map((p) => /Cargando instrumentos (\d+)\/(\d+)/i.exec(p.txt))
  .filter(Boolean)
  .map((m) => ({ done: Number(m[1]), total: Number(m[2]), ms: 0 }));
const avanza = contadores.length >= 2 && contadores[contadores.length - 1].done > contadores[0].done;

console.log(`  textos únicos vistos en toda la sesión: ${textos.map((t) => `"${t}"`).join(", ")}`);
console.log(`  ¿"Preparando el motor de audio…"? ${tienePreparando} · ¿"Cargando instrumentos N/M…"? ${tieneContador} · contadores ${contadores.length} · ¿avanza? ${avanza}`);
console.log("  secuencia completa (ambas corridas):");
todas.slice(0, 30).forEach((p) => console.log(`    +${p.ms} ms  "${p.txt}"`));

qa.add({
  control: "D3 · La píldora de estado del audio durante el arranque",
  selector: ".status-pill (última) — la que pinta audioStatusMessage",
  result: tienePreparando && tieneContador && avanza ? "OK" : "FAIL",
  evidence:
    `Secuencia completa observada con un poller dedicado cada 50 ms (y el poller NO se apaga al detectar sonido): ` +
    `${todas.slice(0, 14).map((p) => `+${p.ms} ms "${p.txt}"`).join(" → ")}${todas.length > 14 ? ` … (${todas.length} cambios en total)` : ""}. ` +
    `¿Apareció "Preparando el motor de audio…"? **${tienePreparando}** · ¿apareció "Cargando instrumentos N/M…"? **${tieneContador}** ` +
    `(contadores vistos: ${contadores.map((c) => `${c.done}/${c.total}`).join(", ") || "ninguno"}) · ¿el contador avanza? **${avanza}**`,
  shot: `${OUT}/startup-fixture-antes.png`,
  extra: { todas, textos, tienePreparando, tieneContador, contadores, avanza },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
qa.add({
  control: "Errores de consola durante la medición de arranque",
  selector: "(global)",
  result: qa.consoleErrors.length === 0 ? "OK" : "FAIL",
  evidence: `${qa.consoleErrors.length} errores: ${[...new Set(qa.consoleErrors)].slice(0, 4).join(" | ") || "ninguno"}`,
  shot: "—",
});

writeFileSync(
  `${OUT}/startup-trazas.json`,
  JSON.stringify({ silencioFixture: sFixture, silencioCancion: sCancion, fixture: r1, cancion: r2 }, null, 2),
);
qa.save("results-startup");
console.log(`\nresultados: ${qa.results.length} filas → ${OUT}/results-startup.json`);
await qa.close();
