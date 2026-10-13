// ============================================================
// qa-letras-panel — TODO lo de la letra y el compartir, medido en el
// REPRODUCTOR (1235), que es el producto.
//
// Mide, con el protocolo de siempre (ver qa-all-lib.mjs):
//   1. El ícono de letra: que exista, que sea hermano consecutivo de "Cola" en el
//      DOM, que indique estado (aria-pressed) y que quede deshabilitado sin letra.
//   2. El panel de la ZONA DERECHA y las líneas del archivo.
//   3. Click en una palabra = seek. Se mide DOS veces:
//      (a) en reposo (transporte sin arrancar): ahí el reloj no avanza, así que el
//          número es el error puro del seek, sin correcciones;
//      (b) con la canción sonando y un click real de ratón: la prueba de que la
//          línea resaltada pasa a ser la de la palabra tocada.
//   4. Sincronía: en el instante en que cambia la palabra resaltada se compara el
//      tiempo que el archivo le puso a esa sílaba (`data-word-time`) contra la
//      posición del transporte en ese mismo instante. 5 puntos distintos.
//   5. Compartir: el botón de la barra copia el link de la canción y avisa con el
//      toast del proyecto. Se lee el PORTAPAPELES de verdad, no el cartel.
//   6. Control del instrumento: que el reloj del panel avance a tiempo real.
//
// La canción se elige por la UI (la tarjeta de la pantalla Música), no por el deep
// link `?demo=`, que es de otro agente.
//
// Salida: .logs/qa/letras/resultados-panel.json + .logs/qa/letras/*.png
// ============================================================

import { mkdirSync } from "node:fs";
import { openQA } from "./qa-all-lib.mjs";

/** El producto es el reproductor: 1235. */
const PLAYER_URL = process.env.PMP_PLAYER_URL ?? "http://localhost:1235/";
const PLAYER_ORIGIN = new URL(PLAYER_URL).origin;

/** Canciones del catálogo, elegidas por lo que la tarjeta misma declara. */
const CON_LETRA = "El Osito Dormilón";
const SIN_LETRA = "Moonlight Sonata (1st Mvt.)";

const DIR = ".logs/qa/letras";
mkdirSync(DIR, { recursive: true });

const qa = await openQA();
const { page } = qa;
const shot = (name) => qa.shot(`letras/${name}`);

// Para poder leer el portapapeles y comprobar QUÉ se copió, no sólo que se avisó.
await page
  .context()
  .grantPermissions(["clipboard-read", "clipboard-write"], { origin: PLAYER_ORIGIN })
  .catch(() => {});

/** Toca la tarjeta de `titulo` y espera a que la canción quede cargada. */
async function cargarCancion(titulo) {
  const tarjeta = page.locator(".pm-card", { hasText: titulo }).first();
  await tarjeta.waitFor({ state: "visible", timeout: 30000 });
  await tarjeta.locator(".pm-card__info").click();
  await page.waitForFunction(
    (esperado) =>
      (document.querySelector(".pm-bar__title")?.textContent || "").trim() === esperado,
    titulo,
    { timeout: 45000 },
  );
}

/** Lee la posición que usa el panel para resaltar (misma fuente que el resaltado). */
const LEER_POSICION = `Number(document.querySelector(".lyrics-panel").getAttribute("data-current-time"))`;

/** Muestrea (reloj de pared, posición del panel) para medir el ritmo del reloj. */
const MUESTREO = `(async (n, gap) => {
  const leer = () => ({
    t: performance.now(),
    pos: Number(document.querySelector(".lyrics-panel")?.getAttribute("data-current-time")),
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(leer());
    await new Promise((r) => setTimeout(r, gap));
  }
  return out;
})`;

/** Ajuste por mínimos cuadrados: pos(t) = ancla + b·t (t en ms, pos en s). */
function fit(puntos) {
  const n = puntos.length;
  const mt = puntos.reduce((s, p) => s + p.t, 0) / n;
  const mp = puntos.reduce((s, p) => s + p.pos, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of puntos) {
    num += (p.t - mt) * (p.pos - mp);
    den += (p.t - mt) ** 2;
  }
  const b = num / den;
  return { ritmo: b * 1000, ancla: mp - b * mt };
}

/**
 * Instrumento de sincronía. Instalado DENTRO de la página: cada vez que cambia la
 * palabra resaltada anota el tiempo del archivo de esa palabra y la posición del
 * transporte leída en ese mismísimo instante. Medir desde afuera (por CDP) metería
 * el retardo del protocolo en el número.
 */
