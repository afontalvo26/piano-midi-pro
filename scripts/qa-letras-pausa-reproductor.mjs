// ============================================================
// qa-letras-pausa-reproductor — la caída del audio al pausar, medida en el
// REPRODUCTOR (1235), que es el producto.
//
// CÓMO SE MIDE:
//   · Se engancha el ÚNICO punto por el que pasa todo el audio antes de salir:
//     `AudioNode.prototype.connect` cuando el destino es el `AudioDestinationNode`.
//     Todo lo que iba al destino pasa a ir a un `ScriptProcessorNode` de 2048
//     muestras (~43 ms), así que la traza es la señal REAL que sale.
//   · Por bloque se guarda el RMS, el pico y el MÁXIMO SALTO ENTRE MUESTRAS
//     CONSECUTIVAS (lo que delata un escalón).
//   · La pregunta no es "¿hay saltos grandes?" —la música los tiene— sino "¿hay
//     un bloque en el que la señal se derrumbe de golpe?". La estadística que lo
//     responde es la MAYOR CAÍDA DE RMS EN UN SOLO BLOQUE: un corte seco pasa de
//     sonar a silencio en un bloque (decenas de dB), un fade reparte la caída.
//   · CONTROL POSITIVO: en la misma sesión y con el mismo instrumento se genera un
//     tono y se lo corta de un golpe, para comprobar que el instrumento SÍ ve un
//     escalón cuando lo hay.
//
// QUÉ SE DISPARA, Y POR QUÉ:
//   El reproductor tiene (a hoy) un bug ajeno: `isPlaying` del PlayerContext se cae
//   a false al arrancar, así que el botón central muestra "Reproducir" y volver a
//   apretarlo llama a `play()`, no a `pause()`. Este script LO COMPRUEBA en vivo:
//   si el botón dice "Pausar" pausa de verdad y mide la pausa; si dice
//   "Reproducir", mide el otro camino que usa EXACTAMENTE la misma función de
//   liberación (`releaseVoicesSmoothly`), que es un seek tocando una palabra de la
//   letra — el gesto que el dueño pidió—, y lo dice con todas las letras.
//
// Salida: .logs/qa/letras/resultados-pausa-reproductor.json + capturas
// ============================================================

import { mkdirSync } from "node:fs";
import { openQA } from "./qa-all-lib.mjs";

const PLAYER_URL = process.env.PMP_PLAYER_URL ?? "http://localhost:1235/";
const CON_LETRA = "El Osito Dormilón";
const DIR = ".logs/qa/letras";
mkdirSync(DIR, { recursive: true });

const qa = await openQA();
const { page } = qa;
const shot = (name) => qa.shot(`letras/${name}`);
const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

const PAUSE_TAP = `(() => {
  let proc = null, frames = null, active = false, ctxRef = null;
  const asegurar = (ctx) => {
    if (proc) return;
    ctxRef = ctx;
    proc = ctx.createScriptProcessor(2048, 1, 1);
    frames = [];
    proc.onaudioprocess = (e) => {
      if (!active) return;
      const d = e.inputBuffer.getChannelData(0);
      let suma = 0, salto = 0, pico = 0;
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        suma += v * v;
        if (Math.abs(v) > pico) pico = Math.abs(v);
        if (i > 0) { const s = Math.abs(v - d[i - 1]); if (s > salto) salto = s; }
      }
      frames.push({ t: e.playbackTime || ctx.currentTime, rms: Math.sqrt(suma / d.length), pico, salto });
    };
    // El procesador sólo corre si llega al destino; se interpone una ganancia en
    // cero para que la señal no se sume dos veces.
    const mudo = ctx.createGain();
    mudo.gain.value = 0;
    AudioNode.prototype.__origConnect.call(proc, mudo);
    AudioNode.prototype.__origConnect.call(mudo, ctx.destination);
  };
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.__origConnect = orig;
  AudioNode.prototype.connect = function (target, ...rest) {
    const esDestino = target && target.constructor && target.constructor.name === "AudioDestinationNode";
    if (esDestino) {
      try { asegurar(this.context); return orig.call(this, proc, ...rest); } catch (err) { /* camino original */ }
    }
    return orig.call(this, target, ...rest);
  };
  window.__PAUSA = {
    arrancar: () => { if (!proc) return false; frames.length = 0; active = true; return true; },
    parar: () => { active = false; return frames ? frames.slice() : []; },
    nivel: (ms = 350) => new Promise((resolve) => {
      frames.length = 0; active = true;
      setTimeout(() => { active = false; resolve(frames.reduce((m, f) => Math.max(m, f.rms), 0)); }, ms);
    }),
    controlCorteSeco: (ms = 700) => {
      const ctx = ctxRef;
      if (!ctx) return null;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = 440;
      g.gain.value = 0.25;
      osc.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime;
      frames.length = 0; active = true;
      osc.start(t0 + 0.02);
      // El escalón: de 0,25 a 0 en un solo instante, sin rampa.
      g.gain.setValueAtTime(0.25, t0 + ms / 1000);
      g.gain.setValueAtTime(0, t0 + ms / 1000);
      return new Promise((resolve) => {
        setTimeout(() => {
          active = false;
          try { osc.stop(); } catch (e) { /* ya parado */ }
          resolve({ frames: frames.slice() });
        }, ms + 500);
      });
    },
  };
  return true;
})()`;

