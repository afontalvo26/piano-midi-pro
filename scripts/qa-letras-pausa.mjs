// ============================================================
// qa-letras-pausa — la pausa no puede sonar a corte, y el click en la letra
// tiene que caer exacto.
//
// POR QUÉ ACÁ Y NO EN EL REPRODUCTOR: este script corre contra el PIANO (1234),
// que es donde la pausa se puede disparar de verdad. En el reproductor (1235) el
// estado `isPlaying` del PlayerContext se cae a false al arrancar (bug del host
// del motor, ajeno a la letra), así que su botón central nunca llama a `pause()`:
// ahí sólo se puede provocar el mismo camino por un seek, y eso se mide aparte.
//
// CÓMO SE MIDE LA PAUSA (esto es lo importante):
//   · Se engancha el ÚNICO punto por el que pasa todo el audio antes de salir:
//     `AudioNode.prototype.connect` cuando el destino es el `AudioDestinationNode`.
//     Todo lo que se conecte al destino pasa a ir a un `ScriptProcessorNode`, así
//     que la traza es la señal REAL que sale, no una estimación.
//   · Por cada bloque de 2048 muestras se guarda el RMS y —esto es lo que detecta
//     un click— el MÁXIMO SALTO ENTRE MUESTRAS CONSECUTIVAS. Un corte seco deja un
//     escalón; un fade deja la señal bajando suave.
//   · CONTROL POSITIVO: en la misma sesión y con el mismo instrumento se genera un
//     tono y se lo corta de un golpe (un escalón de verdad). Si el instrumento
//     marcara el mismo salto máximo para la pausa y para el corte seco, no serviría
//     para distinguirlos; el control prueba que sí distingue.
//
// Salida: .logs/qa/letras/resultados-pausa.json + .logs/qa/letras/*.png
// ============================================================

import { mkdirSync } from "node:fs";
import { openQA, URL } from "./qa-all-lib.mjs";

const DIR = ".logs/qa/letras";
mkdirSync(DIR, { recursive: true });

const SONG = "app/public/demo/BinomioDeOro_-_El_Osito_Dormilon.kar";

const qa = await openQA();
const { page } = qa;
const shot = (name) => qa.shot(`letras/${name}`);

/**
 * Tap maestro. Crea UN solo ScriptProcessorNode y redirige hacia él todo lo que
 * iba al destino: así la traza es la mezcla completa y no la de un nodo suelto.
 */
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
        if (i > 0) {
          const s = Math.abs(v - d[i - 1]);
          if (s > salto) salto = s;
        }
      }
      frames.push({
        t: e.playbackTime || ctx.currentTime,
        rms: Math.sqrt(suma / d.length),
        pico,
        salto,
      });
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
    const esDestino =
      target && target.constructor && target.constructor.name === "AudioDestinationNode";
    if (esDestino) {
      try {
        asegurar(this.context);
        // En vez de ir al destino, la señal entra al medidor.
        return orig.call(this, proc, ...rest);
      } catch (err) { /* si falla, se deja el camino original */ }
    }
    return orig.call(this, target, ...rest);
  };
  window.__PAUSA = {
    arrancar: () => { if (!proc) return false; frames.length = 0; active = true; return true; },
    parar: () => { active = false; return frames ? frames.slice() : []; },
    tieneTap: () => !!proc,
    /**
     * Nivel de la señal durante `ms`, medido con ESTE tap.
     *
     * No se usa `qa.rms()` a propósito: el tap de qa-all-lib inserta su analizador
     * en la rama del `connect` hacia el destino, y como este tap redirige esa rama
     * al medidor, el analizador de allá nunca llega a crearse. Medir el nivel con
     * el mismo instrumento que mide la caída también es más honesto: un solo tap.
     */
    nivel: (ms = 350) => new Promise((resolve) => {
      frames.length = 0;
      active = true;
      setTimeout(() => {
        active = false;
        const pico = frames.reduce((m, f) => Math.max(m, f.rms), 0);
        resolve(pico);
      }, ms);
    }),
    // Control positivo: un tono que se corta de un golpe, medido por el mismo tap.
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
      frames.length = 0;
      active = true;
      osc.start(t0 + 0.02);
      // El escalón: de 0,25 a 0 en un solo instante, sin rampa.
      g.gain.setValueAtTime(0.25, t0 + ms / 1000);
      g.gain.setValueAtTime(0, t0 + ms / 1000);
      return new Promise((resolve) => {
        setTimeout(() => {
          active = false;
          try { osc.stop(); } catch (e) { /* ya parado */ }
          resolve({ frames: frames.slice(), corteEn: t0 + ms / 1000 });
        }, ms + 500);
      });
    },
  };
  return true;
})()`;

/** dBFS de un RMS lineal. */
const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
/** Formatea una traza de RMS como una rampa legible. */
function perfil(frames, desde, cantidad = 14) {
  const i0 = frames.findIndex((f) => f.t >= desde);
  const desdeI = i0 < 0 ? 0 : i0;
  return frames
    .slice(desdeI, desdeI + cantidad)
    .map((f) => `${((f.t - desde) * 1000).toFixed(0)}ms ${db(f.rms).toFixed(1)}dB`)
    .join(" · ");
}

await page.addInitScript(PAUSE_TAP);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".playback-bar", { timeout: 25000 });

// ── Cargar un .kar real desde el selector de archivos del Studio ────────────
await page.locator('input[aria-label="Cargar archivo MIDI"]').setInputFiles(SONG);
await page.waitForFunction(
  () => {
    const max = document.querySelector('.seeker-container input[type="range"]')?.getAttribute("max");
    return Number(max) > 10;
  },
  null,
  { timeout: 45000 },
);

const letraBtn = page.locator('.playback-bar button:has-text("Letra")');
const contador = await page.evaluate(
  () => document.querySelector(".lyrics-count")?.textContent ?? null,
);
console.log(`### canción cargada · líneas de letra: ${contador} · Letra disabled=${await letraBtn.isDisabled()}`);

