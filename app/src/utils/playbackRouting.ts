/**
 * playbackRouting — decide qué motor toca una nota.
 *
 * Estaba inline en `triggerAttack` y el orden era el problema: los motores de
 * síntesis iban ANTES del soundfont, así que cualquier nombre con "bass" o
 * "guitar" se lo quedaba el StringEngine (un sawtooth con arco) y el sample
 * real nunca sonaba. Sacarlo acá deja la política en un solo lugar, testeable
 * y a salvo de que alguien vuelva a invertirla sin darse cuenta.
 *
 * Reglas, en orden:
 *   1. Entrada en vivo o un piano acústico → sampler Salamander (el piano real).
 *   2. El instrumento tiene soundfont cargado → ese sample real.
 *   3. El soundfont está bajando → sintetizador neutro (no el motor: sonaría
 *      a oscilador justo en los primeros compases, que es cuando el oído juzga).
 *   4. No hay soundfont (percusión latina, nombres raros) o falló → motor
 *      especializado si aporta articulación; si no, sintetizador.
 */

import { getInstrumentType } from "../engine/InstrumentEngine";
import type { SamplerStatus } from "../engine/GMSamplerEngine";

export type PlaybackSource = "piano-sampler" | "soundfont" | "engine" | "synth";

/**
 * ¿Este instrumento debe sonar con el sampler Salamander (piano acústico real)?
 *
 * Los pianos eléctricos (Rhodes/DX7), el piano eléctrico de cola, el clave y el
 * clavinet NO: tienen su propio sample en el soundfont y antes sonaban todos
 * como un piano acústico — la razón por la que media biblioteca sonaba a piano.
 */
export function usesSalamanderPiano(instrument: string): boolean {
  const l = instrument.toLowerCase();
  if (
    l.includes("electric piano") ||
    l.includes("electric grand") ||
    l.includes("harpsichord") ||
    l.includes("clavinet")
  ) {
    return false;
  }
  return l.includes("piano");
}

export interface RoutingInput {
  instrument: string;
  /** -1 = entrada en vivo (teclado / controlador MIDI), sin pista. */
  trackIndex: number;
  /** ¿Terminó de cargar el sampler Salamander? */
  isPianoSamplerActive: boolean;
  /** Estado del soundfont GM de este instrumento. */
  samplerStatus: SamplerStatus;
}

export function choosePlaybackSource({
  instrument,
  trackIndex,
  isPianoSamplerActive,
  samplerStatus,
}: RoutingInput): PlaybackSource {
  // 1. Piano acústico / entrada en vivo.
  if (trackIndex === -1 || usesSalamanderPiano(instrument)) {
    return isPianoSamplerActive ? "piano-sampler" : "synth";
  }

  // 2. Sample real del instrumento.
  if (samplerStatus === "loaded") return "soundfont";

  // 3. Todavía bajando.
  if (samplerStatus === "loading") return "synth";

  // 4. Falló o no existe soundfont para este nombre.
  return getInstrumentType(instrument) === "generic" ? "synth" : "engine";
}
