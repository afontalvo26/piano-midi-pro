/**
 * midiControlChanges — metadatos del archivo MIDI que el reproductor tiene que
 * respetar: los controladores continuos (CC7 volumen, CC11 expresión) y el
 * compás.
 *
 * POR QUÉ
 * ───────
 * `@tonejs/midi` parsea los control changes pero el reproductor los tiraba a la
 * basura: CC7 (Channel Volume = nivel de mezcla de la pista) y CC11 (Expression
 * = crescendos y fraseo) son parte de lo que el autor ESCRIBIÓ en el archivo.
 * Ignorarlos es reproducir otra mezcla.
 *
 * Este módulo es puro y estructural (no importa `@tonejs/midi`) para poder
 * usarse igual desde el worker de parseo, desde el parser del hilo principal y
 * desde los tests.
 *
 * VALORES: `@tonejs/midi` entrega `ControlChange.value` ya normalizado 0..1
 * (dividido por 127), así que acá no se vuelve a escalar. La conversión a
 * ganancia (ley del GM2) vive en `engine/playbackGain.ts`.
 */

/** Lo mínimo que necesita un control change (compatible con `@tonejs/midi`). */
export interface ControlChangeLike {
  time: number;
  /** Valor normalizado 0..1. */
  value: number;
}

/** Mapa de control changes por número de controlador, como lo da la librería. */
export type ControlChangeMap = Record<number, ControlChangeLike[] | undefined>;

/**
 * Valor del controlador en el instante `time`.
 *
 * Regla: vale el ÚLTIMO evento en o antes de `time` (lo que un sintetizador
 * haría). Si la nota es anterior al primer evento de ese controlador, se usa el
 * primer valor del archivo — el autor escribió ese nivel para la pista, y
 * arrancar en el default de la especificación (CC7 = 100) para después saltar
 * al valor real produciría un escalón de nivel audible a mitad de la canción.
 *
 * Devuelve `undefined` cuando el archivo NO trae ese controlador: en ese caso el
 * motor no aplica nada y el nivel queda exactamente como estaba.
 */
export function sampleControlChange(
  events: ControlChangeLike[] | undefined,
  time: number,
): number | undefined {
  if (!events || events.length === 0) return undefined;
  // Búsqueda binaria del último evento con time <= t (los eventos vienen
  // ordenados por tiempo desde el parser).
  let lo = 0;
  let hi = events.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const event = events[mid];
    if (event && event.time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found >= 0) return events[found]?.value;
  // Antes del primer evento: se adopta el primero (ver arriba).
  return events[0]?.value;
}

/** Atajo: valor del controlador `cc` (7 = volumen, 11 = expresión) en `time`. */
export function controlValueAt(
  changes: ControlChangeMap | undefined,
  cc: number,
  time: number,
): number | undefined {
  if (!changes) return undefined;
  return sampleControlChange(changes[cc], time);
}

/** Lo mínimo de `MidiHeader` que hace falta para leer el compás. */
interface HeaderLike {
  timeSignatures?: { timeSignature: number[] }[];
}

/**
 * Compás del archivo como `[numerador, denominador]`, o `undefined` si el
 * archivo no lo declara.
 *
 * No es un adorno: la perilla "Groove" (engine/groove.ts) lo necesita para la
 * jerarquía métrica — mover un tiempo fuerte es muy distinto a mover un
 * contratiempo — y asumir 4/4 mediría mal un vals, un bambuco o un 6/8.
 */
export function timeSignatureOf(
  header: HeaderLike | undefined,
): [number, number] | undefined {
  const first = header?.timeSignatures?.[0]?.timeSignature;
  if (!first || first.length < 2) return undefined;
  const num = Number(first[0]);
  const den = Number(first[1]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num < 1 || den < 1) {
    return undefined;
  }
  return [Math.round(num), Math.round(den)];
}
