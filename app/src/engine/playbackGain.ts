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
 * γ = 1.35 y no 1 (lineal) por dos razones:
 *
 *  • **Musical**: con ganancia lineal, la dinámica percibida queda aplastada
 *    (MIDI 40 a 127 son sólo 10 dB). Un sampler real abre más el rango: a
 *    velocity 0.5 la curva entrega 0.39 (−8.1 dB) en vez de 0.5 (−6 dB), así
 *    que un *piano* se aleja de un *mezzo-forte* como en un instrumento de
 *    verdad. La velocidad que elige la CAPA sigue siendo la del archivo: la
 *    curva sólo ajusta el nivel dentro de esa capa.
 *
 *  • **Coherencia con el proyecto**: es exactamente la curva que
 *    `DrumKitEngine.ts` ya venía usando para la percusión, con el mismo
 *    argumento ("con samples de una sola capa, que la dinámica sea marcada en
 *    vez de lineal"). Se eligió γ = 1.35 y no el γ = 2 que pide la especificación
 *    GM2 para *channel volume* porque γ = 2 sobre material real (velocities
 *    típicas 60–100) baja el promedio ~5 dB y deja los pasajes suaves casi
 *    inaudibles; 1.35 expande la dinámica sin cambiar el nivel de la mezcla.
 *
 * La ganancia nunca supera 1: la curva sólo puede atenuar, así que no agrega
 * riesgo de clipping en el bus maestro.
 */
export const VELOCITY_GAMMA = 1.35;

/** Ganancia de amplitud de una velocity 0..1 (curva γ = 1.35). */
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
 */
export function ccToGain(value: number | undefined): number {
  if (value === undefined) return 1;
  const v = clamp01(value);
  return v * v;
}

export interface NoteGainInput {
  /** CC7 del canal en el instante de la nota (0..1). `undefined` = no hay. */
  volume?: number;
  /** CC11 del canal en el instante de la nota (0..1). `undefined` = no hay. */
  expression?: number;
  /** Posición del fader de la pista (ganancia lineal, 1 = sin atenuar). */
  fader?: number;
}

/**
 * Ganancia EXTERNA de una nota: fader de pista × CC7 × CC11.
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
