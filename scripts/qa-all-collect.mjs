// ============================================================
// qa-all-collect — consolida los .logs/qa/results-*.json en una tabla única
// por control, quitando duplicados y filas de diagnóstico.
//
// Reglas:
//   • Las filas se agrupan por `control`; gana la de la lista PRIORITY (la
//     medición más específica y más reciente).
//   • Los controles que empiezan con "Diagnóstico", "Debug", "Probe", "Control
//     de sanidad" o "Recursos HTTP" NO son controles de la UI: se listan aparte.
//
// Salida: .logs/qa/canonical.json  +  resumen por consola.
// ============================================================

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const OUT = ".logs/qa";

// Orden de prioridad: lo que está más a la derecha pisa a lo que está a la izquierda.
// Los dos primeros son mediciones ANTERIORES al commit 12c96e1 y sólo se
// conservan como registro histórico: el informe los cita a mano, no en la tabla
// canónica (que debe describir el árbol congelado).
const PRIORITY = [
  "results-switch-pre", // (histórico) cambio de canción antes del fix
  "results-library-pre", // (histórico) biblioteca antes del fix
  "results-switch", // cambio de canción
  "results-library", // biblioteca
  "results-warmup", // primera medición del arranque
  "results-karsilence", // diagnóstico del .kar
  "results-sustain", // sustain medido en detalle
  "results-barrows2", // casos ambiguos de la barra
  "results-cardclick", // clicks de tarjeta dirigidos por título
  "results-bar", // barra completa
  "results-studio", // studio completo
  "results-pausefix", // pausa verificada
  "results-prev2", // "anterior" en el índice 0
  "results-cola", // consecuencia de la cola acumulada
  "results-pill", // píldora con MutationObserver
  "results-startup", // arranque en frío (tres columnas)
  "results-postfreeze", // verificación sobre el árbol congelado
];

const NO_ES_CONTROL =
  /^(Diagnóstico|Debug|Probe|Control de sanidad|Recursos HTTP|Errores de consola|Pestaña "Música — tu reproductor": la biblioteca)/i;

/**
 * Corte temporal: el commit 12c96e1 ("la barra sigue la canción cargada y su
 * play/pausa funciona") entró a las 20:41:37 del 2026-10-12. Todo lo medido
 * antes describe código que ya no existe; se etiqueta para no mezclarlo.
 */
const CORTE_12c96e1 = new Date("2026-10-12T20:41:37-05:00").getTime();

