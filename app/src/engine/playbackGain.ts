/**
 * playbackGain — cuánta GANANCIA recibe una nota de un archivo MIDI.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * ──────────────────────────
 * Al reproducir una canción, el motor tiraba (o mezclaba mal) tres cosas que el
 * propio archivo trae escritas:
 *
 *   1. **CC7 (Channel Volume)** — el nivel de mezcla que el autor le dio a cada
 *      pista. Se ignoraba por completo: todas las pistas entraban al mismo
 *      nivel aunque el archivo diga "las guitarras al 55 %, el piano al 94 %".
 *   2. **CC11 (Expression)** — la expresión continua (crescendos, fraseo, el
 *      swell de un violín). También se ignoraba.
 *   3. **El fader de pista** se multiplicaba por la *velocity*, y la velocity es
 *      lo que elige la CAPA de sample grabada (`LayeredSampler`). Bajar una
 *      pista no la bajaba: le cambiaba el timbre (entraba una toma más suave).
 *
 * Este módulo concentra la aritmética para que el resto del motor tenga una sola
 * regla: **la velocity intacta elige capa y timbre; la ganancia se aplica
 * después, en amplitud**. Todo son funciones puras: se pueden medir sin audio.
 *
 * LEY DE ESCALA
 * ─────────────
 * CC7 y CC11 siguen la ley que ya documenta `utils/velocity.ts` para el GM2:
 *
 *     dB = 40 · log₁₀(127 / v)   ≡   ganancia = (v / 127)²
 *
 * `@tonejs/midi` ya entrega el valor normalizado (v/127), así que la ley queda
 * `ganancia = valor²`. Es la misma convención que usan los sintetizadores GM y
 * la que hace que dos pistas con CC7 127 y 100 suenen a 0 dB y −4.1 dB, o sea
 * la mezcla que el autor escribió.
 *
 * Sólo se aplica si el archivo trae el control: sin CC7/CC11 la ganancia es 1
 * (exactamente el comportamiento anterior, sin tocar el nivel de nada).
 *
 * ESTADO ACTUAL: DOS DE LOS TRES PUNTOS ESTÁN APAGADOS POR CONSTANTE
 * ──────────────────────────────────────────────────────────────────
 * El dueño escuchó el cambio de los puntos 1 y 2 y no le gustó: pidió volver al
 * balance que había aprobado ("que suene como originalmente al MIDI"). Los dos
 * quedaron DETRÁS DE UNA CONSTANTE —no borrados— para poder reactivarlos sin
 * reescribir una línea:
 *
 *   • `APPLY_MIDI_CONTROLS = false` → CC7 y CC11 se siguen PARSEANDO y viajando
 *     por nota (`SongNote.volume` / `SongNote.expression`), pero no tocan la
 *     ganancia: `ccToGain` devuelve 1 y la única atenuación es el fader.
 *   • `VELOCITY_GAMMA = 1` → la velocity vuelve a entrar LINEAL, que es lo que
 *     hacía el motor cuando se la pasaba tal cual a `Tone.Sampler`.
 *
 * LO QUE QUEDA EN PIE (era el punto 3 y es un arreglo, no una preferencia): el
 * fader de pista entra como GANANCIA y no como velocity, así que bajarlo baja el
 * volumen en vez de cambiar la toma grabada. Y la humanización ±0.5 dB sigue
 * aplicándose a la ganancia, donde no puede cruzar un umbral de capa.
 *
 * El motivo del revert, medido sobre `Bolero_-_Besame_Mucho.kar` (4359 notas,
 * velocity media 105.7/127, CC7 en 8 de sus 12 pistas): la curva γ = 1.35 sola
 * bajaba el promedio 0.56 dB y el CC7 del archivo bajaba esas 8 pistas entre
 * 0.5 y 2.1 dB más. Con las dos constantes como están ahora, la ganancia de cada
 * nota es idéntica a la que da un archivo sin CC7/CC11.
 */

/** Techo del rango útil (una nota no puede sonar más fuerte que "velocity 1"). */
const MAX_GAIN = 1;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Exponente de la curva velocity → ganancia.
 *
 * HOY VALE 1: la velocity entra LINEAL. A γ = 1, `velocityToGain(v) = v`, o sea
 * exactamente lo que hacía el motor antes de `a0d03de`, cuando la velocity se le
 * pasaba tal cual a `Tone.Sampler` y el sampler la usaba como ganancia. La
 * función sigue existiendo (y las voces siguen llamándola) para que reactivar la
 * curva sea cambiar este número y nada más.
 *
 * POR QUÉ SE REVIRTIÓ (era 1.35)
 * ──────────────────────────────
 * γ = 1.35 abría la dinámica —a velocity 0.5 daba 0.392 (−8.1 dB) en vez de 0.5
 * (−6 dB)— y con eso movía el balance de TODA la mezcla respecto del que el
 * dueño había aprobado: sobre `Bolero_-_Besame_Mucho.kar` baja el promedio
 * 0.56 dB, y bastante más en material con velocities bajas (con velocity 60/127
 * son −1.9 dB). A γ = 1 no hay corrimiento de nivel en ninguna nota.
 *
 * La ganancia nunca supera 1 (`MAX_GAIN`): la curva sólo puede atenuar, así que
 * ni con 1.35 ni con 1 hay riesgo de clipping en el bus maestro.
 */
