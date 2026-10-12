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
 *
 * Es solo el respaldo para los ~2 segundos en que el soundfont real todavía
 * está bajando (o si no hay red), así que el objetivo es que suene neutro y
 * corto, nunca estridente: el sawtooth pelado que había antes en el `else`
 * hacía que una armónica o un bajo sonaran a sirena de terror.
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
    name.includes("bass") &&
    !name.includes("bassoon") &&
    !name.includes("clarinet")
  ) {
    // Bajo: seno con decay medio. El triangle/sawtooth en el registro grave
    // genera el "growl" que el usuario describía como sonido de terror.
    return {
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.35, sustain: 0.5, release: 0.4 },
    };
  } else if (
    name.includes("string") ||
    name.includes("choir") ||
    name.includes("voice") ||
    name.includes("pad") ||
    name.includes("ensemble")
  ) {
    return {
      oscillator: { type: "sine" },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.8, release: 0.8 },
    };
  } else if (
    name.includes("organ") ||
    name.includes("accordion") ||
    name.includes("reed") ||
    name.includes("harmonica")
  ) {
    return {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.06, decay: 0.1, sustain: 0.9, release: 0.15 },
    };
  } else if (name.includes("guitar") || name.includes("banjo")) {
    return {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.35 },
    };
  } else if (
    name.includes("flute") ||
    name.includes("whistle") ||
    name.includes("recorder") ||
    name.includes("pipe") ||
    name.includes("oboe") ||
    name.includes("clarinet") ||
    name.includes("sax") ||
    name.includes("bassoon")
  ) {
    return {
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.15 },
    };
  } else if (
    name.includes("trumpet") ||
    name.includes("trombone") ||
    name.includes("tuba") ||
    name.includes("horn") ||
    name.includes("brass")
  ) {
    return {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.04, decay: 0.12, sustain: 0.8, release: 0.2 },
    };
  } else if (
    name.includes("marimba") ||
    name.includes("xylophone") ||
    name.includes("vibraphone") ||
    name.includes("glocken") ||
    name.includes("celesta") ||
    name.includes("bell") ||
    name.includes("timpani") ||
    name.includes("drum")
  ) {
    return {
      oscillator: { type: "sine" },
      envelope: { attack: 0.002, decay: 0.4, sustain: 0.05, release: 0.3 },
    };
  } else {
    // Desconocido: triangle suave, no sawtooth.
    return {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.03, decay: 0.2, sustain: 0.55, release: 0.3 },
    };
  }
}

/**
 * Map a GM program number (0-127) — optionally hinted by a track name —
 * to the closest matching INSTRUMENT_FAMILIES entry.
 *
 * ⚠️ El orden importa: cada familia tiene sus variantes específicas ANTES del
 * patrón genérico. Antes `/guitar/` y `/bass/` iban primero, así que
 * "Electric Bass (pick)", "Synth Bass 2" o "Electric Guitar (clean)" caían
 * todos al genérico (bajo acústico / guitarra de nylon) y las variantes de
 * abajo eran código muerto. Igual `/strings/` antes de `/synth strings/`.
 */
