/**
 * gmLibrary — los nombres de instrumentos General MIDI y de dónde sale cada uno.
 *
 * LAS DOS PREGUNTAS QUE RESPONDE ESTE MÓDULO
 * ------------------------------------------
 *  1. **¿Cómo se llama el programa 14?** Los nombres estándar de los 128
 *     programas viven acá (`GM_STANDARD_NAMES`). Hacen falta completos porque un
 *     MIDI puede pedir cualquiera de los 128, y el selector del mezclador tiene
 *     que poder ofrecerlos.
 *
 *     Para los ~73 programas que el manifiesto del motor SÍ nombra
 *     (`WAF_NEEDED_PROGRAMS`), manda el nombre del motor: es el que
 *     `candidatesFor()` sabe resolver a un banco concreto (VSCO, FreePats,
 *     tonejs, WebAudioFont). Los ~55 restantes van con el nombre estándar, que la
 *     red de seguridad del soundfont GM de gleitz cubre igual porque
 *     `instrumentToSoundfont()` resuelve por nombre.
 *
 *  2. **¿De dónde sale el sample?** Se le pregunta al motor, no se adivina:
 *     `sourceKindFor()` devuelve la primera fuente de la cadena real de
 *     `candidatesFor()` (con su failover), o "sin fuente real" si no hay ninguna.
 *     Es un dato honesto, no una promesa.
 */

import { candidatesFor } from "@engine/instrumentSources";
import { WAF_NEEDED_PROGRAMS } from "@engine/wafManifest";

/**
 * Nombres estándar de los 128 programas General MIDI, en orden (0..127).
 *
 * Los que el manifiesto del motor ya usaba están escritos EXACTAMENTE como él los
 * declara ("Electric Bass (finger)", "String Ensemble 1"), para que el nombre que
 * elige el usuario sea el que el motor ya sabe resolver.
 */
export const GM_STANDARD_NAMES: readonly string[] = [
  "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
  "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavi",
  "Celesta", "Glockenspiel", "Music Box", "Vibraphone",
  "Marimba", "Xylophone", "Tubular Bells", "Dulcimer",
  "Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ",
  "Reed Organ", "Accordion", "Harmonica", "Tango Accordion",
  "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)",
  "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar Harmonics",
  "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass",
  "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2",
  "Violin", "Viola", "Cello", "Contrabass",
  "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani",
  "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
  "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit",
  "Trumpet", "Trombone", "Tuba", "Muted Trumpet",
  "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2",
  "Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax",
  "Oboe", "English Horn", "Bassoon", "Clarinet",
  "Piccolo", "Flute", "Recorder", "Pan Flute",
  "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina",
  "Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)",
  "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)",
  "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)",
  "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
  "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)",
  "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)",
  "Sitar", "Banjo", "Shamisen", "Koto",
  "Kalimba", "Bagpipe", "Fiddle", "Shanai",
  "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock",
  "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal",
  "Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet",
  "Telephone Ring", "Helicopter", "Applause", "Gunshot",
];

/** Programa → nombre, tal como lo declara el manifiesto del motor. */
const ENGINE_NAME_BY_PROGRAM = new Map<number, string>(
  Object.entries(WAF_NEEDED_PROGRAMS).map(([program, name]) => [Number(program), name]),
);

/**
 * Programa (0..127) → nombre ofrecido en el selector del mezclador.
 *
 * Manda el nombre del motor cuando existe; si no, el estándar.
 */
export const GM_PROGRAM_NAMES: readonly string[] = GM_STANDARD_NAMES.map(
  (standard, program) => ENGINE_NAME_BY_PROGRAM.get(program) ?? standard,
);

/** Nombre → número de programa. */
export const GM_PROGRAM_BY_NAME: ReadonlyMap<string, number> = new Map(
  GM_PROGRAM_NAMES.map((name, program) => [name, program]),
);

/** Los nombres que ofrece el selector (sin repetidos). */
export const GM_SELECTABLE: readonly string[] = [...new Set(GM_PROGRAM_NAMES)];

/**
 * De dónde va a salir el sample de este instrumento.
 *
 * Es la primera fuente de la cadena de `candidatesFor()`: el banco de mayor
 * prioridad con grabación real para ese nombre. El piano acústico es la excepción
 * conocida — lo toca el sampler Salamander del reproductor, no la capa de fuentes
 * (igual que en el piano).
 */
export function sourceKindFor(instrument: string): string {
  const candidates = candidatesFor(instrument);
  if (candidates.length === 0) return "sin fuente real";
  return candidates[0].label;
}

/** ¿La capa de fuentes tiene alguna grabación real para este instrumento? */
export function hasRealSource(instrument: string): boolean {
  return candidatesFor(instrument).length > 0;
}