export const VELOCITY_GAMMA = 1;

/**
 * Interruptor de los controles continuos del archivo (CC7 y CC11).
 *
 * `false` = el motor los IGNORA para el nivel: `ccToGain` devuelve 1 y la
 * ganancia de una nota queda sólo en el fader de pista. El dato se sigue
 * leyendo —el parser lo guarda en `SongNote.volume` / `SongNote.expression` y
 * viaja por nota hasta acá—, simplemente no se aplica. Eso es lo que hace
 * verificable que el parseo quedó intacto (ver `scripts/qa-groove.mjs`).
 *
 * POR QUÉ ESTÁ APAGADO
 * ────────────────────
 * Con los controles activos, el nivel de cada pista lo fijaba el archivo y el
 * balance dejaba de ser el aprobado: en `Bolero_-_Besame_Mucho.kar` el CC7
 * bajaba 8 de las 12 pistas entre 0.5 y 2.1 dB, y en el fixture de QA de
 * `qa-groove.mjs` hasta −11.9 dB. El pedido fue que suene "como originalmente al
 * MIDI" SIN perder la capacidad: por eso es una constante y no un borrado.
 *
 * Encenderlo (ponerlo en `true`) restaura la ley del GM2 tal cual estaba en
 * `a0d03de`, sin tocar ninguna otra línea.
 *
 * La anotación `: boolean` es deliberada: sin ella TypeScript estrecha el tipo a
 * `false` y el `if` de abajo queda marcado como código inalcanzable.
 */
export const APPLY_MIDI_CONTROLS: boolean = false;

/** Ganancia de amplitud de una velocity 0..1 (hoy, γ = 1: la identidad). */
export function velocityToGain(velocity: number): number {
  const v = clamp01(velocity);
  if (v <= 0) return 0;
  return Math.min(MAX_GAIN, Math.pow(v, VELOCITY_GAMMA));
}

/**
 * Ganancia de un control continuo 0..1 (CC7 o CC11) con la ley del GM2.
 *
 * `undefined` = el archivo no trae ese control ⇒ ganancia 1 (neutra). Es lo que
 * garantiza que una canción sin CC7/CC11 suene EXACTAMENTE como antes.
 *
 * Y mientras `APPLY_MIDI_CONTROLS` sea `false`, la ganancia es 1 SIEMPRE, traiga
 * o no el control: el dato del archivo se conserva, pero no se escucha.
 */
export function ccToGain(value: number | undefined): number {
  if (!APPLY_MIDI_CONTROLS) return 1;
  if (value === undefined) return 1;
  const v = clamp01(value);
  return v * v;
}

export interface NoteGainInput {
  /**
   * CC7 del canal en el instante de la nota (0..1). `undefined` = no hay.
   *
   * Se sigue pasando aunque hoy no se aplique (`APPLY_MIDI_CONTROLS = false`):
   * es el dato del archivo y es lo que deja reactivar la fidelidad sin tocar a
   * ningún llamador.
   */
  volume?: number;
  /** CC11 (Expression) del canal en el instante de la nota (0..1). */
  expression?: number;
  /** Posición del fader de la pista (ganancia lineal, 1 = sin atenuar). */
  fader?: number;
}

/**
 * Ganancia EXTERNA de una nota: fader de pista × CC7 × CC11.
 *
 * Con `APPLY_MIDI_CONTROLS = false` los dos términos de CC valen 1, así que hoy
 * esta función devuelve el FADER: es el único nivel que el motor aplica además
 * de la velocity. El arreglo del fader queda intacto (baja el volumen, no cambia
 * la toma), que era el objetivo de tener la ganancia separada de la velocity.
 *
 * No incluye la curva de velocity a propósito: esa la aplica cada voz
 * (`velocityToGain`) porque las voces con capas necesitan la velocity cruda
 * para elegir la toma. Así la misma nota puede cambiar de nivel sin cambiar de
 * timbre.
 */
export function noteOutGain(input: NoteGainInput): number {
  const fader = input.fader === undefined ? 1 : Math.max(0, input.fader);
  return fader * ccToGain(input.volume) * ccToGain(input.expression);
}
