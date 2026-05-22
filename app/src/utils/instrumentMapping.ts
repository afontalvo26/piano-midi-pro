/**
 * Instrument Mapping Utilities
 *
 * Pure helpers used by the studio playback engine to translate generic
 * GM / track metadata into specific synth presets and instrument names.
 * Extracted from App.tsx so non-React code can reuse the same logic.
 */

export type SynthOscillatorType = "triangle" | "sine" | "sawtooth";

export interface SynthEnvelopeSettings {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface InstrumentSynthSettings {
  oscillator: { type: SynthOscillatorType };
  envelope: SynthEnvelopeSettings;
}

/**
 * Returns a Tone.js-compatible synth preset (oscillator + envelope) tuned
 * to roughly match the timbral family of the requested instrument name.
 */
export function getInstrumentSynthSettings(
  instrumentName: string,
): InstrumentSynthSettings {
  const name = instrumentName.toLowerCase();
  if (
    name.includes("piano") ||
    name.includes("clav") ||
    name.includes("harpsi")
  ) {
    return {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.3 },
    };
  } else if (
    name.includes("string") ||
    name.includes("choir") ||
    name.includes("pad")
  ) {
    return {
      oscillator: { type: "sine" },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 0.8 },
    };
  } else if (
    name.includes("organ") ||
    name.includes("accordion") ||
    name.includes("reed")
  ) {
    return {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.06, decay: 0.1, sustain: 0.9, release: 0.1 },
    };
  } else if (name.includes("guitar") || name.includes("bass")) {
    return {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.35 },
    };
  } else if (
    name.includes("flute") ||
    name.includes("whistle") ||
    name.includes("recorder") ||
    name.includes("pipe") ||
    name.includes("oboe")
  ) {
    return {
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.15 },
    };
  } else {
    return {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.25 },
    };
  }
}

/**
 * Map a GM program number (0-127) — optionally hinted by a track name —
 * to the closest matching INSTRUMENT_FAMILIES entry.
 */