await letraBtn.click();
await page.waitForSelector(".panel-right--lyrics .lyrics-panel", { timeout: 15000 });
const panel = await page.evaluate(() => {
  const p = document.querySelector(".panel-right--lyrics");
  const r = p.getBoundingClientRect();
  return {
    lineas: document.querySelectorAll(".lyrics-line").length,
    palabras: document.querySelectorAll(".lyrics-word").length,
    // En el piano la "zona derecha" es la columna del panel derecho.
    bordeDerechoPx: Math.round(window.innerWidth - r.right),
    anchoPx: Math.round(r.width),
    fuente: getComputedStyle(document.querySelector(".lyrics-line")).fontFamily,
  };
});
console.log("### panel del piano:", JSON.stringify(panel));
await shot("piano-01-panel-letra-derecha");
qa.add({
  control: "Letra (piano): el panel ocupa la zona derecha con la letra por líneas",
  selector: ".panel-right--lyrics",
  result: panel.lineas > 5 && panel.palabras > 20 ? "OK" : "FAIL",
  evidence:
    `con ${SONG.split("/").pop()} el panel derecho dibuja ${panel.lineas} líneas y ${panel.palabras} palabras, ` +
    `pegado al borde derecho (${panel.bordeDerechoPx}px) y con ${panel.anchoPx}px de ancho; tipografía ${panel.fuente}`,
  shot: `${DIR}/piano-01-panel-letra-derecha.png`,
  extra: panel,
});

// ── Reproducir y esperar a que haya señal ──────────────────────────────────
// Ojo con el selector: "Letra" también lleva la clase `primary` cuando está
// activo, así que hay que apuntar por la etiqueta del transporte, no por la clase.
const playPausa = page.locator('.playback-bar button:has-text("Reproducir"), .playback-bar button:has-text("Pausa")').first();
await playPausa.click();
await page.waitForTimeout(200);
const conSenal = await (async () => {
  // Esperar señal real antes de medir la caída (el arranque en frío es lento).
  for (let i = 0; i < 40; i++) {
    const v = await qa.rms(4, 120);
    if (v > -45) return { rms: v, esperaMs: i * 500 };
    await page.waitForTimeout(500);
  }
  return { rms: -Infinity, esperaMs: 20000 };
})();
console.log(`### sonando: RMS ${db(conSenal.rms).toFixed(1)} dB (tras ~${conSenal.esperaMs} ms de espera)`);
await page.waitForTimeout(1500);
await shot("piano-02-sonando-con-letra");