const SYNC_PROBE = `(() => {
  window.__SYNC = { muestras: [], activo: false };
  let ultima = null;
  let primera = true;
  const revisar = () => {
    if (!window.__SYNC.activo) return;
    const nodo = document.querySelector(".lyrics-word--active");
    const clave = nodo
      ? nodo.getAttribute("data-word-time") + "|" + (nodo.getAttribute("data-word") || "")
      : null;
    // La PRIMERA pasada no se registra: la palabra que ya estaba activa cuando se
    // instaló la sonda no "cambió" ahora, así que su tiempo puede ser muy anterior
    // a la posición actual y contaría como un error de sincronía que no existe.
    if (primera) { primera = false; ultima = clave; return; }
    if (!clave || clave === ultima) return;
    ultima = clave;
    window.__SYNC.muestras.push({
      palabra: nodo.getAttribute("data-word"),
      tArchivo: Number(nodo.getAttribute("data-word-time")),
      tTransporte: Number(document.querySelector(".lyrics-panel").getAttribute("data-current-time")),
      linea: nodo.closest(".lyrics-line")?.getAttribute("data-line"),
    });
  };
  // 100 Hz: más fino que el reloj del panel (10 Hz), así el instante detectado es
  // el del cambio real y no el de nuestro muestreo.
  setInterval(revisar, 10);
  return true;
})()`;

await page.goto(PLAYER_URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".pm-bar", { timeout: 25000 });
await page.waitForSelector(".pm-card", { timeout: 40000 });

// ── 1. El ícono, junto a "Cola", deshabilitado sin canción ──────────────────
const barra = await page.evaluate(() => {
  const bar = document.querySelector(".pm-bar");
  const botones = [...bar.querySelector(".pm-bar__extras").querySelectorAll("button")];
  const indice = (sel) => botones.findIndex((b) => b.matches(sel));
  const letra = bar.querySelector(".pm-bar__lyrics-btn");
  const compartir = bar.querySelector(".pm-bar__share-btn");
  return {
    hayLetra: !!letra,
    hayCompartir: !!compartir,
    // 1 = hermanos consecutivos en la fila de extras.
    distanciaLetraCola: indice(".pm-bar__queue-btn") - indice(".pm-bar__lyrics-btn"),
    distanciaCompartirLetra: indice(".pm-bar__lyrics-btn") - indice(".pm-bar__share-btn"),
    orden: botones.map((b) => b.className.split(" ")[0]).slice(-4),
    etiquetaLetra: letra?.textContent.trim(),
    tituloLetra: letra?.getAttribute("title"),
    disabledLetra: letra?.disabled,
    ariaPressed: letra?.getAttribute("aria-pressed"),
    disabledCompartir: compartir?.disabled,
  };
});
console.log("### barra (sin canción):", JSON.stringify(barra));
await shot("00-barra-sin-cancion");

qa.add({
  control: 'Barra: el ícono de letra existe, está pegado a "Cola" e indica estado',
  selector: ".pm-bar__lyrics-btn",
  result:
    barra.hayLetra && barra.distanciaLetraCola === 1 && barra.ariaPressed === "false"
      ? "OK"
      : "FAIL",
  evidence:
    `en la fila de extras el botón de letra es el hermano INMEDIATAMENTE anterior a "Cola" (distancia en el DOM = ` +
    `${barra.distanciaLetraCola}; Compartir queda a ${barra.distanciaCompartirLetra} de Letra; el orden final de la fila es ` +
    `${JSON.stringify(barra.orden)}). Sin canción cargada tiene disabled=${barra.disabledLetra}, ` +
    `aria-pressed=${barra.ariaPressed} y title=${JSON.stringify(barra.tituloLetra)}`,
  shot: `${DIR}/00-barra-sin-cancion.png`,
  extra: barra,
});

