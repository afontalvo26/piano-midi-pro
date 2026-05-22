// ============================================================
// Music Analyzer - Chord detection, key analysis, statistics
// Uses the 'tonal' library
// ============================================================

import { Chord, Key } from "tonal";
import type {
  ScoreDocument,
  FlatNote,
  ChordEvent,
  NoteName,
} from "../types/score";

// --- Chord Detection ---

const NOTE_NAMES = [
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
];

function midiToNoteName(midi: number): string {
  return NOTE_NAMES[midi % 12];
}

function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function midiToFullNote(midi: number): string {
  return `${midiToNoteName(midi)}${midiToOctave(midi)}`;
}

/** Group simultaneous notes into chord windows (50ms tolerance) */
function groupNotesByTime(notes: FlatNote[], toleranceMs = 0.05): FlatNote[][] {
  if (notes.length === 0) return [];
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const groups: FlatNote[][] = [];
  let current: FlatNote[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].time - current[0].time <= toleranceMs) {
      current.push(sorted[i]);
    } else {
      groups.push(current);
      current = [sorted[i]];
    }
  }
  groups.push(current);
  return groups;
}

/** Detect chord label from a set of MIDI pitches */
function detectChord(
  midiNotes: number[],
): { label: string; root: string; quality: string; bass?: string } | null {
  if (midiNotes.length < 2) return null;
  const noteNames = midiNotes.map((m) => midiToFullNote(m));
  const chordResult = Chord.detect(noteNames);
  if (chordResult.length === 0) {
    // Try pitch classes only (ignore octave)
    const pitchClasses = [...new Set(midiNotes.map((m) => midiToNoteName(m)))];
    const pcChords = Chord.detect(pitchClasses);
    if (pcChords.length > 0) {
      const parsed = Chord.get(pcChords[0]);
      return {
        label: pcChords[0],
        root: parsed.tonic ?? pitchClasses[0],
        quality: parsed.quality ?? "major",
      };
    }
    return null;
  }
  const best = chordResult[0];
  const parsed = Chord.get(best);
  const label = best;
  const root = parsed.tonic ?? midiToNoteName(midiNotes[0]);
  const quality = parsed.quality ?? "major";
  // Bass note (lowest pitch)
  const bass = midiToNoteName(Math.min(...midiNotes));
  const hasBassNote = bass !== root;
  return {
    label: hasBassNote ? `${label}/${bass}` : label,
    root,
    quality,
    bass: hasBassNote ? bass : undefined,
  };
}

/** Map tonal quality string to our ChordEvent quality type */
function mapQuality(q: string): ChordEvent["quality"] {
  const lower = q.toLowerCase();
  if (lower === "major") return "major";
  if (lower === "minor") return "minor";
  if (lower.includes("diminished"))
    return lower.includes("half") ? "half-diminished" : "diminished";
  if (lower.includes("augmented")) return "augmented";
  if (lower.includes("dominant")) return "dominant7";
  if (lower.includes("major7") || lower.includes("maj7")) return "major7";
  if (lower.includes("minor7") || lower.includes("min7")) return "minor7";
  if (lower.includes("sus2")) return "sus2";
  if (lower.includes("sus4")) return "sus4";
  if (lower.includes("add9")) return "add9";
  if (lower.includes("power") || lower.includes("5")) return "power";
  return "major";
}

/** Extract chord events from a window (segment) of flat notes */
function extractChordsFromWindow(
  notes: FlatNote[],
  windowDuration: number = 0.5,
): ChordEvent[] {
  const groups = groupNotesByTime(notes, 0.08);
  const events: ChordEvent[] = [];

  for (const group of groups) {
    if (group.length < 2) continue;
    const midiNotes = [...new Set(group.map((n) => n.midi))].sort();
    const result = detectChord(midiNotes);
    if (!result) continue;

    const startTime = group[0].time;
    const endTime = Math.max(...group.map((n) => n.time + n.duration));
    const duration = Math.max(endTime - startTime, windowDuration);

    events.push({
      time: startTime,
      duration,
      root: result.root as NoteName,
      quality: mapQuality(result.quality),
      extensions: [],
      bass: result.bass as NoteName | undefined,
      label: result.label,
      measureNumber: group[0].measureNumber,
      beat: group[0].beat,
      midiNotes,
    });
  }

  return events;
}

