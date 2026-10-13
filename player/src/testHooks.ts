/**
 * testHooks — asa de control para las mediciones automáticas.
 *
 * POR QUÉ EXISTE
 * --------------
 * Las mediciones necesitan tres cosas que la UI no expone: si quedan voces
 * sonando (para probar que al cambiar de canción no queda audio de la anterior),
 * cuántas notas se saltearon por falta de sample y en qué estado está el
 * `AudioContext` (distingue "sin audio" de "audio pero silencio"). Hacerlo
 * adivinando por el DOM daría medidas dependientes del layout.
 *
 * SÓLO EN DESARROLLO: en el build de producción no publica nada, así que una app
 * publicada no gana ninguna superficie de control extra.
 *
 * OJO: esto NO es un atajo para manejar el reproductor. La reproducción se mide
 * pulsando la UI real (la tarjeta de Música, el botón de la barra); el asa sólo
 * LEE lo que el motor tiene.
 */

import type { PlayerEngineHost } from "./host/PlayerEngineHost";

/** Lo que las mediciones pueden leer del reproductor. */
export interface PlayerTestHandle {
  /** El motor: snapshot publicable, mezcla y diagnóstico. */
  host: PlayerEngineHost;
  /** Segundos escuchados, tal como los publica el reloj. */
  position: () => number;
  /** Voces sonando ahora mismo (pista → notas MIDI). */
  soundingVoices: () => Record<number, number[]>;
  /** Notas salteadas por falta de sample real listo. */
  skippedNotes: () => number;
  /** Estado del AudioContext: distingue "sin audio" de "sin notas". */
  audioState: () => { state: string; contextTime: number };
  /** Id de la canción que el motor tiene cargada. */
  loadedSongId: () => string | null;
  /** ¿El host CREE que debería estar sonando? (su intención, no el transporte). */
  intendsToPlay: () => boolean;
  /** Desglose del último arranque en frío, en ms medidos desde el `play()`. */
  startTimings: () => Record<string, number>;
  /** Posición vigente de la perilla Groove (0..1). */
  grooveAmount: () => number;
}

declare global {
  interface Window {
    __PLAYER__?: PlayerTestHandle;
  }
}

export function attachTestHandle(host: PlayerEngineHost): void {
  if (!import.meta.env.DEV) return;

  window.__PLAYER__ = {
    host,
    position: () => host.positionRef.current,
    soundingVoices: () => host.soundingVoices(),
    skippedNotes: () => host.skippedNoteCount,
    audioState: () => host.audioState(),
    loadedSongId: () => host.getSnapshot().songId,
    intendsToPlay: () => host.intendsToPlay,
    startTimings: () => host.startTimings(),
    grooveAmount: () => host.groove,
  };
}