const files = readdirSync(OUT).filter(
  (f) => /^results-.*\.json$/.test(f) && f !== "results-bar-final.json" && f !== "results-pause.json" && f !== "results-pause2.json",
);
const rows = [];
for (const f of files) {
  const base = f.replace(/\.json$/, "");
  const rank = PRIORITY.indexOf(base);
  // Marca temporal = mtime del JSON: cuándo se escribió la medición.
  const marca = statSync(`${OUT}/${f}`).mtimeMs;
  let data;
  try {
    data = JSON.parse(readFileSync(`${OUT}/${f}`, "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(data)) continue;
  for (const r of data) {
    rows.push({
      ...r,
      _archivo: base,
      _rank: rank === -1 ? -1 : rank,
      _cuando: marca > CORTE_12c96e1 ? "posterior a 12c96e1" : "pre-12c96e1",
      _mtime: new Date(marca).toISOString().slice(11, 19),
    });
  }
}

/**
 * Filas SUPERADAS que no deben contar como controles de la tabla autoritativa.
 * Cada una tiene una razón verificable, no es una preferencia:
 *   • artefacto — la conclusión la produjo un fallo del arnés (click por
 *     coordenadas, ventana de muestreo dentro del arranque, posición por encima
 *     del umbral de reinicio) y ya está re-medida en otra fila.
 *   • pre-fix — describe código que el árbol congelado ya no tiene.
 */
const SUPERADAS = [
  { match: /^\(3\) Biblioteca: cambiar de canción con una segunda tarjeta/, tipo: "artefacto" },
  { match: /^Studio: reproducir una canción cargada por el input$/, tipo: "artefacto" },
  { match: /^Studio: tiempo hasta la primera señal audible en arranque EN FRÍO$/, tipo: "artefacto" },
  { match: /^\(4\) "Canción anterior" después de un cambio$/, tipo: "artefacto" },
  { match: /^D3 · La píldora de estado del audio durante el arranque$/, tipo: "artefacto" },
  { match: /^C2 · "Canción anterior" con la actual en el índice 0 y CON historial/, tipo: "artefacto" },
  { match: /^\(1\) Cambio A→B por el input del Studio/, tipo: "artefacto" },
  { match: /^\(1\) Cambio A→B: ¿reaparece el audio de A más tarde\?$/, tipo: "artefacto" },
  { match: /^Barra: "Canción anterior"/, tipo: "pre-fix" },
  { match: /^Barra: "Abrir <título>" \(vista de reproducción\)$/, tipo: "artefacto" },
  { match: /^Barra: input\[aria-label="Volumen"\]$/, tipo: "pre-fix" },
  { match: /^Barra: input\[aria-label="Volumen"\] — respuesta al teclado/, tipo: "pre-fix" },
  { match: /^Key FX: "Elegir color personalizado"/, tipo: "pre-fix" },
  { match: /^Navegación: "Partitura"$/, tipo: "artefacto" },
  { match: /^Pedales: input\[aria-label="Half-pedaling/, tipo: "pre-fix" },
  { match: /^Studio: "Reproducir" \(botón \.btn\.primary\)$/, tipo: "artefacto" },
  { match: /^Teclado \+ pedal: el Sustain alarga la nota pisada$/, tipo: "artefacto" },
  { match: /^Barra: "Pausar" \/ "Reproducir" \(botón central\)$/, tipo: "pre-fix" },
];
const esSuperada = (control) => SUPERADAS.find((s) => s.match.test(control)) ?? null;

const elegido = new Map();
for (const r of rows) {
  if (NO_ES_CONTROL.test(r.control)) continue;
  const prev = elegido.get(r.control);
  if (!prev || r._rank >= prev._rank) elegido.set(r.control, r);
}

const canonica = [...elegido.values()].sort((a, b) => a.control.localeCompare(b.control, "es"));
const extras = rows.filter((r) => NO_ES_CONTROL.test(r.control));

// La tabla AUTORITATIVA es la canónica menos las filas superadas.
const superadas = canonica
  .map((r) => ({ fila: r, motivo: esSuperada(r.control) }))
  .filter((x) => x.motivo)
  .map((x) => ({ control: x.fila.control, result: x.fila.result, cuando: x.fila._cuando, tipo: x.motivo.tipo, archivo: x.fila._archivo }));
const autoritativa = canonica.filter((r) => !esSuperada(r.control));

const cuenta = (arr) =>
  arr.reduce((a, r) => {
    a[r.result] = (a[r.result] ?? 0) + 1;
    return a;
  }, {});

console.log(`=== TABLA CANÓNICA (todas las mediciones): ${canonica.length} filas ===`);
canonica.forEach((r) => console.log(`  [${r.result.padEnd(14)}] (${r._cuando}) ${r.control}  (${r._archivo})`));
console.log(`\n=== filas de diagnóstico / no-control: ${extras.length} ===`);
extras.forEach((r) => console.log(`  [${r.result.padEnd(14)}] (${r._cuando}) ${r.control}  (${r._archivo})`));

console.log(`\n=== SUPERADAS (excluidas de la tabla autoritativa): ${superadas.length} ===`);
superadas.forEach((s) => console.log(`  [${s.tipo.padEnd(9)}] [${s.result.padEnd(14)}] ${s.control}`));

console.log(`\n=== TABLA AUTORITATIVA: ${autoritativa.length} controles ===`);
const cA = cuenta(autoritativa);
console.log(`RESUMEN AUTORITATIVO: ${JSON.stringify(cA)} · TOTAL=${autoritativa.length}`);
const porFechaA = autoritativa.reduce((a, r) => ((a[r._cuando] = (a[r._cuando] ?? 0) + 1), a), {});
console.log(`por fecha: ${JSON.stringify(porFechaA)}`);

writeFileSync(`${OUT}/canonical.json`, JSON.stringify({ autoritativa, superadas, canonicaCompleta: canonica, extras }, null, 2));
console.log(`\nescrito ${OUT}/canonical.json`);