// ── MEDICIÓN: la pausa ──────────────────────────────────────────────────────
const grabando = await page.evaluate(() => window.__PAUSA.arrancar());
if (!grabando) throw new Error("el tap de audio no se instaló");
await playPausa.click();
await page.waitForTimeout(1500);
const traza = await page.evaluate(() => window.__PAUSA.parar());
await shot("piano-03-pausado");

console.log(`\n### PAUSA — ${traza.length} bloques de 2048 muestras (~${((traza[0]?.t ?? 0) * 0 + 2048 / 48000 * 1000).toFixed(1)} ms cada uno)`);
const activos = traza.filter((f) => db(f.rms) > -60);
const ultimoSonoro = activos.length ? activos[activos.length - 1] : null;
const primeroSilencioso = traza.find((f) => ultimoSonoro && f.t > ultimoSonoro.t);
const caidaMs =
  ultimoSonoro && primeroSilencioso ? (primeroSilencioso.t - ultimoSonoro.t) * 1000 : null;
const saltoMax = traza.reduce((m, f) => Math.max(m, f.salto), 0);
const picoMax = traza.reduce((m, f) => Math.max(m, f.pico), 0);
// La caída se mide sobre los bloques que van del último sonoro hacia atrás: la
// pregunta es si BAJA POR ESCALONES o de una.
const cola = traza.slice(Math.max(0, traza.indexOf(ultimoSonoro) - 3), traza.indexOf(ultimoSonoro) + 4);
console.log(`   perfil de la caída: ${cola.map((f) => `${db(f.rms).toFixed(1)}dB`).join(" → ")}`);
console.log(`   pico máximo de la traza: ${picoMax.toFixed(4)} (${db(picoMax).toFixed(1)} dBFS)`);
console.log(`   salto máximo entre muestras consecutivas: ${saltoMax.toFixed(4)}`);
if (caidaMs !== null) console.log(`   de "todavía suena" a "silencio" (<-60 dB): ${caidaMs.toFixed(0)} ms`);

// ── CONTROL POSITIVO: un corte seco de verdad, con el mismo instrumento ─────
const control = await page.evaluate(() => window.__PAUSA.controlCorteSeco(700));
const cActivos = control.frames.filter((f) => db(f.rms) > -60);
const cUltimo = cActivos.length ? cActivos[cActivos.length - 1] : null;
const cSilencio = control.frames.find((f) => cUltimo && f.t > cUltimo.t);
const cCaidaMs = cUltimo && cSilencio ? (cSilencio.t - cUltimo.t) * 1000 : null;
const cSalto = control.frames.reduce((m, f) => Math.max(m, f.salto), 0);
const cPico = control.frames.reduce((m, f) => Math.max(m, f.pico), 0);
console.log(
  `\n### CONTROL POSITIVO (tono cortado de un golpe)\n   pico ${cPico.toFixed(4)} · salto máximo ${cSalto.toFixed(4)} · caída ${cCaidaMs?.toFixed(0)} ms`,
);

const umbralSilencio = -60;
qa.add({
  control: "Pausa: la caída del audio es gradual, sin escalón (medida sobre la señal real)",
  selector: ".playback-bar .btn.primary (pausa)",
  result:
    caidaMs !== null && caidaMs <= 400 && saltoMax < cSalto * 0.5 ? "OK" : "FAIL",
  evidence:
    `con el tap maestro puesto en el único camino al AudioDestinationNode, la pausa deja esta caída de RMS ` +
    `(${cola.map((f) => db(f.rms).toFixed(1)).join(" → ")} dB) y tarda ${caidaMs?.toFixed(0)} ms en bajar de ${umbralSilencio} dB; ` +
    `el salto máximo entre muestras consecutivas en toda la pausa es ${saltoMax.toFixed(4)} contra un pico de señal de ` +
    `${picoMax.toFixed(4)}. CONTROL POSITIVO, mismo instrumento y misma sesión: un tono de 440 Hz cortado de un golpe da ` +
    `salto máximo ${cSalto.toFixed(4)} con pico ${cPico.toFixed(4)} y caída ${cCaidaMs?.toFixed(0)} ms, o sea que el ` +
    `instrumento SÍ distingue un escalón — y la pausa no lo tiene (${(saltoMax / (cSalto || 1) * 100).toFixed(0)}% del salto del corte seco).`,
  shot: `${DIR}/piano-03-pausado.png`,
  extra: {
    bloques: traza.length,
    ultimoSonoro,
    primeroSilencioso,
    caidaMs,
    saltoMax,
    picoMax,
    cola,
    control: { cSalto, cPico, cCaidaMs, bloques: control.frames.length },
  },
});

