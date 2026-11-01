/**
 * Audio / MIDI Utility Helpers
 *
 * Helpers compartidos por Studio y sus componentes MIDI.
 * Reexporta las funciones de color de `constants/ui.ts`.
 */

import { NOTE_NAMES } from "../constants/piano";
import { clamp, hexToRgba, lightenHex } from "../constants/ui";

export { clamp, hexToRgba, lightenHex };

/**
 * Convert a MIDI note number into a human-readable label like `C4` or `F#3`.
 */
export function midiToLabel(midi: number): string {
  const noteName = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

/**
 * Returns true when the given MIDI note maps to a black key on a piano.
 */
export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}
