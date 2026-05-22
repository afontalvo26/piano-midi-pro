/**
 * Piano and MIDI Constants
 * 
 * Contains all piano-related constants including MIDI ranges,
 * note names, and instrument families.
 */

// Piano MIDI Range
export const PIANO_MIN_MIDI = 21; // A0
export const PIANO_MAX_MIDI = 108; // C8
export const RANGE_KEY_COUNT = 37; // 37-key controller focus range
export const INITIAL_RANGE_START = 48; // C3 by default

// Note Names (Chromatic Scale)
export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

// General MIDI Instrument Families (GM Standard)
export const INSTRUMENT_FAMILIES = [
  // Piano (0-7)
  "Acoustic Grand Piano",
  "Bright Acoustic Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano 1",
  "Electric Piano 2",
  "Harpsichord",
  "Clavinet",
  
  // Chromatic Percussion (8-15)
  "Celesta",
  "Glockenspiel",
  "Music Box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bells",
  "Dulcimer",
  
  // Organ (16-23)
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church Organ",
  "Reed Organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  
  // Guitar (24-31)
  "Acoustic Guitar (nylon)",
  "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)",
  "Electric Guitar (clean)",
  "Electric Guitar (muted)",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar Harmonics",
  
  // Bass (32-39)
  "Acoustic Bass",
  "Electric Bass (finger)",
  "Electric Bass (pick)",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  
  // Strings (40-47)
  "Violin",
  "Viola",
  "Cello",
  "Contrabass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  
  // Ensemble (48-55)
  "String Ensemble 1",
  "String Ensemble 2",
  "Synth Strings 1",
  "Synth Strings 2",
  "Choir Aahs",
  "Voice Oohs",
  "Synth Choir",
  "Orchestra Hit",
  
  // Brass (56-63)
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French Horn",
  "Brass Section",
  "Synth Brass 1",
  "Synth Brass 2",
  
  // Reed (64-71)
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  
  // Pipe (72-79)
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  
  // Synth Lead (80-87)
  "Lead 1 (square)",
  "Lead 2 (sawtooth)",
  "Lead 3 (calliope)",
  "Lead 4 (chiff)",
  "Lead 5 (charang)",
  "Lead 6 (voice)",
  "Lead 7 (fifths)",
  "Lead 8 (bass + lead)",
  
  // Synth Pad (88-95)
  "Pad 1 (new age)",
  "Pad 2 (warm)",
  "Pad 3 (polysynth)",
  "Pad 4 (choir)",
  "Pad 5 (bowed)",
  "Pad 6 (metallic)",
  "Pad 7 (halo)",
  "Pad 8 (sweep)",
] as const;

// Helper function: Get note name from MIDI number
export function getMIDINoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const noteName = NOTE_NAMES[midi % 12];
  return `${noteName}${octave}`;
}

// Helper function: Get MIDI number from note name
export function getNoteMIDI(noteName: string): number | null {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return null;
  
  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteIndex = NOTE_NAMES.indexOf(note as typeof NOTE_NAMES[number]);
  
  if (noteIndex === -1) return null;
  return (octave + 1) * 12 + noteIndex;
}

// Helper function: Check if MIDI number is in piano range
export function isInPianoRange(midi: number): boolean {
  return midi >= PIANO_MIN_MIDI && midi <= PIANO_MAX_MIDI;
}

// Helper function: Clamp MIDI number to piano range
export function clampToPianoRange(midi: number): number {
  return Math.max(PIANO_MIN_MIDI, Math.min(PIANO_MAX_MIDI, midi));
}

// Made with Bob