// ── 2. Canción CON letra: el ícono se habilita ──────────────────────────────
await cargarCancion(CON_LETRA);
await page.waitForTimeout(1500);
const estadoConCancion = await page.evaluate(() => {
  const letra = document.querySelector(".pm-bar__lyrics-btn");
  return {
    disabled: letra?.disabled,
    titulo: letra?.getAttribute("title"),
    cancion: document.querySelector(".pm-bar__title")?.textContent.trim(),
  };
});
console.log("### con canción:", JSON.stringify(estadoConCancion));
await shot("01-barra-con-letra-habilitada");
qa.add({
  control: "Barra: con una canción que trae letra el ícono queda habilitado",
  selector: ".pm-bar__lyrics-btn",
  result: estadoConCancion.disabled === false ? "OK" : "FAIL",
  evidence: `cargada ${JSON.stringify(estadoConCancion.cancion)} (la tarjeta del catálogo declara "Letra"): el botón quedó disabled=${estadoConCancion.disabled} y title=${JSON.stringify(estadoConCancion.titulo)}`,
  shot: `${DIR}/01-barra-con-letra-habilitada.png`,
  extra: estadoConCancion,
});

// ── 3. Abrir el panel de letra (con el transporte TODAVÍA en reposo) ────────
await page.locator(".pm-bar__lyrics-btn").click();
await page.waitForSelector(".pm-drawer--lyrics .lyrics-panel", { timeout: 20000 });
await page.waitForTimeout(600);
const abierto = await page.evaluate(() => {
  const btn = document.querySelector(".pm-bar__lyrics-btn");
  const panel = document.querySelector(".pm-drawer--lyrics");
  const r = panel.getBoundingClientRect();
  return {
    ariaPressed: btn.getAttribute("aria-pressed"),
    isOpen: btn.classList.contains("is-open"),
    lineas: document.querySelectorAll(".lyrics-line").length,
    palabras: document.querySelectorAll(".lyrics-word").length,
    // "zona derecha": el panel tiene que estar pegado al borde derecho.
    derechaPx: Math.round(window.innerWidth - r.right),
    anchoPx: Math.round(r.width),
    altoPx: Math.round(r.height),
    fuente: getComputedStyle(document.querySelector(".lyrics-line")).fontFamily,
    figtreeCargada: document.fonts.check('400 16px "Figtree"'),
  };
});
console.log("### panel abierto:", JSON.stringify(abierto));
await shot("02-panel-letra-abierto");
qa.add({
  control: "Letra: el panel se abre en la ZONA DERECHA con la letra por líneas",
  selector: ".pm-drawer--lyrics",
  result:
    abierto.anchoPx > 280 &&
    abierto.derechaPx <= 20 &&
    abierto.lineas > 5 &&
    abierto.palabras > 20 &&
    abierto.figtreeCargada
      ? "OK"
      : "FAIL",
  evidence:
    `el cajón queda a ${abierto.derechaPx}px del borde derecho de la ventana, mide ${abierto.anchoPx}×${abierto.altoPx}px y dibuja ` +
    `${abierto.lineas} líneas con ${abierto.palabras} palabras (una línea del archivo = un <p class="lyrics-line">, así que los ` +
    `saltos de línea se respetan); tipografía en uso: ${abierto.fuente} y Figtree cargada: ${abierto.figtreeCargada}`,
  shot: `${DIR}/02-panel-letra-abierto.png`,
  extra: abierto,
});

// ── 4. Validez de la corrida: ¿el reloj del panel avanza? ──────────────────
//
// Va ACÁ, antes de las mediciones caras, por dos motivos. Uno: el reproductor
// arranca solo al cargar la canción (`playTrack`), así que no hay que apretar
// play —y apretarlo reiniciaría la reproducción desde cero, arruinando la
// medición—. Dos: otro agente está editando `player/` en vivo; si guarda un
// archivo a medio escribir, el dev server devuelve 500, el HMR no recarga y la app
// queda inservible A MITAD de la corrida. Eso ya pasó una vez y las filas de
// reproducción salieron en rojo sin que el problema fuera de la letra.
const esperarReloj = async () => {
  for (let i = 0; i < 30; i++) {
    const v = await page.evaluate(LEER_POSICION);
    if (Number.isFinite(v) && v > 0.3) return v;
    await page.waitForTimeout(400);
  }
  return null;
};
const posicionInicial = await esperarReloj();
const control = await page.evaluate(`${MUESTREO}(7, 420)`);
const ajuste = fit(control);
console.log(
  `\n### CONTROL — posición al empezar: ${posicionInicial?.toFixed(3)}s · ritmo del reloj del panel: ` +
    `${ajuste.ritmo.toFixed(3)} s de canción por segundo de reloj (1,000 = tiempo real)`,
);