export function gmProgramToInstrument(
  programNumber: number,
  trackName?: string,
): string {
  const name = (trackName || "").toLowerCase();

  // ── Batería / percusión de canal 10 (el llamador ya la filtra) ──
  if (name.match(/drum|perc|kit|beat/)) return "Acoustic Grand Piano";

  // ── Metales ──
  if (name.match(/muted trumpet|mute.*trumpet/)) return "Muted Trumpet";
  if (name.match(/trumpet|trpt|tpt|trompeta/)) return "Trumpet";
  if (name.match(/trombone|trombón|tbn|trb/)) return "Trombone";
  if (name.match(/french horn|frenchhorn|fr horn|trompa/)) return "French Horn";
  if (name.match(/tuba/)) return "Tuba";
  if (name.match(/synth brass 1/)) return "Synth Brass 1";
  if (name.match(/synth brass 2/)) return "Synth Brass 2";
  if (name.match(/brass section|brass|metales/)) return "Brass Section";

  // ── Saxos ──
  if (name.match(/soprano sax/)) return "Soprano Sax";
  if (name.match(/alto sax/)) return "Alto Sax";
  if (name.match(/tenor sax/)) return "Tenor Sax";
  if (name.match(/baritone sax|bari sax/)) return "Baritone Sax";
  if (name.match(/sax|saxophone|saxofón/)) return "Alto Sax"; // default sax

  // ── Maderas ──
  if (name.match(/piccolo/)) return "Piccolo";
  if (name.match(/pan flute|panflute|zampoña/)) return "Pan Flute";
  if (name.match(/shakuhachi/)) return "Shakuhachi";
  if (name.match(/ocarina/)) return "Ocarina";
  if (name.match(/recorder|flauta dulce/)) return "Recorder";
  if (name.match(/whistle|silbato/)) return "Whistle";
  if (name.match(/flauta|flute|flt/)) return "Flute";
  if (name.match(/english horn|corno inglés/)) return "English Horn";
  if (name.match(/oboe/)) return "Oboe";
  if (name.match(/bassoon|fagot/)) return "Bassoon";
  if (name.match(/clarinet|clt|clarinete/)) return "Clarinet";

  // ── Teclados / cromáticos ──
  if (name.match(/electric piano 1|rhodes|e\.?piano 1/)) return "Electric Piano 1";
  if (name.match(/electric piano 2|dx7|e\.?piano 2/)) return "Electric Piano 2";
  if (name.match(/honky.?tonk/)) return "Honky-tonk Piano";
  if (name.match(/bright.*piano/)) return "Bright Acoustic Piano";
  if (name.match(/electric grand/)) return "Electric Grand Piano";
  if (name.match(/harpsichord|clave(cín|cin)|\bcembalo\b/)) return "Harpsichord";
  if (name.match(/clavinet|\bclav\b/)) return "Clavinet";
  if (name.match(/celesta/)) return "Celesta";
  if (name.match(/glockenspiel/)) return "Glockenspiel";
  if (name.match(/music box/)) return "Music Box";
  if (name.match(/vibraphone|vibes|vibráfono/)) return "Vibraphone";
  if (name.match(/marimba/)) return "Marimba";
  if (name.match(/xylophone|xilófono/)) return "Xylophone";
  if (name.match(/tubular bell|campanas? tubulares/)) return "Tubular Bells";
  if (name.match(/dulcimer/)) return "Dulcimer";
  if (name.match(/church organ|órgano de iglesia/)) return "Church Organ";
  if (name.match(/reed organ/)) return "Reed Organ";
  if (name.match(/percussive organ/)) return "Percussive Organ";
  if (name.match(/rock organ/)) return "Rock Organ";
  if (name.match(/organ|órgano/)) return "Drawbar Organ";
  if (name.match(/tango accordion/)) return "Tango Accordion";
  if (name.match(/accordion|acordeón|acordeon/)) return "Accordion";
  if (name.match(/harmonica|armónica|armonica/)) return "Harmonica";
  if (name.match(/piano|acoustic grand|grand piano/))
    return "Acoustic Grand Piano";

  // ── Bajos: variantes específicas primero, genérico al final ──
  if (name.match(/acoustic bass|stand.?up bass|contrabajo/)) return "Acoustic Bass";
  if (name.match(/fretless/)) return "Fretless Bass";
  if (name.match(/(electric bass|bass|bajo).*(finger|dedo)|finger.*bass/))
    return "Electric Bass (finger)";
  if (name.match(/(electric bass|bass|bajo).*(pick|púa|pua)|pick.*bass/))
    return "Electric Bass (pick)";
  if (name.match(/slap bass 1/)) return "Slap Bass 1";
  if (name.match(/slap bass 2|slap/)) return "Slap Bass 2";
  if (name.match(/synth bass 1/)) return "Synth Bass 1";
  if (name.match(/synth bass 2/)) return "Synth Bass 2";
  if (name.match(/bass(?!oon)/)) return "Acoustic Bass"; // default bass

  // ── Guitarras y cuerdas pulsadas: específicas primero ──
  if (name.match(/nylon|acoustic guitar.*nylon|guitarra.*nylon/))
    return "Acoustic Guitar (nylon)";
  if (name.match(/steel|acoustic guitar.*steel|guitarra.*acústica/))
    return "Acoustic Guitar (steel)";
  if (name.match(/jazz.*guitar|guitar.*jazz/)) return "Electric Guitar (jazz)";
  if (name.match(/clean.*guitar|guitar.*clean/)) return "Electric Guitar (clean)";
  if (name.match(/muted.*guitar|guitar.*muted/)) return "Electric Guitar (muted)";
  if (name.match(/overdriven|overdrive/)) return "Overdriven Guitar";
  if (name.match(/distortion/)) return "Distortion Guitar";
  if (name.match(/guitar harmonics/)) return "Guitar Harmonics";
  if (name.match(/guitar|guitarra/)) return "Acoustic Guitar (nylon)"; // default guitar
  if (name.match(/banjo/)) return "Banjo";
  if (name.match(/shamisen/)) return "Shamisen";
  if (name.match(/koto/)) return "Koto";
  if (name.match(/sitar/)) return "Sitar";
  if (name.match(/kalimba/)) return "Kalimba";
  if (name.match(/bagpipe|gaita/)) return "Bagpipe";
  if (name.match(/fiddle|violín campesino/)) return "Fiddle";
  if (name.match(/shanai/)) return "Shanai";

  // ── Cuerdas frotadas y ensembles ──
  if (name.match(/tremolo str/)) return "Tremolo Strings";
  if (name.match(/pizzicato|pizz/)) return "Pizzicato Strings";
  if (name.match(/orchestral harp|\bharp\b|\barpa\b/)) return "Orchestral Harp";
  if (name.match(/violin|vln|violín/)) return "Violin";
  if (name.match(/viola|vla/)) return "Viola";
  if (name.match(/cello|vcl|violonchelo/)) return "Cello";
  if (name.match(/contrabass|double bass/)) return "Contrabass";
  if (name.match(/string ensemble 2|strings 2/)) return "String Ensemble 2";
  if (name.match(/string ensemble|strings|cuerdas/)) return "String Ensemble 1";
  if (name.match(/synth strings 2/)) return "Synth Strings 2";
  if (name.match(/synth strings|synthstrings/)) return "Synth Strings 1";
  if (name.match(/synth choir/)) return "Synth Choir";
  if (name.match(/orchestra hit/)) return "Orchestra Hit";
  if (name.match(/voice oohs|oohs/)) return "Voice Oohs";
  if (name.match(/choir|voice|vocal|aahs|coro/)) return "Choir Aahs";

  // ── Pads ──
  if (name.match(/pad 1|new age/)) return "Pad 1 (new age)";
  if (name.match(/pad 2|warm/)) return "Pad 2 (warm)";
  if (name.match(/pad 3|polysynth/)) return "Pad 3 (polysynth)";
  if (name.match(/pad 4|choir pad/)) return "Pad 4 (choir)";
  if (name.match(/pad 5|bowed/)) return "Pad 5 (bowed)";
  if (name.match(/pad 6|metallic/)) return "Pad 6 (metallic)";
  if (name.match(/pad 7|halo/)) return "Pad 7 (halo)";
  if (name.match(/pad 8|sweep/)) return "Pad 8 (sweep)";
  if (name.match(/pad/)) return "Pad 2 (warm)";

  // ── Leads de sintetizador (ojo: "Lead Vocals" NO es un lead de synth) ──
  if (name.match(/lead 1|square lead/)) return "Lead 1 (square)";
  if (name.match(/lead 2|sawtooth|saw lead/)) return "Lead 2 (sawtooth)";
  if (name.match(/lead 3|calliope/)) return "Lead 3 (calliope)";
  if (name.match(/lead 4|chiff/)) return "Lead 4 (chiff)";
  if (name.match(/lead 5|charang/)) return "Lead 5 (charang)";
  if (name.match(/lead 6/)) return "Lead 6 (voice)";
  if (name.match(/lead 7|fifths/)) return "Lead 7 (fifths)";
  if (name.match(/lead 8|bass \+ lead/)) return "Lead 8 (bass + lead)";
  if (name.match(/synth lead|lead synth|lead guitar|melodía guía/))
    return "Lead 2 (sawtooth)";

  // ── Percusión melódica ──
  if (name.match(/timpani|tímpani/)) return "Timpani";
  if (name.match(/steel drum|steel drums/)) return "Steel Drums";
  if (name.match(/woodblock/)) return "Woodblock";
  if (name.match(/taiko/)) return "Taiko Drum";
  if (name.match(/melodic tom/)) return "Melodic Tom";
  if (name.match(/synth drum/)) return "Synth Drum";
  if (name.match(/reverse cymbal/)) return "Reverse Cymbal";
  if (name.match(/tinkle bell/)) return "Tinkle Bell";
  if (name.match(/agogo/)) return "Agogo";

  // ── Efectos ──
  // Ojo con las palabras sueltas: sin \b, "Brain" matchearía "rain".
  if (name.match(/fx 1|\brain\b/)) return "FX 1 (rain)";
  if (name.match(/soundtrack|fx 2/)) return "FX 2 (soundtrack)";
  if (name.match(/fx 3|\bcrystal\b/)) return "FX 3 (crystal)";
  if (name.match(/fx 4|\batmosphere\b/)) return "FX 4 (atmosphere)";
  if (name.match(/fx 5|\bbrightness\b/)) return "FX 5 (brightness)";
  if (name.match(/fx 6|\bgoblins\b/)) return "FX 6 (goblins)";
  if (name.match(/fx 7|\bechoes\b/)) return "FX 7 (echoes)";
  if (name.match(/fx 8|sci.?fi/)) return "FX 8 (sci-fi)";

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