/** Analiza una traza: perfil, caída total y la mayor caída en UN bloque. */
function analizar(frames) {
  const conSenal = frames.filter((f) => db(f.rms) > -60);
  if (!conSenal.length) return { bloques: frames.length, sinSenal: true };
  const ultimo = conSenal[conSenal.length - 1];
  const iUltimo = frames.indexOf(ultimo);
  // Perfil alrededor del final de la señal: los 3 bloques previos y 4 posteriores.
  const cola = frames.slice(Math.max(0, iUltimo - 3), iUltimo + 5);
  let mayorCaida = 0;
  for (let i = 1; i < cola.length; i++) {
    const caida = db(cola[i - 1].rms) - db(cola[i].rms);
    if (caida > mayorCaida) mayorCaida = caida;
  }
  // Caída más grande en toda la traza, para tener el peor caso.
  let peorGlobal = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = db(frames[i - 1].rms);
    const b = db(frames[i].rms);
    if (Number.isFinite(a) && Number.isFinite(b) && a - b > peorGlobal) peorGlobal = a - b;
  }
  return {
    bloques: frames.length,
    perfilDb: cola.map((f) => Number(db(f.rms).toFixed(1))),
    mayorCaidaUnBloque: Number(mayorCaida.toFixed(1)),
    peorCaidaGlobal: Number(peorGlobal.toFixed(1)),
    pico: Math.max(...frames.map((f) => f.pico)),
    saltoMax: Math.max(...frames.map((f) => f.salto)),
    msHastaSilencio: Number(((frames[iUltimo + 1]?.t ?? ultimo.t) - ultimo.t).toFixed(3)) * 1000,
  };
}