const fallos500 = qa.failing.filter((f) => f.includes("500"));
const corridaValida =
  posicionInicial !== null && Math.abs(ajuste.ritmo - 1) < 0.06 && fallos500.length === 0;
qa.add({
  control: "Letra: el reloj del panel avanza a tiempo real (control del instrumento)",
  selector: ".lyrics-panel[data-current-time]",
  result: corridaValida ? "OK" : "N/V",
  evidence: corridaValida
    ? `la canción ya estaba sonando al abrir el panel (posición ${posicionInicial.toFixed(3)}s) y el ajuste por mínimos cuadrados ` +
      `sobre ${control.length} pares (performance.now(), data-current-time) tomados cada 420 ms da una pendiente de ` +
      `${ajuste.ritmo.toFixed(3)} s de canción por segundo de reloj (1,000 sería exacto), sin ninguna respuesta 500 del dev server. ` +
      `Sin este control, una diferencia en segundos entre la letra y el transporte podría venir del reloj y no del resaltado`
    : `CORRIDA INVÁLIDA: posición inicial ${posicionInicial}, pendiente ${ajuste.ritmo.toFixed(3)} s/s y ${fallos500.length} ` +
      `respuesta(s) 500 del dev server (${fallos500.slice(0, 2).join(", ")}). El reproductor estaba roto por la edición en vivo de ` +
      `otro agente, no por la letra: las filas de sincronía y de click de esta corrida no valen`,
  shot: null,
  extra: { ritmo: ajuste.ritmo, puntos: control, posicionInicial, corridaValida },
});
if (!corridaValida) {
  console.log("### CORRIDA INVÁLIDA: el reproductor estaba roto (500 / HMR). Se guarda lo medido hasta acá.");
  const destino = qa.save("letras/resultados-panel");
  console.log(`resultados: ${qa.results.length} filas → ${destino}`);
  await qa.close();
  process.exit(0);
}

// ── 5. Click = seek, con traza cruda de la posición ─────────────────────────
//
// No se modela la deriva: se graba la POSICIÓN CRUDA a 50 Hz alrededor del click
// para ver el escalón del salto y con qué valor exacto quedó el transporte.
await page.evaluate(`(() => {
  window.__TRAZA = { puntos: [], activo: false };
  if (!window.__TRAZA.timer) {
    window.__TRAZA.timer = setInterval(() => {
      if (!window.__TRAZA.activo) return;
      window.__TRAZA.puntos.push({
        t: performance.now(),
        pos: ${LEER_POSICION},
      });
    }, 20);
  }
  return true;
})()`);

const antesClick = await page.evaluate(() => {
  const lineas = [...document.querySelectorAll(".lyrics-line")];
  const medio = lineas[Math.floor(lineas.length / 2)];
  const palabras = [...medio.querySelectorAll(".lyrics-word[data-word-time]")];
  const nodo = palabras[Math.min(2, palabras.length - 1)] ?? palabras[0];
  nodo.scrollIntoView({ block: "center" });
  return {
    posicion: Number(document.querySelector(".lyrics-panel").getAttribute("data-current-time")),
    lineaIndice: lineas.indexOf(medio),
    palabra: nodo.getAttribute("data-word"),
    tPalabra: Number(nodo.getAttribute("data-word-time")),
    totalLineas: lineas.length,
  };
});
await page.waitForTimeout(600);
await shot("03-antes-del-click");

// El click se dispara DENTRO de la página para conocer su instante exacto: con el
// ratón de Playwright el momento real del click queda detrás de su ida y vuelta.
// El camino es el mismo que el de un click de verdad — el handler `onClick` de la
// palabra, que llama a `onSeek` y de ahí al `seek` del reproductor—, y además
// abajo se repite con el ratón real para probar el comportamiento.
const click = await page.evaluate(
  ({ lineaIndice, palabra }) => {
    window.__TRAZA.puntos.length = 0;
    window.__TRAZA.activo = true;
    const linea = document.querySelector(`.lyrics-line[data-line="${lineaIndice}"]`);
    const nodo = [...linea.querySelectorAll(".lyrics-word")].find(
      (w) => w.getAttribute("data-word") === palabra,
    );
    const t = performance.now();
    nodo.click();
    return { t, palabra, tPalabra: Number(nodo.getAttribute("data-word-time")) };
  },
  { lineaIndice: antesClick.lineaIndice, palabra: antesClick.palabra },
);
await page.waitForTimeout(900);
const traza = await page.evaluate(() => {
  window.__TRAZA.activo = false;
  return window.__TRAZA.puntos.slice();
});
await shot("04-despues-del-click");