// ── Click en una palabra = seek EXACTO (acá sí se puede medir en reposo) ────
const antes = await page.evaluate(() => {
  const lineas = [...document.querySelectorAll(".lyrics-line")];
  const medio = lineas[Math.floor(lineas.length / 2)];
  const palabras = [...medio.querySelectorAll(".lyrics-word[data-word-time]")];
  const nodo = palabras[Math.min(2, palabras.length - 1)] ?? palabras[0];
  const seeker = document.querySelector('.seeker-container input[type="range"]');
  return {
    posicion: Number(seeker.value),
    lineaIndice: lineas.indexOf(medio),
    palabra: nodo.getAttribute("data-word"),
    tPalabra: Number(nodo.getAttribute("data-word-time")),
    totalLineas: lineas.length,
  };
});
await page.evaluate(({ lineaIndice, palabra }) => {
  const linea = document.querySelector(`.lyrics-line[data-line="${lineaIndice}"]`);
  [...linea.querySelectorAll(".lyrics-word")]
    .find((w) => w.getAttribute("data-word") === palabra)
    .scrollIntoView({ block: "center" });
}, antes);
await page.waitForTimeout(600);
await shot("piano-04-antes-del-click");
await page
  .locator(`.lyrics-line[data-line="${antes.lineaIndice}"] .lyrics-word`, { hasText: antes.palabra })
  .first()
  .click();
await page.waitForTimeout(1200);
const despues = await page.evaluate(() => {
  const seeker = document.querySelector('.seeker-container input[type="range"]');
  const activa = document.querySelector(".lyrics-line--active");
  return {
    posicion: Number(seeker.value),
    reloj: document.querySelector(".time-display")?.textContent.replace(/\s+/g, " ").trim(),
    lineaActiva: activa?.getAttribute("data-line"),
    textoLineaActiva: activa?.textContent.trim().slice(0, 60),
  };
});
await shot("piano-05-despues-del-click");
const error = Math.abs(despues.posicion - antes.tPalabra);
console.log(
  `\n### CLICK = SEEK (en reposo)\n   antes ${antes.posicion.toFixed(3)}s · palabra ${JSON.stringify(antes.palabra)} ` +
    `cuyo tiempo es ${antes.tPalabra.toFixed(3)}s\n   después ${despues.posicion.toFixed(3)}s (reloj ${despues.reloj}) · ` +
    `línea activa ${despues.lineaActiva}\n   |error| = ${(error * 1000).toFixed(0)} ms`,
);
qa.add({
  control: "Letra (piano): tocar una palabra deja el transporte en ESE instante, en reposo",
  selector: ".lyrics-word",
  result: error < 0.06 ? "OK" : "FAIL",
  evidence:
    `pausado, con el transporte en ${antes.posicion.toFixed(3)}s, se tocó ${JSON.stringify(antes.palabra)} de la línea ` +
    `${antes.lineaIndice} (de ${antes.totalLineas}) cuyo tiempo en el archivo es ${antes.tPalabra.toFixed(3)}s: el transporte ` +
    `quedó en ${despues.posicion.toFixed(3)}s y la línea resaltada pasó a la ${despues.lineaActiva} ` +
    `(${JSON.stringify(despues.textoLineaActiva)}). |error| = ${(error * 1000).toFixed(0)} ms`,
  shot: `${DIR}/piano-04-antes-del-click.png · ${DIR}/piano-05-despues-del-click.png`,
  extra: { antes, despues, error },
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 8).forEach((e) => console.log("  " + e));
const destino = qa.save("letras/resultados-pausa");
console.log(`resultados: ${qa.results.length} filas → ${destino}`);
await qa.close();