await page.addInitScript(PAUSE_TAP);
await page.goto(PLAYER_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-card", { timeout: 40000 });

// ── Cargar una canción con letra (arranca sola: `playTrack`) ────────────────
const tarjeta = page.locator(".pm-card", { hasText: CON_LETRA }).first();
await tarjeta.waitFor({ state: "visible", timeout: 30000 });
await tarjeta.locator(".pm-card__info").click();
await page.waitForFunction(
  (esperado) => (document.querySelector(".pm-bar__title")?.textContent || "").trim() === esperado,
  CON_LETRA,
  { timeout: 45000 },
);

// Esperar señal real (el arranque en frío tarda).
let nivel = 0;
for (let i = 0; i < 40; i++) {
  nivel = await page.evaluate(() => window.__PAUSA.nivel(400));
  if (db(nivel) > -45) break;
  await page.waitForTimeout(500);
}
console.log(`### sonando: RMS ${db(nivel).toFixed(1)} dB`);
const tap = await page.evaluate(() => !!window.__PAUSA);
if (!tap || db(nivel) <= -60) {
  console.log("### N/V: no se pudo establecer señal, no se mide la caída");
  await qa.close();
  process.exit(0);
}

// ── Abrir la letra, para poder disparar también por seek ────────────────────
await page.locator(".pm-bar__lyrics-btn").click();
await page.waitForSelector(".pm-drawer--lyrics .lyrics-panel", { timeout: 20000 });
await page.waitForTimeout(800);
await shot("pausa-1235-00-sonando-con-letra");

// ── ¿Se puede pausar de verdad? Se comprueba el botón, no se asume ──────────
const central = await page.evaluate(() => {
  const b = [...document.querySelectorAll(".pm-bar__transport button")].find((x) =>
    /^(Pausar|Reproducir)$/.test(x.getAttribute("aria-label") || ""),
  );
  return { etiqueta: b?.getAttribute("aria-label") };
});
console.log(`### botón central: ${JSON.stringify(central.etiqueta)}`);

let modo;
if (central.etiqueta === "Pausar") {
  modo = "pausa";
  await page.evaluate(() => window.__PAUSA.arrancar());
  await page.locator(".pm-bar__transport button").nth(2).click();
} else {
  // Mismo camino de liberación que la pausa: `PlayerEngineHost.seek()` llama a
  // `releaseVoicesSmoothly()`, exactamente la misma función que `pause()` y `stop()`.
  modo = "seek";
  await page.evaluate(() => window.__PAUSA.arrancar());
  await page.evaluate(() => {
    const lineas = [...document.querySelectorAll(".lyrics-line")];
    const linea = lineas[Math.floor(lineas.length / 2)];
    const palabras = [...linea.querySelectorAll(".lyrics-word[data-word-time]")];
    (palabras[Math.min(2, palabras.length - 1)] ?? palabras[0]).click();
  });
}
await page.waitForTimeout(1400);
const traza = await page.evaluate(() => window.__PAUSA.parar());
await shot(`pausa-1235-01-tras-${modo}`);
const a = analizar(traza);

console.log(
  `\n### CAÍDA (disparada por ${modo === "pausa" ? "el botón Pausar" : "un seek tocando una palabra"})\n` +
    `   perfil de RMS alrededor del final: ${a.perfilDb?.join(" → ")} dB\n` +
    `   mayor caída en UN bloque de ~43 ms: ${a.mayorCaidaUnBloque} dB\n` +
    `   peor caída de toda la traza: ${a.peorCaidaGlobal} dB\n` +
    `   pico ${a.pico?.toFixed(4)} · salto máximo entre muestras ${a.saltoMax?.toFixed(4)}`,
);

// ── CONTROL POSITIVO ────────────────────────────────────────────────────────
const control = await page.evaluate(() => window.__PAUSA.controlCorteSeco(700));
const c = analizar(control.frames);
console.log(
  `\n### CONTROL POSITIVO (tono de 440 Hz cortado de un golpe)\n` +
    `   perfil: ${c.perfilDb?.join(" → ")} dB\n` +
    `   mayor caída en UN bloque: ${c.mayorCaidaUnBloque} dB · salto máximo ${c.saltoMax?.toFixed(4)} · pico ${c.pico?.toFixed(4)}`,
);

const umbraldB = 25;
// El disparador, contado sin anidar plantillas (y sin esconder el motivo).
const disparador =
  modo === "pausa"
    ? "el botón central, que en esta corrida decía \"Pausar\" (o sea que isPlaying estaba sano)"
    : "un seek tocando una palabra de la letra — el mismo releaseVoicesSmoothly() que usan pause() y stop() en " +
      "PlayerEngineHost, porque el botón central dice \"Reproducir\" (el bug ajeno de isPlaying) y volver a apretarlo llamaría a play()";

qa.add({
  control:
    modo === "pausa"
      ? "Pausa (1235): la caída del audio es gradual, sin escalón"
      : "Pausa (1235): la caída al liberar voces es gradual, sin escalón (disparada por seek)",
  selector: ".pm-bar__transport button (central) / .lyrics-word",
  result:
    a.mayorCaidaUnBloque !== undefined &&
    a.mayorCaidaUnBloque < umbraldB &&
    c.mayorCaidaUnBloque > umbraldB
      ? "OK"
      : "FAIL",
  evidence:
    `se disparó la liberación de voces con ${disparador}. Medido con el tap maestro puesto en el único camino al ` +
    `AudioDestinationNode: el RMS cae ${a.perfilDb?.join(" → ")} dB, o sea ${a.mayorCaidaUnBloque} dB como máximo en UN bloque de ` +
    `~43 ms, y tarda ${a.msHastaSilencio?.toFixed(0)} ms en pasar de sonar a silencio. CONTROL POSITIVO, mismo instrumento y misma ` +
    `sesión: un tono de 440 Hz cortado de un golpe cae ${c.mayorCaidaUnBloque} dB en un bloque (salto máximo entre muestras ` +
    `${c.saltoMax?.toFixed(4)} contra ${a.saltoMax?.toFixed(4)} de la liberación), así que el instrumento SÍ distingue un escalón y la ` +
    `liberación no lo tiene`,
  shot: `${DIR}/pausa-1235-01-tras-${modo}.png`,
  extra: { modo, etiquetaBoton: central.etiqueta, medicion: a, control: c },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 6).forEach((e) => console.log("  " + e));
const destino = qa.save("letras/resultados-pausa-reproductor");
console.log(`resultados: ${qa.results.length} filas → ${destino}`);
await qa.close();