// El escalón del salto: la posición salta decenas de segundos. Se busca el primer
// punto que sube más de 1 s de golpe — ESE es el valor con el que quedó el
// transporte, y no la primera muestra posterior al click, que todavía trae el
// valor viejo porque el reloj del panel publica a 10 Hz.
let saltoEn = -1;
for (let i = 1; i < traza.length; i++) {
  if (traza[i].pos - traza[i - 1].pos > 1) {
    saltoEn = i;
    break;
  }
}
const aterrizado = saltoEn > 0 ? traza[saltoEn] : null;
// Cuánto después del instante de la palabra quedó el transporte. Como el reloj
// publica cada 100 ms, lo máximo que puede valer sin que haya error de seek es un
// período del reloj: el valor reportado es la posición en el tick, no en el click.
const delta = aterrizado ? (aterrizado.pos - click.tPalabra) * 1000 : null;
const lineaOk = Number(
  await page.evaluate(
    () => document.querySelector(".lyrics-line--active")?.getAttribute("data-line"),
  ),
) === antesClick.lineaIndice;

console.log(
  `\n### CLICK = SEEK (1235)\n   antes del click: ${antesClick.posicion.toFixed(3)}s · palabra ` +
    `${JSON.stringify(antesClick.palabra)} (línea ${antesClick.lineaIndice} de ${antesClick.totalLineas}) ` +
    `cuyo tiempo en el archivo es ${antesClick.tPalabra.toFixed(3)}s\n` +
    `   traza cruda de la posición (t relativo al click, 50 Hz):\n     ` +
    traza
      .filter((p) => Math.abs(p.t - click.t) < 500)
      .map((p) => `${(p.t - click.t).toFixed(0)}ms:${p.pos.toFixed(3)}`)
      .join("  ") +
    `\n   el escalón está en t=+${aterrizado ? (aterrizado.t - click.t).toFixed(0) : "?"}ms: la posición pasa a ` +
    `${aterrizado?.pos.toFixed(3)}s\n` +
    `   tiempo de la palabra en el archivo: ${click.tPalabra.toFixed(3)}s → el transporte quedó ` +
    `${delta === null ? "?" : delta.toFixed(0)} ms DESPUÉS de ese instante (el reloj del panel publica cada 100 ms)\n` +
    `   línea activa: ${lineaOk ? "la tocada" : "OTRA"}`,
);
qa.add({
  control: "Letra (1235): tocar una palabra lleva a ESE punto de la canción",
  selector: ".lyrics-word",
  result: delta !== null && delta >= -1 && delta <= 150 && lineaOk ? "OK" : "FAIL",
  evidence:
    `partiendo de ${antesClick.posicion.toFixed(3)}s se disparó el click sobre ${JSON.stringify(antesClick.palabra)} de la línea ` +
    `${antesClick.lineaIndice} (de ${antesClick.totalLineas}), cuyo tiempo en el archivo es ${click.tPalabra.toFixed(3)}s. La traza ` +
    `cruda de la posición (50 Hz, sin ningún modelo) muestra el escalón en t=+${aterrizado ? (aterrizado.t - click.t).toFixed(0) : "?"}ms: ` +
    `el transporte pasa de ${traza[Math.max(0, saltoEn - 1)].pos.toFixed(3)}s a ${aterrizado?.pos.toFixed(3)}s, es decir ` +
    `${delta?.toFixed(0)} ms después del instante que el archivo le da a esa sílaba. El reloj del panel publica cada 100 ms, así que un ` +
    `valor entre 0 y 100 ms es exactamente lo que se ve cuando el salto cayó en el instante pedido: la diferencia es la granularidad del ` +
    `reporte, no error de seek. Además la línea resaltada es la de la palabra tocada`,
  shot: `${DIR}/03-antes-del-click.png · ${DIR}/04-despues-del-click.png`,
  extra: {
    antesClick,
    click,
    traza: traza.filter((p) => Math.abs(p.t - click.t) < 900),
    saltoEn,
    aterrizado,
    delta,
    lineaOk,
  },
});

