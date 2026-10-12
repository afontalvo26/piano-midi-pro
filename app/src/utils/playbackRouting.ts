/**
 * playbackRouting — decide qué fuente toca una nota.
 *
 * REGLA DE ORO (pedido explícito del dueño del proyecto): **nunca un
 * sintetizador**. Si el sample real todavía no está, la nota espera o se saltea
 * — jamás suena un oscilador. Antes esta política devolvía `synth` para los
 * instrumentos que estaban cargando y `engine` (motores de osciladores) para
 * los que no tenían soundfont: eso era, literalmente, el sonido electrónico que
 * el usuario rechazó.
 *
 * Estados posibles:
 *   - `piano-sampler`: piano acústico → sampler Salamander (grabación real).
 *   - `soundfont`    : el instrumento tiene su sample real cargado y listo.
 *   - `wait`         : hay fuente real, todavía está bajando → silencio.
 *   - `none`         : no hay fuente real para este nombre → silencio + aviso.
 */

import { getInstrumentType } from "../engine/InstrumentEngine";
import type { InstrumentStatus } from "../engine/instrumentSources";

export type PlaybackSource = "piano-sampler" | "soundfont" | "wait" | "none";

/**
 * ¿Este instrumento debe sonar con el sampler Salamander (piano acústico real)?
 *
 * Los pianos eléctricos (Rhodes/DX7), el piano eléctrico de cola, el clave y el
 * clavinet NO: tienen su propio sample en el soundfont.
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
  /** Estado del sample real de este instrumento. */
  samplerStatus: InstrumentStatus;
  /**
   * ¿El instrumento tiene un motor especializado disponible? Se mantiene en la
   * firma para no romper llamadores, pero YA NO se usa para decidir: los
   * motores de osciladores no se rutean nunca.
   */
  hasSpecializedEngine?: boolean;
}

export function choosePlaybackSource({
  instrument,
  trackIndex,
  isPianoSamplerActive,
  samplerStatus,
}: RoutingInput): PlaybackSource {
  // 1. Piano acústico / entrada en vivo → Salamander (grabación real).
  if (trackIndex === -1 || usesSalamanderPiano(instrument)) {
    return isPianoSamplerActive ? "piano-sampler" : "wait";
  }

  // 2. Sample real del instrumento.
  if (samplerStatus === "loaded") return "soundfont";
  if (samplerStatus === "loading") return "wait";

  // 3. No hay fuente real conocida para este nombre.
  //    `getInstrumentType` queda sólo como dato de diagnóstico en el log.
  if (getInstrumentType(instrument) !== "generic") {
    console.warn(
      `[ruteo] "${instrument}" no tiene sample real asignado (tipo ${getInstrumentType(instrument)}); se saltea la nota en vez de sintetizarla`,
    );
  }
  return "none";
}