// --- Key Detection ---

/** Detect the most likely key using note frequency analysis (Krumhansl-Schmuckler profile) */
function detectKey(notes: FlatNote[]): string {
  if (notes.length === 0) return "C Major";

  // Count pitch class occurrences
  const pcCounts = new Array(12).fill(0);
  for (const note of notes) {
    pcCounts[note.midi % 12] += note.duration;
  }

  // Try to find key from pitch classes
  try {
    const keyInfo = Key.majorKey("C"); // just testing the API works
    void keyInfo;
  } catch {
    /* tonal not fully available */
  }

  // Simple correlation with all major/minor scales
  const MAJOR_PROFILE = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
  ];
  const MINOR_PROFILE = [
    6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
  ];
  const NOTE_NAMES_KEYS = [
    "C",
    "C#",
    "D",
    "Eb",
    "E",
    "F",
    "F#",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ];

  let bestCorr = -Infinity;
  let bestKey = "C Major";

  for (let tonic = 0; tonic < 12; tonic++) {
    // Rotate profile
    const majCorr = correlate(pcCounts, rotateProfile(MAJOR_PROFILE, tonic));
    const minCorr = correlate(pcCounts, rotateProfile(MINOR_PROFILE, tonic));

    if (majCorr > bestCorr) {
      bestCorr = majCorr;
      bestKey = `${NOTE_NAMES_KEYS[tonic]} Major`;
    }
    if (minCorr > bestCorr) {
      bestCorr = minCorr;
      bestKey = `${NOTE_NAMES_KEYS[tonic]} Minor`;
    }
  }

  return bestKey;
}

function rotateProfile(profile: number[], steps: number): number[] {
  const len = profile.length;
  return profile.map((_, i) => profile[(i - steps + len) % len]);
}

function correlate(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    denA = 0,
    denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  return num / (Math.sqrt(denA) * Math.sqrt(denB) + 1e-9);
}

// --- Difficulty Analysis ---

function analyzeDifficulty(
  score: ScoreDocument,
): "beginner" | "intermediate" | "advanced" | "expert" {
  const notes = score.flatNotes;
  if (notes.length === 0) return "beginner";

  let score_val = 0;

  // 1. Note density (notes per second)
  const density = notes.length / Math.max(score.metadata.duration, 1);
  if (density > 8) score_val += 30;
  else if (density > 4) score_val += 20;
  else if (density > 2) score_val += 10;

  // 2. Pitch range
  const minMidi = Math.min(...notes.map((n) => n.midi));
  const maxMidi = Math.max(...notes.map((n) => n.midi));
  const range = maxMidi - minMidi;
  if (range > 48) score_val += 20;
  else if (range > 36) score_val += 10;
  else if (range > 24) score_val += 5;

  // 3. Number of parts
  const partCount = score.parts.length;
  if (partCount > 4) score_val += 15;
  else if (partCount > 2) score_val += 8;
  else if (partCount > 1) score_val += 3;

  // 4. Tempo
  const bpm = score.metadata.bpm;
  if (bpm > 160) score_val += 15;
  else if (bpm > 120) score_val += 8;
  else if (bpm > 80) score_val += 3;

  // 5. Key accidentals
  const fifths = Math.abs(score.metadata.keySignature.fifths);
  score_val += fifths * 2;

  // 6. Articulations & ornaments
  const ornamentsCount = score.parts.reduce(
    (sum, p) => sum + p.measures.reduce((s, m) => s + m.ornaments.length, 0),
    0,
  );
  if (ornamentsCount > 20) score_val += 15;
  else if (ornamentsCount > 5) score_val += 8;

  if (score_val >= 70) return "expert";
  if (score_val >= 45) return "advanced";
  if (score_val >= 20) return "intermediate";
  return "beginner";
}