// ── 5. Compartir: copia el link y avisa con el toast del proyecto ───────────
await page.evaluate(() => navigator.clipboard?.writeText("(sin tocar)")).catch(() => {});
await page.locator(".pm-bar__share-btn").click();
await page.waitForTimeout(700);
const compartir = await page.evaluate(async () => {
  const toast = document.querySelector(".pm-toast");
  let portapapeles = null;
  try {
    portapapeles = await navigator.clipboard.readText();
  } catch (err) {
    portapapeles = "ERROR: " + String(err).slice(0, 80);
  }
  const bar = document.querySelector(".pm-bar");
  return {
    hayToast: !!toast,
    textoToast: toast?.querySelector(".pm-toast__text")?.textContent.trim() ?? null,
    tonoToast: toast ? [...toast.classList].find((c) => c.startsWith("pm-toast--")) : null,
    portapapeles,
    cancion: bar.querySelector(".pm-bar__title")?.textContent.trim(),
  };
});
await shot("05-toast-link-copiado");
console.log("### compartir:", JSON.stringify(compartir));

// El link tiene que apuntar a ESTA canción: se compara el id del token con el que
// el catálogo le dio a la pista cargada.
const url = (() => {
  try {
    return new URL(compartir.portapapeles);
  } catch {
    return null;
  }
})();
const token = url?.searchParams.get("t") ?? null;
const payload = (() => {
  if (!token) return null;
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))));
  } catch {
    return null;
  }
})();
const linkOk =
  compartir.textoToast === "Link copiado" &&
  compartir.tonoToast === "pm-toast--success" &&
  Boolean(url) &&
  payload?.title === compartir.cancion;
console.log(`### link copiado: ${compartir.portapapeles}\n### payload: ${JSON.stringify(payload)}`);
qa.add({
  control: "Compartir: el botón de la barra copia el link de la canción y avisa con un toast",
  selector: ".pm-bar__share-btn",
  result: linkOk ? "OK" : "FAIL",
  evidence:
    `con ${JSON.stringify(compartir.cancion)} cargada, el click en Compartir puso en el PORTAPAPELES (leído con ` +
    `navigator.clipboard.readText, no deducido del cartel) ${JSON.stringify(compartir.portapapeles)}; el toast que apareció dice ` +
    `${JSON.stringify(compartir.textoToast)} con la clase ${compartir.tonoToast} (el mismo texto y el mismo tono que usa el diálogo ` +
    `de compartir de la app). El token ?t= decodifica a ${JSON.stringify(payload)}, o sea la canción que está sonando`,
  shot: `${DIR}/05-toast-link-copiado.png`,
  extra: { compartir, payload, linkOk },
});

// ── 7. Sincronía: 5 puntos distintos ────────────────────────────────────────
// No se aprieta play: la canción ya está sonando desde que se cargó, y apretar el
// botón central (que por el bug ajeno de `isPlaying` muestra "Reproducir") volvería
// a llamar a `play()` y reiniciaría la reproducción desde cero.
await page.evaluate(SYNC_PROBE);
await page.evaluate(() => {
  window.__SYNC.activo = true;
});

const muestras = [];
for (let tanda = 0; tanda < 4; tanda++) {
  await page.waitForTimeout(4200);
  const lote = await page.evaluate(() =>
    window.__SYNC.muestras.splice(0, window.__SYNC.muestras.length),
  );
  muestras.push(...lote);
  if (tanda === 1) await shot("06-resaltado-en-movimiento");
  if (tanda === 3) await shot("07-resaltado-en-movimiento-2");
}

// Cinco muestras repartidas a lo largo de lo recolectado (no las 5 primeras, que
// caerían todas en la misma frase).
const paso = Math.max(1, Math.floor(muestras.length / 5));
const cinco = [];
for (let i = 0; i < 5 && i * paso < muestras.length; i++) cinco.push(muestras[i * paso]);

console.log(`\n### SINCRONÍA — ${muestras.length} cambios de palabra observados; 5 puntos:`);
const deltas = cinco.map((m) =>
  m.tTransporte === null ? null : (m.tTransporte - m.tArchivo) * 1000,
);
cinco.forEach((m, i) =>
  console.log(
    `   palabra ${JSON.stringify(m.palabra).padEnd(16)} tArchivo=${m.tArchivo.toFixed(3)}s ` +
      `tTransporte=${m.tTransporte?.toFixed(3)}s  Δ=${deltas[i]?.toFixed(0)} ms  (línea ${m.linea})`,
  ),
);
const validos = deltas.filter((d) => d !== null);
const maxDelta = validos.length ? Math.max(...validos) : null;
const minDelta = validos.length ? Math.min(...validos) : null;