export function gmProgramToInstrument(
  programNumber: number,
  trackName?: string,
): string {
  // ── Track name hints take priority over program number ──
  const name = (trackName || "").toLowerCase();
  // Percussion channel (10) — filtered out by caller, but safety
  if (name.match(/drum|perc|kit|beat/)) return "Acoustic Grand Piano";
  // Brass
  if (name.match(/muted trumpet/)) return "Muted Trumpet";
  if (name.match(/trumpet|trpt|tpt/)) return "Trumpet";
  if (name.match(/trombone|tbn|trb/)) return "Trombone";
  if (name.match(/french horn|frenchhorn|fr horn/)) return "French Horn";
  if (name.match(/tuba/)) return "Tuba";
  if (name.match(/brass section|brass/)) return "Brass Section";
  // Woodwinds
  if (name.match(/soprano sax/)) return "Soprano Sax";
  if (name.match(/alto sax/)) return "Alto Sax";
  if (name.match(/tenor sax/)) return "Tenor Sax";
  if (name.match(/baritone sax|bari sax/)) return "Baritone Sax";
  if (name.match(/sax|saxophone/)) return "Alto Sax"; // default sax
  // Woodwinds salsa
  if (name.match(/flauta|flute/)) return "Flute";
  if (name.match(/clarinet/)) return "Clarinet";
  // Strings salsa
  if (name.match(/violin/)) return "Violin";
  if (name.match(/guitar|guitarra/)) return "Acoustic Guitar (nylon)";
  if (name.match(/bass|bajo/) && !name.match(/bassoon/)) return "Acoustic Bass";
  if (name.match(/oboe/)) return "Oboe";
  if (name.match(/english horn/)) return "English Horn";
  if (name.match(/bassoon/)) return "Bassoon";
  if (name.match(/clarinet|clt/)) return "Clarinet";
  if (name.match(/piccolo/)) return "Piccolo";
  if (name.match(/flute|flt/)) return "Flute";
  if (name.match(/recorder/)) return "Recorder";
  if (name.match(/pan flute|panflute/)) return "Pan Flute";
  if (name.match(/shakuhachi/)) return "Shakuhachi";
  if (name.match(/whistle/)) return "Whistle";
  if (name.match(/ocarina/)) return "Ocarina";
  // Strings
  if (name.match(/violin|vln/)) return "Violin";
  if (name.match(/viola|vla/)) return "Viola";
  if (name.match(/cello|vcl/)) return "Cello";
  if (name.match(/contrabass|double bass/)) return "Contrabass";
  if (name.match(/pizzicato|pizz/)) return "Pizzicato Strings";
  if (name.match(/tremolo str/)) return "Tremolo Strings";
  if (name.match(/harp/)) return "Orchestral Harp";
  if (name.match(/string ensemble|strings/)) return "String Ensemble 1";
  // Synth strings / choir / pads
  if (name.match(/synth strings/i)) return "Synth Strings 1";
  if (name.match(/choir|voice|vocal|aahs|oohs/)) return "Choir Aahs";
  if (name.match(/synth choir/)) return "Synth Choir";
  if (name.match(/orchestra hit/)) return "Orchestra Hit";
  if (name.match(/pad/i)) return "Pad 2 (warm)";
  // Bass
  if (name.match(/acoustic bass|stand.?up bass/)) return "Acoustic Bass";
  if (name.match(/electric bass.*finger|finger.*bass/))
    return "Electric Bass (finger)";
  if (name.match(/electric bass.*pick|pick.*bass/))
    return "Electric Bass (pick)";
  if (name.match(/fretless bass/)) return "Fretless Bass";
  if (name.match(/slap bass 1/)) return "Slap Bass 1";
  if (name.match(/slap bass 2/)) return "Slap Bass 2";
  if (name.match(/synth bass 1/)) return "Synth Bass 1";
  if (name.match(/synth bass 2/)) return "Synth Bass 2";
  if (name.match(/bass(?!oon)/)) return "Acoustic Bass"; // default bass
  // Guitar
  if (name.match(/acoustic guitar.*nylon|nylon/))
    return "Acoustic Guitar (nylon)";
  if (name.match(/acoustic guitar.*steel|steel/))
    return "Acoustic Guitar (steel)";
  if (name.match(/electric guitar.*jazz|jazz/)) return "Electric Guitar (jazz)";
  if (name.match(/electric guitar.*clean|clean/))
    return "Electric Guitar (clean)";
  if (name.match(/electric guitar.*muted|muted/))
    return "Electric Guitar (muted)";
  if (name.match(/overdriven|overdrive/)) return "Overdriven Guitar";
  if (name.match(/distortion guitar|distortion/)) return "Distortion Guitar";
  if (name.match(/guitar harmonics/)) return "Guitar Harmonics";
  if (name.match(/guitar/)) return "Acoustic Guitar (nylon)"; // default guitar
  // Keys
  if (name.match(/organ/)) return "Drawbar Organ";
  if (name.match(/accordion/)) return "Accordion";
  if (name.match(/harmonica/)) return "Harmonica";
  if (name.match(/celesta/)) return "Celesta";
  if (name.match(/glockenspiel/)) return "Glockenspiel";
  if (name.match(/music box/)) return "Music Box";
  if (name.match(/vibraphone|vibes/)) return "Vibraphone";
  if (name.match(/marimba/)) return "Marimba";
  if (name.match(/xylophone/)) return "Xylophone";
  if (name.match(/piano|acoustic grand|grand piano/))
    return "Acoustic Grand Piano";
  // Percussion (melodic)
  if (name.match(/timpani/)) return "Timpani";
  if (name.match(/steel drum/)) return "Steel Drums";
  if (name.match(/woodblock/)) return "Woodblock";
  if (name.match(/taiko/)) return "Taiko Drum";
  if (name.match(/synth drum/)) return "Synth Drum";
  // Synth lead
  if (name.match(/lead/i)) return "Lead 2 (sawtooth)";
  // FX
  if (name.match(/soundtrack|fx/i)) return "FX 2 (soundtrack)";

  // ── Precise GM program-number mapping ──
  const p = programNumber ?? 0;
  const GM: Record<number, string> = {
    0: "Acoustic Grand Piano",
    1: "Bright Acoustic Piano",
    2: "Electric Grand Piano",
    3: "Honky-tonk Piano",
    4: "Electric Piano 1",
    5: "Electric Piano 2",
    6: "Harpsichord",
    7: "Clavinet",
    8: "Celesta",
    9: "Glockenspiel",
    10: "Music Box",
    11: "Vibraphone",
    12: "Marimba",
    13: "Xylophone",
    14: "Tubular Bells",
    15: "Dulcimer",
    16: "Drawbar Organ",
    17: "Percussive Organ",
    18: "Rock Organ",
    19: "Church Organ",
    20: "Reed Organ",
    21: "Accordion",
    22: "Harmonica",
    23: "Tango Accordion",
    24: "Acoustic Guitar (nylon)",
    25: "Acoustic Guitar (steel)",
    26: "Electric Guitar (jazz)",
    27: "Electric Guitar (clean)",
    28: "Electric Guitar (muted)",
    29: "Overdriven Guitar",
    30: "Distortion Guitar",
    31: "Guitar Harmonics",
    32: "Acoustic Bass",
    33: "Electric Bass (finger)",
    34: "Electric Bass (pick)",
    35: "Fretless Bass",
    36: "Slap Bass 1",
    37: "Slap Bass 2",
    38: "Synth Bass 1",
    39: "Synth Bass 2",
    40: "Violin",
    41: "Viola",
    42: "Cello",
    43: "Contrabass",
    44: "Tremolo Strings",
    45: "Pizzicato Strings",
    46: "Orchestral Harp",
    47: "Timpani",
    48: "String Ensemble 1",
    49: "String Ensemble 2",
    50: "Synth Strings 1",
    51: "Synth Strings 2",
    52: "Choir Aahs",
    53: "Voice Oohs",
    54: "Synth Choir",
    55: "Orchestra Hit",
    56: "Trumpet",
    57: "Trombone",
    58: "Tuba",
    59: "Muted Trumpet",
    60: "French Horn",
    61: "Brass Section",
    62: "Synth Brass 1",
    63: "Synth Brass 2",
    64: "Soprano Sax",
    65: "Alto Sax",
    66: "Tenor Sax",
    67: "Baritone Sax",
    68: "Oboe",
    69: "English Horn",
    70: "Bassoon",
    71: "Clarinet",
    72: "Piccolo",
    73: "Flute",
    74: "Recorder",
    75: "Pan Flute",
    76: "Blown Bottle",
    77: "Shakuhachi",
    78: "Whistle",
    79: "Ocarina",
    80: "Lead 1 (square)",
    81: "Lead 2 (sawtooth)",
    82: "Lead 3 (calliope)",
    83: "Lead 4 (chiff)",
    84: "Lead 5 (charang)",
    85: "Lead 6 (voice)",
    86: "Lead 7 (fifths)",
    87: "Lead 8 (bass + lead)",
    88: "Pad 1 (new age)",
    89: "Pad 2 (warm)",
    90: "Pad 3 (polysynth)",
    91: "Pad 4 (choir)",
    92: "Pad 5 (bowed)",
    93: "Pad 6 (metallic)",
    94: "Pad 7 (halo)",
    95: "Pad 8 (sweep)",
    96: "FX 1 (rain)",
    97: "FX 2 (soundtrack)",
    98: "FX 3 (crystal)",
    99: "FX 4 (atmosphere)",
    100: "FX 5 (brightness)",
    101: "FX 6 (goblins)",
    102: "FX 7 (echoes)",
    103: "FX 8 (sci-fi)",
    104: "Sitar",
    105: "Banjo",
    106: "Shamisen",
    107: "Koto",
    108: "Kalimba",
    109: "Bagpipe",
    110: "Fiddle",
    111: "Shanai",
    112: "Tinkle Bell",
    113: "Agogo",
    114: "Steel Drums",
    115: "Woodblock",
    116: "Taiko Drum",
    117: "Melodic Tom",
    118: "Synth Drum",
    119: "Reverse Cymbal",
    120: "Guitar Fret Noise",
    121: "Breath Noise",
    122: "Seashore",
    123: "Bird Tweet",
    124: "Telephone Ring",
    125: "Helicopter",
    126: "Applause",
    127: "Gunshot",
  };
  if (p in GM) return GM[p];
  return "Acoustic Grand Piano";
}