// --- Statistics ---

export interface ScoreStats {
  totalNotes: number;
  totalMeasures: number;
  duration: number; // seconds
  averageDensity: number; // notes/second
  pitchRange: { min: number; max: number; span: number };
  dynamicRange: { min: string; max: string };
  tempoChanges: number;
  uniquePitches: number;
  chordDensity: number; // chords per measure
  partStats: {
    partId: string;
    name: string;
    noteCount: number;
    averagePitch: number;
    tessituraMin: number;
    tessituraMax: number;
  }[];
}

function computeStats(score: ScoreDocument): ScoreStats {
  const notes = score.flatNotes;
  const pitches = notes.map((n) => n.midi);

  const partStats = score.parts.map((p) => {
    const pNotes = notes.filter((n) => n.partId === p.id);
    const pPitches = pNotes.map((n) => n.midi);
    return {
      partId: p.id,
      name: p.name,
      noteCount: pNotes.length,
      averagePitch:
        pPitches.length > 0
          ? pPitches.reduce((a, b) => a + b, 0) / pPitches.length
          : 0,
      tessituraMin: pPitches.length > 0 ? Math.min(...pPitches) : 0,
      tessituraMax: pPitches.length > 0 ? Math.max(...pPitches) : 0,
    };
  });

  const allDynamics = score.globalDynamics.map((d) => d.type);
  const dynamicOrder = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"];
  const usedDynamics = dynamicOrder.filter((d) =>
    allDynamics.includes(d as never),
  );

  return {
    totalNotes: notes.length,
    totalMeasures: score.metadata.totalMeasures,
    duration: score.metadata.duration,
    averageDensity: notes.length / Math.max(score.metadata.duration, 1),
    pitchRange: {
      min: pitches.length > 0 ? Math.min(...pitches) : 0,
      max: pitches.length > 0 ? Math.max(...pitches) : 0,
      span:
        pitches.length > 0 ? Math.max(...pitches) - Math.min(...pitches) : 0,
    },
    dynamicRange: {
      min: usedDynamics[0] ?? "mf",
      max: usedDynamics[usedDynamics.length - 1] ?? "mf",
    },
    tempoChanges: score.tempoMap.length,
    uniquePitches: new Set(pitches).size,
    chordDensity: 0, // filled after chord analysis
    partStats,
  };
}

// --- Main Analyzer Export ---

export interface AnalysisResult {
  detectedKey: string;
  chords: ChordEvent[];
  stats: ScoreStats;
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
}

export function analyzeScore(score: ScoreDocument): AnalysisResult {
  const notes = score.flatNotes.filter((n) => !n.isRest);

  // Key detection
  const detectedKey = detectKey(notes);

  // Chord detection (use notes from all parts combined, limit to first 120s for perf)
  const firstSection = notes.filter((n) => n.time < 120);
  const chords = extractChordsFromWindow(firstSection);

  // Stats
  const stats = computeStats(score);
  stats.chordDensity =
    score.metadata.totalMeasures > 0
      ? chords.length / score.metadata.totalMeasures
      : 0;

  // Difficulty
  const difficulty = analyzeDifficulty(score);

  return { detectedKey, chords, stats, difficulty };
}

// --- Current Chord at Playback Position ---

export function getChordAtTime(
  chords: ChordEvent[],
  time: number,
): ChordEvent | null {
  if (!chords.length) return null;
  // Find the last chord that started before or at `time`
  let best: ChordEvent | null = null;
  for (const chord of chords) {
    if (chord.time <= time && chord.time + chord.duration >= time) {
      best = chord;
    }
  }
  return best;
}

// --- Active Notes at Time ---

export function getActiveNotesAtTime(
  flatNotes: FlatNote[],
  time: number,
  windowMs: number = 0.03,
): number[] {
  return flatNotes
    .filter(
      (n) =>
        !n.isRest &&
        n.time <= time + windowMs &&
        n.time + n.duration >= time - windowMs,
    )
    .map((n) => n.midi);
}