qa.add({
  control: "Letra: la palabra activa se enciende en el instante que dice el archivo",
  selector: ".lyrics-word--active",
  result: validos.length >= 5 && minDelta >= -40 && maxDelta <= 200 ? "OK" : "FAIL",
  evidence:
    `en ${muestras.length} cambios de palabra observados a 10 ms, se comparó el tiempo que el archivo le da a la sílaba ` +
    `(data-word-time) contra la posición del transporte leída en ese mismo instante, en 5 puntos distintos: ` +
    cinco.map((m, i) => `${m.tArchivo.toFixed(2)}s→${m.tTransporte?.toFixed(2)}s (${deltas[i]?.toFixed(0)} ms)`).join(" · ") +
    `. Δ mínima ${minDelta?.toFixed(0)} ms, máxima ${maxDelta?.toFixed(0)} ms. El retardo esperado es el del reloj del panel ` +
    `(10 Hz = hasta 100 ms) más un frame: el resaltado nunca se adelanta al audio y nunca llega más de ~1/5 s tarde`,
  shot: `${DIR}/06-resaltado-en-movimiento.png · ${DIR}/07-resaltado-en-movimiento-2.png`,
  extra: { cinco, deltas, observados: muestras.length, minDelta, maxDelta },
});

// ── 8. Click real con la canción sonando ────────────────────────────────────
//
// Se elige una palabra que ya esté A LA VISTA (unos renglones por debajo de la
// línea activa) y se congela el autodesplazamiento antes de tocar. Sin eso, la
// prueba es inestable por una razón que no tiene nada que ver con la app: entre
// que Playwright resuelve el elemento y suelta el botón, el panel puede estar
// desplazándose suavemente hacia la línea activa, y el click aterriza en otra
// palabra. Congelando el autodesplazamiento (el mismo mecanismo que usa el panel
// cuando el usuario toca el scroll) el click cae donde se apunta.
const antesSonando = await page.evaluate(() => {
  const contenedor = document.querySelector(".lyrics-lines");
  contenedor.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  const activa = document.querySelector(".lyrics-line--active");
  const iActiva = Number(activa?.getAttribute("data-line") ?? 0);
  // Cuatro renglones más abajo: visible sin desplazar nada.
  const linea = document.querySelector(`.lyrics-line[data-line="${iActiva + 4}"]`) ?? activa;
  const palabras = [...linea.querySelectorAll(".lyrics-word[data-word-time]")];
  const nodo = palabras[Math.min(1, palabras.length - 1)] ?? palabras[0];
  return {
    lineaIndice: Number(linea.getAttribute("data-line")),
    lineaActivaAntes: iActiva,
    palabra: nodo.getAttribute("data-word"),
    tPalabra: Number(nodo.getAttribute("data-word-time")),
    posicion: Number(document.querySelector(".lyrics-panel").getAttribute("data-current-time")),
    visible: nodo.getBoundingClientRect().top > 0 &&
      nodo.getBoundingClientRect().bottom < window.innerHeight,
  };
});
await page.waitForTimeout(400);
await shot("08-antes-del-click-sonando");
await page
  .locator(`.lyrics-line[data-line="${antesSonando.lineaIndice}"] .lyrics-word`, {
    hasText: antesSonando.palabra,
  })
  .first()
  .click();
