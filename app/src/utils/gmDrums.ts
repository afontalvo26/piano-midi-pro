/**
 * gmDrums — mapa de percusión General MIDI (canal 10).
 *
 * Por qué existe: los .kar de vallenato, bolero y tropical traen la batería y
 * la percusión latina en el canal 10, y el reproductor **descartaba esa pista
 * entera** al parsear. Medido sobre la biblioteca: 35 de 40 archivos tropicales
 * traen canal 10, y lo que más suena ahí son maracas, congas, bongos, güiro,
 * cabasa, claves, agogo y timbales — o sea, el ritmo del género. Sin eso, un
 * vallenato suena a piano con acompañamiento.
 *
 * Este mapa traduce nota MIDI → pieza de percusión, y dice con qué voz del
 * PercussionEngine se puede sintetizar cuando todavía no hay sample real.
 */

import type { PercussionVoice } from "../engine/InstrumentEngine";

export type DrumFamily =
  | "kick"
  | "snare"
  | "hat"
  | "tom"
  | "cymbal"
  | "latin"
  | "fx";

export interface GmDrumPiece {
  /** Nombre GM de la pieza. */
  name: string;
  family: DrumFamily;
  /** Voz del PercussionEngine (respaldo sintetizado). */
  voice: PercussionVoice;
  /**
   * Archivo de sample real (one-shot), relativo a `DRUM_SAMPLE_BASE`.
   * Se completa cuando el kit muestreado está disponible; si falta, la pieza
   * se sintetiza con `voice`.
   */
  sample?: string;
}

/** Piezas GM 27–87 (las que aparecen de verdad en los archivos). */
export const GM_DRUMS: Record<number, GmDrumPiece> = {
  27: { name: "High Q", family: "fx", voice: "claves" },
  28: { name: "Slap", family: "fx", voice: "snare" },
  29: { name: "Scratch Push", family: "fx", voice: "guiro" },
  30: { name: "Scratch Pull", family: "fx", voice: "guiro" },
  31: { name: "Sticks", family: "fx", voice: "claves" },
  32: { name: "Square Click", family: "fx", voice: "claves" },
  33: { name: "Metronome Click", family: "fx", voice: "claves" },
  34: { name: "Metronome Bell", family: "fx", voice: "cowbell" },
  35: { name: "Bombo acústico", family: "kick", voice: "kick" },
  36: { name: "Bombo 1", family: "kick", voice: "kick" },
  37: { name: "Side Stick", family: "snare", voice: "snare" },
  38: { name: "Redoblante", family: "snare", voice: "snare" },
  39: { name: "Palmas", family: "snare", voice: "snare" },
  40: { name: "Redoblante eléctrico", family: "snare", voice: "snare" },
  41: { name: "Tom grave", family: "tom", voice: "tom-low" },
  42: { name: "Hi-hat cerrado", family: "hat", voice: "hihat-closed" },
  43: { name: "Tom piso alto", family: "tom", voice: "tom-mid" },
  44: { name: "Hi-hat con pedal", family: "hat", voice: "hihat-closed" },
  45: { name: "Tom bajo", family: "tom", voice: "tom-low" },
  46: { name: "Hi-hat abierto", family: "hat", voice: "hihat-open" },
  47: { name: "Tom medio-bajo", family: "tom", voice: "tom-mid" },
  48: { name: "Tom medio-alto", family: "tom", voice: "tom-high" },
  49: { name: "Crash 1", family: "cymbal", voice: "crash" },
  50: { name: "Tom alto", family: "tom", voice: "tom-high" },
  51: { name: "Ride 1", family: "cymbal", voice: "ride" },
  52: { name: "China", family: "cymbal", voice: "crash" },
  53: { name: "Campana de ride", family: "cymbal", voice: "ride" },
  54: { name: "Pandereta", family: "latin", voice: "shaker" },
  55: { name: "Splash", family: "cymbal", voice: "crash" },
  56: { name: "Cowbell", family: "latin", voice: "cowbell" },
  57: { name: "Crash 2", family: "cymbal", voice: "crash" },
  58: { name: "Vibraslap", family: "latin", voice: "guiro" },
  59: { name: "Ride 2", family: "cymbal", voice: "ride" },
  60: { name: "Bongó alto", family: "latin", voice: "bongo-high" },
  61: { name: "Bongó bajo", family: "latin", voice: "bongo-low" },
  62: { name: "Conga alta (apagada)", family: "latin", voice: "conga-high" },
  63: { name: "Conga alta (abierta)", family: "latin", voice: "conga-high" },
  64: { name: "Conga baja", family: "latin", voice: "conga-low" },
  65: { name: "Timbale alto", family: "latin", voice: "timbale-high" },
  66: { name: "Timbale bajo", family: "latin", voice: "timbale-low" },
  67: { name: "Agogo alto", family: "latin", voice: "cowbell" },
  68: { name: "Agogo bajo", family: "latin", voice: "cowbell" },
  69: { name: "Cabasa", family: "latin", voice: "maracas" },
  70: { name: "Maracas", family: "latin", voice: "maracas" },
  71: { name: "Silbato corto", family: "fx", voice: "shaker" },
  72: { name: "Silbato largo", family: "fx", voice: "shaker" },
  73: { name: "Güiro corto", family: "latin", voice: "guiro" },
  74: { name: "Güiro largo", family: "latin", voice: "guiro" },
  75: { name: "Claves", family: "latin", voice: "claves" },
  76: { name: "Caja china (aguda)", family: "latin", voice: "claves" },
  77: { name: "Caja china (grave)", family: "latin", voice: "claves" },
  78: { name: "Cuica apagada", family: "fx", voice: "tom-mid" },
  79: { name: "Cuica abierta", family: "fx", voice: "tom-mid" },
  80: { name: "Triángulo apagado", family: "latin", voice: "cowbell" },
  81: { name: "Triángulo abierto", family: "latin", voice: "cowbell" },
  82: { name: "Shaker", family: "latin", voice: "shaker" },
  83: { name: "Jingle Bell", family: "latin", voice: "shaker" },
  84: { name: "Campana de trineo", family: "latin", voice: "shaker" },
  85: { name: "Castanets", family: "latin", voice: "claves" },
  86: { name: "Surdo apagado", family: "latin", voice: "tom-low" },
  87: { name: "Surdo abierto", family: "latin", voice: "tom-low" },
};

/** ¿El nombre de pista corresponde a un kit de percusión? */
export function isDrumKitName(instrument: string): boolean {
  const l = instrument.toLowerCase();
  return (
    l.includes("drum") ||
    l.includes("kit") ||
    l.includes("percusi") ||
    l.includes("percussion") ||
    l.includes("batería") ||
    l.includes("bateria") ||
    l.startsWith("gm drums") ||
    l.includes("standard kit")
  );
}

export function drumPiece(note: number): GmDrumPiece {
  return (
    GM_DRUMS[note] ?? { name: `Percusión ${note}`, family: "fx", voice: "claves" }
  );
}
