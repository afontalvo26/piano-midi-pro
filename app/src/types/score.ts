// ============================================================
// SCORE DATA MODEL - Complete professional music notation types
// ============================================================

export type NoteName = 'C' | 'C#' | 'Db' | 'D' | 'D#' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb' | 'G' | 'G#' | 'Ab' | 'A' | 'A#' | 'Bb' | 'B';
export type Accidental = 'sharp' | 'flat' | 'natural' | 'double-sharp' | 'double-flat' | null;
export type ClefType = 'treble' | 'bass' | 'alto' | 'tenor' | 'percussion';
export type DurationType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th' | '128th';
export type DynamicType = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff' | 'sfz' | 'fp' | 'sf';
export type ArticulationType = 'staccato' | 'staccatissimo' | 'tenuto' | 'accent' | 'marcato' | 'fermata' | 'portato' | 'stress' | 'unstress';
export type OrnamentType = 'trill' | 'mordent' | 'inverted-mordent' | 'turn' | 'inverted-turn' | 'tremolo' | 'grace-note';
export type BarlineType = 'regular' | 'double' | 'final' | 'repeat-start' | 'repeat-end' | 'repeat-both' | 'dashed' | 'dotted';
export type KeyMode = 'major' | 'minor';
export type WedgeType = 'crescendo' | 'diminuendo';

// ---- Structural elements ----

export interface KeySignature {
  fifths: number;       // -7 flats .. 0 .. +7 sharps
  mode: KeyMode;
  root: NoteName;
  name: string;         // "C Major", "A Minor", etc.
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
  display: string;      // "4/4", "6/8", "5/4"
}

export interface TempoMarking {
  bpm: number;
  beatUnit: DurationType;
  text?: string;        // "Allegro", "Andante", "Presto"
  measureNumber: number;
  time: number;         // absolute seconds
}

// ---- Expression ----

export interface Dynamic {
  type: DynamicType;
  measureNumber: number;
  beat: number;
  time: number;
}

export interface Wedge {
  type: WedgeType;
  startMeasure: number;
  startBeat: number;
  endMeasure: number;
  endBeat: number;
  startTime: number;
  endTime: number;
}

// ---- Note-level annotations ----

export interface Articulation {
  type: ArticulationType;
  noteId: string;
}

export interface Ornament {
  type: OrnamentType;
  noteId: string;
  auxiliaryNote?: number;     // MIDI pitch for trill/mordent aux
  tremoloStrokes?: number;    // for tremolo beams
}

export interface SlurTie {
  id: string;
  type: 'slur' | 'tie';
  startNoteId: string;
  endNoteId: string;
  partId: string;
}

export interface Pedal {
  type: 'sustain' | 'sostenuto' | 'una-corda';
  action: 'press' | 'release';
  measureNumber: number;
  beat: number;
  time: number;
}

export interface Tuplet {
  id: string;
  actual: number;     // e.g. 3 for triplet
  normal: number;     // e.g. 2 for triplet (3 in space of 2)
  noteIds: string[];
}

// ---- Core note ----

export interface ScoreNote {
  id: string;
  midi: number;           // 0-127 MIDI pitch (0 for rest)
  isRest: boolean;
  pitchName: NoteName | null;
  octave: number | null;
  accidental: Accidental;

  // Timing (absolute seconds from score start)
  time: number;
  duration: number;       // sounding duration in seconds
  notatedDuration: DurationType;
  dots: number;           // 0, 1, or 2 augmentation dots

  // Expression
  velocity: number;       // 0-1 (from dynamic context)
  dynamic?: DynamicType;

  // Location
  measureNumber: number;
  beat: number;           // 1-based beat within measure
  staffNumber: number;    // 1=treble/upper, 2=bass/lower
  voice: number;          // 1-4 voices per staff

  // Annotations
  articulations: ArticulationType[];
  ornaments: OrnamentType[];
  isTied: boolean;        // tied from previous note (don't re-attack)
  isGrace: boolean;
  isChordNote: boolean;   // part of a chord (same time as previous)

  // Tuplet
  tupletId?: string;
  tupletRatio?: string;   // "3:2", "5:4", etc.

  // Instrument effects (per instrument type)
  pizzicato?: boolean;    // strings
  arco?: boolean;
  muted?: boolean;        // brass/winds
  harmonic?: boolean;
  tremolo?: number;       // strokes (1-4)
}

// ---- Measure ----