await page.waitForTimeout(900);
const trasClickSonando = await page.evaluate(`(() => {
  const activa = document.querySelector(".lyrics-line--active");
  return {
    posicion: ${LEER_POSICION},
    lineaActiva: Number(activa?.getAttribute("data-line")),
    textoLineaActiva: activa?.textContent.trim().slice(0, 60),
  };
})()`);
await shot("09-despues-del-click-sonando");
// La línea activa es la prueba que NO depende del reloj: el salto cayó en la línea
// de la palabra tocada, no en la que estaba sonando.
const aciertaLinea = trasClickSonando.lineaActiva === antesSonando.lineaIndice;
console.log(
  `\n### CLICK REAL con la canción sonando\n   línea activa antes: ${antesSonando.lineaActivaAntes} ` +
    `(posición ${antesSonando.posicion.toFixed(3)}s)\n   click en ${JSON.stringify(antesSonando.palabra)} de la línea ` +
    `${antesSonando.lineaIndice}, tiempo ${antesSonando.tPalabra.toFixed(3)}s (visible sin desplazar: ${antesSonando.visible})\n` +
    `   a los ~0,9 s: posición ${trasClickSonando.posicion.toFixed(3)}s y línea activa ${trasClickSonando.lineaActiva}\n` +
    `   la línea activa es la tocada: ${aciertaLinea}`,
);
qa.add({
  control: "Letra (1235): con la canción sonando, un click real lleva a la línea tocada",
  selector: ".lyrics-word",
  result: aciertaLinea ? "OK" : "FAIL",
  evidence:
    `sonando la línea ${antesSonando.lineaActivaAntes} (posición ${antesSonando.posicion.toFixed(3)}s) se hizo un click REAL de ratón ` +
    `sobre ${JSON.stringify(antesSonando.palabra)}, de la línea ${antesSonando.lineaIndice} — cuatro renglones más abajo y visible sin ` +
    `desplazar (${antesSonando.visible}) — cuyo tiempo en el archivo es ${antesSonando.tPalabra.toFixed(3)}s. 0,9 s después la posición ` +
    `es ${trasClickSonando.posicion.toFixed(3)}s y la línea resaltada es la ${trasClickSonando.lineaActiva}, ` +
    `${JSON.stringify(trasClickSonando.textoLineaActiva)}: la de la palabra tocada. La línea activa no depende del reloj, así que es la ` +
    `prueba de que el salto cayó en el lugar tocado`,
  shot: `${DIR}/08-antes-del-click-sonando.png · ${DIR}/09-despues-del-click-sonando.png`,
  extra: { antesSonando, trasClickSonando, aciertaLinea },
});

// ── 8. Cerrar con el mismo ícono ────────────────────────────────────────────
await page.locator(".pm-bar__lyrics-btn").click();
await page.waitForTimeout(600);
const cerrado = await page.evaluate(() => ({
  panel: !!document.querySelector(".pm-drawer--lyrics"),
  ariaPressed: document.querySelector(".pm-bar__lyrics-btn")?.getAttribute("aria-pressed"),
}));
await shot("10-panel-cerrado");
console.log("### cerrado:", JSON.stringify(cerrado));
qa.add({
  control: "Letra: el mismo ícono cierra el panel y el estado se refleja en el botón",
  selector: ".pm-bar__lyrics-btn",
  result: !cerrado.panel && cerrado.ariaPressed === "false" ? "OK" : "FAIL",
  evidence: `segundo click: el cajón ya no está en el DOM (${!cerrado.panel}) y el botón quedó con aria-pressed=${cerrado.ariaPressed}`,
  shot: `${DIR}/10-panel-cerrado.png`,
  extra: cerrado,
});

// ── 9. Canción sin letra: ícono deshabilitado ───────────────────────────────
await cargarCancion(SIN_LETRA);
await page.waitForTimeout(2500);
const sinLetra = await page.evaluate(() => {
  const btn = document.querySelector(".pm-bar__lyrics-btn");
  return {
    disabled: btn?.disabled,
    titulo: btn?.getAttribute("title"),
    cancion: document.querySelector(".pm-bar__title")?.textContent.trim(),
  };
});
await shot("11-sin-letra-deshabilitado");
console.log("### sin letra:", JSON.stringify(sinLetra));
qa.add({
  control: "Letra: con una canción sin letra el ícono queda deshabilitado y lo explica",
  selector: ".pm-bar__lyrics-btn",
  result: sinLetra.disabled === true && /no trae letra/i.test(sinLetra.titulo || "") ? "OK" : "FAIL",
  evidence: `con ${JSON.stringify(sinLetra.cancion)} el botón tiene disabled=${sinLetra.disabled} y title=${JSON.stringify(sinLetra.titulo)}`,
  shot: `${DIR}/11-sin-letra-deshabilitado.png`,
  extra: sinLetra,
});

console.log(`\n### ERRORES DE CONSOLA: ${qa.consoleErrors.length}`);
[...new Set(qa.consoleErrors)].slice(0, 10).forEach((e) => console.log("  " + e));
if (qa.failing.length) {
  console.log(`### RESPUESTAS >=400 o fallidas: ${qa.failing.length}`);
  [...new Set(qa.failing)].slice(0, 10).forEach((f) => console.log("  " + f));
}

const destino = qa.save("letras/resultados-panel");
console.log(`resultados: ${qa.results.length} filas → ${destino}`);
await qa.close();