export interface RepeatInfo {
  type: 'start' | 'end' | 'both';
  times?: number;
}

export interface Ending {
  number: number;       // 1, 2, 3...
  type: 'start' | 'stop' | 'discontinue';
}

export interface Measure {
  number: number;
  startTime: number;    // absolute seconds
  duration: number;     // seconds
  notes: ScoreNote[];
  timeSignature?: TimeSignature;   // only when it changes
  keySignature?: KeySignature;     // only when it changes
  tempoChanges: TempoMarking[];
  dynamics: Dynamic[];
  wedges: Wedge[];
  pedals: Pedal[];
  articulations: Articulation[];
  ornaments: Ornament[];
  slurs: SlurTie[];
  tuplets: Tuplet[];
  repeat?: RepeatInfo;
  ending?: Ending;
  clefChange?: ClefType;
  rehearsalMark?: string;          // "A", "B", "Verse", "Chorus"
  text?: string;                    // tempo/expression text
  isPickup: boolean;               // anacrusis / pickup bar
}

// ---- Part / Instrument ----

export interface ScorePart {
  id: string;
  name: string;             // "Piano", "Trumpet", "Violin I"
  shortName?: string;       // "Pno.", "Tpt.", "Vln. I"
  instrument: string;       // General MIDI instrument name
  midiProgram: number;      // 0-127 GM program
  midiChannel: number;      // 0-15

  // Transposition (for Bb clarinet, Eb alto sax, etc.)
  transposeChromatic: number;   // semitones to written concert pitch
  transposeDiatonic: number;

  // Score display
  clef: ClefType;
  staffCount: number;       // 1 for most, 2 for piano (grand staff)
  color: string;            // track color for visualization

  // Mixer state
  volume: number;           // 0-1
  pan: number;              // -1 to 1
  muted: boolean;
  solo: boolean;
  visible: boolean;

  // Content
  measures: Measure[];
  noteCount: number;
}

// ---- Score-level metadata ----

export interface ScoreMetadata {
  title: string;
  composer?: string;
  lyricist?: string;
  arranger?: string;
  copyright?: string;
  description?: string;
  source: string;           // "MusicXML", "MIDI", "ABC", "Built-in"
  sourceFormat: 'musicxml' | 'midi' | 'abc' | 'builtin';

  // Tempo & Time
  bpm: number;              // primary tempo
  timeSignature: TimeSignature;
  keySignature: KeySignature;
  totalMeasures: number;
  duration: number;         // total seconds

  // Musical analysis (filled by analyzer)
  detectedKey?: string;
  detectedChords?: ChordEvent[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

// ---- Chord detection ----

export interface ChordEvent {
  time: number;
  duration: number;
  root: NoteName;
  quality: 'major' | 'minor' | 'diminished' | 'augmented' | 'dominant7' | 'major7' | 'minor7' | 'diminished7' | 'half-diminished' | 'sus2' | 'sus4' | 'add9' | 'power';
  extensions: string[];   // ["9", "11", "#11", "13"]
  bass?: NoteName;        // slash chord bass note
  label: string;          // "Cmaj7", "Dm/F", "G7", "Am"
  measureNumber: number;
  beat: number;
  midiNotes: number[];
}

// ---- Full Score Document ----

export interface ScoreDocument {
  id: string;
  metadata: ScoreMetadata;
  parts: ScorePart[];
  tempoMap: TempoMarking[];     // all tempo changes in order
  timeSignatureMap: { measureNumber: number; sig: TimeSignature }[];
  keySignatureMap: { measureNumber: number; key: KeySignature }[];
  globalDynamics: Dynamic[];
  globalWedges: Wedge[];
  globalPedals: Pedal[];
  rehearsalMarks: { measureNumber: number; label: string }[];

  // Flat notes array for piano-roll / falling notes (all parts merged)
  flatNotes: FlatNote[];
}

// Flat note - compatible with existing SongNote in App.tsx, extended
export interface FlatNote {
  id: string;
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;   // maps to parts array index
  partId: string;
  measureNumber: number;
  beat: number;
  isRest: boolean;
  dynamic?: DynamicType;
  articulations: ArticulationType[];
  isTied: boolean;
  isGrace: boolean;
}

// ---- Import / parse result ----

export interface ParseResult {
  success: boolean;
  score?: ScoreDocument;
  errors: string[];
  warnings: string[];
  format: 'musicxml' | 'midi' | 'abc' | 'unknown';
}
