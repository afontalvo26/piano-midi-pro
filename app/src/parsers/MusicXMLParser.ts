// ============================================================
// MusicXML Parser - Converts .xml / .mxl to ScoreDocument
// Supports: MusicXML 3.1 & 4.0
// ============================================================

import JSZip from "jszip";
import type {
  ScoreDocument,
  ScorePart,
  Measure,
  ScoreNote,
  KeySignature,
  TimeSignature,
  TempoMarking,
  Dynamic,
  Wedge,
  Pedal,
  Articulation,
  Ornament,
  SlurTie,
  Tuplet,
  FlatNote,
  ParseResult,
  NoteName,
  Accidental,
  DurationType,
  DynamicType,
  ArticulationType,
  OrnamentType,
  ClefType,
  RepeatInfo,
  Ending,
} from "../types/score";

const TRACK_COLORS = [
  "#a78bfa",
  "#60a5fa",
  "#fb923c",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#e879f9",
  "#38bdf8",
  "#4ade80",
  "#f87171",
];

const DYNAMIC_VELOCITY: Record<DynamicType, number> = {
  ppp: 0.1,
  pp: 0.2,
  p: 0.3,
  mp: 0.45,
  mf: 0.6,
  f: 0.75,
  ff: 0.88,
  fff: 1.0,
  sfz: 0.9,
  fp: 0.7,
  sf: 0.85,
};

const NOTE_TO_MIDI_STEP: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const GM_INSTRUMENTS: Record<string, number> = {
  "Acoustic Grand Piano": 0,
  "Bright Acoustic Piano": 1,
  "Electric Grand Piano": 2,
  "Honky-tonk Piano": 3,
  "Electric Piano 1": 4,
  "Electric Piano 2": 5,
  Harpsichord: 6,
  Clavinet: 7,
  Celesta: 8,
  Glockenspiel: 9,
  "Music Box": 10,
  Vibraphone: 11,
  Marimba: 12,
  Xylophone: 13,
  "Tubular Bells": 14,
  Dulcimer: 15,
  "Drawbar Organ": 16,
  Violin: 40,
  Viola: 41,
  Cello: 42,
  Contrabass: 43,
  "Pizzicato Strings": 45,
  "String Ensemble 1": 48,
  "String Ensemble 2": 49,
  "Choir Aahs": 52,
  "Voice Oohs": 53,
  Trumpet: 56,
  Trombone: 57,
  Tuba: 58,
  "French Horn": 60,
  "Brass Section": 61,
  "Soprano Sax": 64,
  "Alto Sax": 65,
  "Tenor Sax": 66,
  "Baritone Sax": 67,
  Oboe: 68,
  Clarinet: 71,
  Flute: 73,
  Recorder: 74,
  Guitar: 25,
  "Acoustic Guitar (nylon)": 24,
  "Acoustic Guitar (steel)": 25,
  "Electric Guitar (jazz)": 26,
  "Distortion Guitar": 30,
  "Acoustic Bass": 32,
  "Electric Bass (finger)": 33,
  Drums: 118,
  Percussion: 118,
};

function getText(el: Element | null, tag: string): string {
  if (!el) return "";
  const child = el.querySelector(tag);
  return child?.textContent?.trim() ?? "";
}

function getAttr(el: Element | null, attr: string): string {
  return el?.getAttribute(attr) ?? "";
}

function stepOctaveToMidi(step: string, octave: number, alter: number): number {
  const base = NOTE_TO_MIDI_STEP[step.toUpperCase()] ?? 0;
  return (octave + 1) * 12 + base + Math.round(alter);
}

function alterToAccidental(alter: number): Accidental {
  if (alter === 1) return "sharp";
  if (alter === -1) return "flat";
  if (alter === 0) return "natural";
  if (alter === 2) return "double-sharp";
  if (alter === -2) return "double-flat";
  return null;
}

function fifthsToKey(fifths: number, mode: string): KeySignature {
  const majorKeys: NoteName[] = [
    "C",
    "G",
    "D",
    "A",
    "E",
    "B",
    "F#",
    "C#",
    "F",
    "Bb",
    "Eb",
    "Ab",
    "Db",
    "Gb",
    "B",
  ];
  const minorKeys: NoteName[] = [
    "A",
    "E",
    "B",
    "F#",
    "C#",
    "G#",
    "D#",
    "A#",
    "D",
    "G",
    "C",
    "F",
    "Bb",
    "Eb",
    "Ab",
  ];
  const idx = fifths + 7;
  const isMinor = mode === "minor";
  const root = isMinor ? minorKeys[idx] : majorKeys[idx];
  const keyMode = isMinor ? "minor" : "major";
  return {
    fifths,
    mode: keyMode,
    root,
    name: `${root} ${isMinor ? "Minor" : "Major"}`,
  };
}

function parseDuration(type: string): DurationType {
  const map: Record<string, DurationType> = {
    whole: "whole",
    half: "half",
    quarter: "quarter",
    eighth: "eighth",
    "16th": "16th",
    "32nd": "32nd",
    "64th": "64th",
    "128th": "128th",
  };
  return map[type] ?? "quarter";
}

export function durationTypeToSeconds(
  type: DurationType,
  quarterSeconds: number,
  dots: number,
): number {
  const quarters: Record<DurationType, number> = {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
    "16th": 0.25,
    "32nd": 0.125,
    "64th": 0.0625,
    "128th": 0.03125,
  };
  let q = quarters[type] * quarterSeconds;
  let dotAdd = q;
  for (let i = 0; i < dots; i++) {
    dotAdd /= 2;
    q += dotAdd;
  }
  return q;
}

function parseArticulations(
  notationsEl: Element | null,
  noteId: string,
): Articulation[] {
  if (!notationsEl) return [];
  const artic = notationsEl.querySelector("articulations");
  if (!artic) return [];
  const result: Articulation[] = [];
  const map: Record<string, ArticulationType> = {
    staccato: "staccato",
    staccatissimo: "staccatissimo",
    tenuto: "tenuto",
    accent: "accent",
    "strong-accent": "marcato",
    fermata: "fermata",
    "detached-legato": "portato",
    stress: "stress",
    unstress: "unstress",
  };
  for (const [tag, type] of Object.entries(map)) {
    if (artic.querySelector(tag)) result.push({ type, noteId });
  }
  return result;
}

function parseOrnaments(
  notationsEl: Element | null,
  noteId: string,
): Ornament[] {
  if (!notationsEl) return [];
  const orn = notationsEl.querySelector("ornaments");
  if (!orn) return [];
  const result: Ornament[] = [];
  const map: Record<string, OrnamentType> = {
    "trill-mark": "trill",
    mordent: "mordent",
    "inverted-mordent": "inverted-mordent",
    turn: "turn",
    "inverted-turn": "inverted-turn",
    tremolo: "tremolo",
  };
  for (const [tag, type] of Object.entries(map)) {
    const el = orn.querySelector(tag);
    if (el) {
      const ornament: Ornament = { type, noteId };
      if (type === "tremolo") {
        ornament.tremoloStrokes = parseInt(el.textContent ?? "2", 10);
      }
      result.push(ornament);
    }
  }
  return result;
}

function parseClef(clefEl: Element | null): ClefType {
  if (!clefEl) return "treble";
  const sign = getText(clefEl, "sign").toUpperCase();
  const line = getText(clefEl, "line");
  if (sign === "G") return "treble";
  if (sign === "F") return "bass";
  if (sign === "C") {
    if (line === "3") return "alto";
    if (line === "4") return "tenor";
  }
  if (sign === "PERCUSSION" || sign === "percussion") return "percussion";
  return "treble";
}

interface ActiveWedge {
  type: "crescendo" | "diminuendo";
  startMeasure: number;
  startBeat: number;
  startTime: number;
  partId: string;
}

interface ParsedPartInfo {
  id: string;
  name: string;
  shortName: string;
  midiProgram: number;
  midiChannel: number;
  transposeChromatic: number;
  transposeDiatonic: number;
}

// ---- Main Parse Function ----

export async function parseMusicXML(file: File): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    let xmlText: string;

    // .mxl = compressed MusicXML (zip)
    if (file.name.toLowerCase().endsWith(".mxl")) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      // Find rootfile in META-INF/container.xml
      let rootfilePath = "";
      const containerFile = zip.file("META-INF/container.xml");
      if (containerFile) {
        const containerText = await containerFile.async("string");
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerText, "text/xml");
        rootfilePath =
          containerDoc.querySelector("rootfile")?.getAttribute("full-path") ??
          "";
      }
      if (!rootfilePath) {
        // Fallback: find first .xml file
        const xmlFiles = Object.keys(zip.files).filter(
          (f) => f.endsWith(".xml") && !f.startsWith("META-INF"),
        );
        rootfilePath = xmlFiles[0] ?? "";
      }
      if (!rootfilePath) {
        return {
          success: false,
          errors: ["No XML file found in .mxl archive"],
          warnings,
          format: "musicxml",
        };
      }
      const xmlFile = zip.file(rootfilePath);
      if (!xmlFile) {
        return {
          success: false,
          errors: [`Cannot find ${rootfilePath} in archive`],
          warnings,
          format: "musicxml",
        };
      }
      xmlText = await xmlFile.async("string");
    } else {
      xmlText = await file.text();
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      return {
        success: false,
        errors: [`XML parse error: ${parseError.textContent?.slice(0, 200)}`],
        warnings,
        format: "musicxml",
      };
    }

    const score = buildScoreDocument(doc, file.name, errors, warnings);
    return { success: true, score, errors, warnings, format: "musicxml" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errors: [`Unexpected error: ${msg}`],
      warnings,
      format: "musicxml",
    };
  }
}

function buildScoreDocument(
  doc: Document,
  filename: string,
  errors: string[],
  warnings: string[],
): ScoreDocument {
  void errors;
  void warnings;
  const id = `score-${Date.now()}`;

  // ---- Metadata ----
  const workTitle =
    getText(doc.documentElement, "work-title") ||
    getText(doc.documentElement, "movement-title") ||
    filename.replace(/\.[^.]+$/, "");
  const composer =
    getText(doc.documentElement, 'creator[type="composer"]') ||
    doc.querySelector('creator[type="composer"]')?.textContent?.trim() ||
    "";
  const lyricist =
    doc.querySelector('creator[type="lyricist"]')?.textContent?.trim() || "";
  const copyright = doc.querySelector("rights")?.textContent?.trim() || "";

  // ---- Part list ----
  const partInfoMap = new Map<string, ParsedPartInfo>();
  doc.querySelectorAll("score-part").forEach((sp, idx) => {
    const partId = getAttr(sp, "id");
    const name = getText(sp, "part-name") || `Part ${idx + 1}`;
    const shortName = getText(sp, "part-abbreviation") || name.slice(0, 4);

    // MIDI instrument
    const midiInst = sp.querySelector("midi-instrument");
    const midiChannel =
      parseInt(getText(midiInst, "midi-channel") || "1", 10) - 1;
    const midiProgram = Math.max(
      0,
      parseInt(getText(midiInst, "midi-program") || "1", 10) - 1,
    );

    // Transposition
    const transposeEl = sp.querySelector("transpose");
    const transposeChromatic = parseInt(
      getText(transposeEl, "chromatic") || "0",
      10,
    );
    const transposeDiatonic = parseInt(
      getText(transposeEl, "diatonic") || "0",
      10,
    );

    partInfoMap.set(partId, {
      id: partId,
      name,
      shortName,
      midiProgram,
      midiChannel: Math.max(0, midiChannel),
      transposeChromatic,
      transposeDiatonic,
    });
  });

  // ---- Parse each Part ----
  const parts: ScorePart[] = [];
  const allFlatNotes: FlatNote[] = [];
  const globalTempoMap: TempoMarking[] = [];
  const globalTimeSigMap: { measureNumber: number; sig: TimeSignature }[] = [];
  const globalKeySigMap: { measureNumber: number; key: KeySignature }[] = [];

  // Initial defaults
  let globalBpm = 120;
  let globalTimeSig: TimeSignature = {
    numerator: 4,
    denominator: 4,
    display: "4/4",
  };
  let globalKeySig: KeySignature = {
    fifths: 0,
    mode: "major",
    root: "C",
    name: "C Major",
  };

  const partElements = Array.from(doc.querySelectorAll("part"));

  partElements.forEach((partEl, partIdx) => {
    const partId = getAttr(partEl, "id");
    const info = partInfoMap.get(partId) ?? {
      id: partId,
      name: `Part ${partIdx + 1}`,
      shortName: `P${partIdx + 1}`,
      midiProgram: 0,
      midiChannel: partIdx,
      transposeChromatic: 0,
      transposeDiatonic: 0,
    };

    // Infer instrument name from GM program
    const instrumentName = inferInstrumentName(info.name, info.midiProgram);
    const color = TRACK_COLORS[partIdx % TRACK_COLORS.length];

    // Parse measures
    const measures: Measure[] = [];
    const wedges: ActiveWedge[] = [];
    let currentBpm = globalBpm;
    let currentTimeSig = { ...globalTimeSig };
    let currentKeySig = { ...globalKeySig };
    let currentClef: ClefType = "treble";
    let absoluteTime = 0;
    let partNoteCount = 0;

    const measureEls = Array.from(partEl.querySelectorAll("measure"));

    measureEls.forEach((measureEl, mIdx) => {
      const measureNumber = parseInt(
        getAttr(measureEl, "number") || String(mIdx + 1),
        10,
      );
      const measureNotes: ScoreNote[] = [];
      const measureDynamics: Dynamic[] = [];
      const measureWedges: Wedge[] = [];
      const measurePedals: Pedal[] = [];
      const measureArticulations: Articulation[] = [];
      const measureOrnaments: Ornament[] = [];
      const measureSlurs: SlurTie[] = [];
      const measureTuplets: Tuplet[] = [];
      const measureTempoChanges: TempoMarking[] = [];
      let measureRepeat: RepeatInfo | undefined;
      let measureEnding: Ending | undefined;
      let measureRehearsalMark: string | undefined;
      let measureText: string | undefined;

      // divisions = ticks per quarter note in this measure
      let divisions = 1;
      let voice1Beat = 0; // running time within measure for voice 1
      const voiceTime: Record<number, number> = {};
      let currentDynamic: DynamicType = "mf";
      const isPickup = mIdx === 0 && getAttr(measureEl, "implicit") === "yes";

      const children = Array.from(measureEl.children);
      for (const child of children) {
        const tag = child.tagName;

        // ---- Attributes ----
        if (tag === "attributes") {
          const divEl = child.querySelector("divisions");
          if (divEl) divisions = parseInt(divEl.textContent ?? "1", 10);

          // Key signature
          const keyEl = child.querySelector("key");
          if (keyEl) {
            const fifths = parseInt(getText(keyEl, "fifths") || "0", 10);
            const mode = getText(keyEl, "mode") || "major";
            currentKeySig = fifthsToKey(fifths, mode);
            if (partIdx === 0) {
              globalKeySigMap.push({ measureNumber, key: currentKeySig });
              globalKeySig = currentKeySig;
            }
          }

          // Time signature
          const timeEl = child.querySelector("time");
          if (timeEl) {
            const num = parseInt(getText(timeEl, "beats") || "4", 10);
            const den = parseInt(getText(timeEl, "beat-type") || "4", 10);
            currentTimeSig = {
              numerator: num,
              denominator: den,
              display: `${num}/${den}`,
            };
            if (partIdx === 0) {
              globalTimeSigMap.push({ measureNumber, sig: currentTimeSig });
              globalTimeSig = currentTimeSig;
            }
          }

          // Clef
          const clefEl = child.querySelector("clef");
          if (clefEl) currentClef = parseClef(clefEl);

          // Transpose
          const transEl = child.querySelector("transpose");
          if (transEl) {
            info.transposeChromatic = parseInt(
              getText(transEl, "chromatic") || "0",
              10,
            );
            info.transposeDiatonic = parseInt(
              getText(transEl, "diatonic") || "0",
              10,
            );
          }
        }

        // ---- Barline ----
        else if (tag === "barline") {
          const repeatEl = child.querySelector("repeat");
          const endingEl = child.querySelector("ending");
          const location = getAttr(child, "location");

          if (repeatEl) {
            const direction = getAttr(repeatEl, "direction");
            if (direction === "forward") {
              measureRepeat = { type: "start" };
            } else if (direction === "backward") {
              const times = parseInt(getAttr(repeatEl, "times") || "2", 10);
              if (measureRepeat?.type === "start") {
                measureRepeat = { type: "both", times };
              } else {
                measureRepeat = { type: "end", times };
              }
            }
          }

          if (endingEl) {
            const endingNum = parseInt(getAttr(endingEl, "number") || "1", 10);
            const endingType = getAttr(endingEl, "type") as
              | "start"
              | "stop"
              | "discontinue";
            measureEnding = { number: endingNum, type: endingType };
          }

          void location; // used only for display
        }

        // ---- Direction (tempo, dynamics, wedges, pedals, text) ----
        else if (tag === "direction") {
          const sound = child.querySelector("sound");
          if (sound) {
            const tempoAttr = sound.getAttribute("tempo");
            if (tempoAttr) {
              currentBpm = parseFloat(tempoAttr);
              if (partIdx === 0) {
                const tm: TempoMarking = {
                  bpm: currentBpm,
                  beatUnit: "quarter",
                  measureNumber,
                  time: absoluteTime + voice1Beat,
                };
                measureTempoChanges.push(tm);
                globalTempoMap.push(tm);
                globalBpm = currentBpm;
              }
            }
          }

          // Tempo text from words
          const wordsEl = child.querySelector("words");
          if (wordsEl && partIdx === 0) {
            const wordText = wordsEl.textContent?.trim() ?? "";
            if (wordText) measureText = wordText;
            // Look for metronome
            const metronome = child.querySelector("metronome");
            if (metronome) {
              const beatUnit = getText(metronome, "beat-unit") as DurationType;
              const bpmVal = parseInt(
                getText(metronome, "per-minute") || "0",
                10,
              );
              if (bpmVal > 0) {
                currentBpm = bpmVal;
                const tm: TempoMarking = {
                  bpm: currentBpm,
                  beatUnit: parseDuration(beatUnit),
                  text: wordText || undefined,
                  measureNumber,
                  time: absoluteTime + voice1Beat,
                };
                measureTempoChanges.push(tm);
                if (
                  !measureTempoChanges.some(
                    (t) => t !== tm && t.measureNumber === measureNumber,
                  )
                ) {
                  globalTempoMap.push(tm);
                }
                globalBpm = currentBpm;
              }
            }
          }

          // Rehearsal mark
          const rehearsal = child.querySelector("rehearsal");
          if (rehearsal && partIdx === 0) {
            measureRehearsalMark = rehearsal.textContent?.trim();
          }

          // Dynamics
          const dynamicsEl = child.querySelector("dynamics");
          if (dynamicsEl) {
            const dynChild = dynamicsEl.firstElementChild;
            if (dynChild) {
              const dynType = dynChild.tagName as DynamicType;
              if (DYNAMIC_VELOCITY[dynType] !== undefined) {
                currentDynamic = dynType;
                const offset = parseInt(
                  getText(child.querySelector("offset"), "") || "0",
                  10,
                );
                const dynTime =
                  absoluteTime + (offset / divisions) * (60 / currentBpm);
                measureDynamics.push({
                  type: dynType,
                  measureNumber,
                  beat: voice1Beat / (60 / currentBpm) + 1,
                  time: dynTime,
                });
              }
            }
          }

          // Wedge (crescendo/diminuendo)
          const wedgeEl = child.querySelector("wedge");
          if (wedgeEl) {
            const wType = getAttr(wedgeEl, "type");
            const wNumber = getAttr(wedgeEl, "number") || "1";
            if (wType === "crescendo" || wType === "diminuendo") {
              wedges.push({
                type: wType,
                startMeasure: measureNumber,
                startBeat: voice1Beat / (60 / currentBpm) + 1,
                startTime: absoluteTime + voice1Beat,
                partId,
              });
            } else if (wType === "stop") {
              const active = wedges.find(
                (w) => w.partId === wNumber || wedges.length === 1,
              );
              if (active) {
                const completedWedge: Wedge = {
                  type: active.type,
                  startMeasure: active.startMeasure,
                  startBeat: active.startBeat,
                  startTime: active.startTime,
                  endMeasure: measureNumber,
                  endBeat: voice1Beat / (60 / currentBpm) + 1,
                  endTime: absoluteTime + voice1Beat,
                };
                measureWedges.push(completedWedge);
                const idx = wedges.indexOf(active);
                if (idx !== -1) wedges.splice(idx, 1);
              }
            }
          }

          // Pedal
          const pedalEl = child.querySelector("pedal");
          if (pedalEl) {
            const pType = getAttr(pedalEl, "type");
            if (pType === "start" || pType === "stop") {
              measurePedals.push({
                type: "sustain",
                action: pType === "start" ? "press" : "release",
                measureNumber,
                beat: voice1Beat / (60 / currentBpm) + 1,
                time: absoluteTime + voice1Beat,
              });
            }
          }
        }

        // ---- Note ----
        else if (tag === "note") {
          const voiceEl = child.querySelector("voice");
          const voice = parseInt(voiceEl?.textContent ?? "1", 10);
          if (!voiceTime[voice]) voiceTime[voice] = 0;

          const isChord = child.querySelector("chord") !== null;
          const isRest = child.querySelector("rest") !== null;
          const isGrace = child.querySelector("grace") !== null;

          // Duration in ticks
          const durTicks = parseInt(getText(child, "duration") || "0", 10);
          const quarterSeconds = 60 / currentBpm;
          const durSeconds = (durTicks / divisions) * quarterSeconds;

          // Pitch
          const pitchEl = child.querySelector("pitch");
          let midiNum = 0;
          let pitchName: NoteName | null = null;
          let octave: number | null = null;
          let accidental: Accidental = null;

          if (pitchEl && !isRest) {
            const step = getText(pitchEl, "step").toUpperCase();
            const oct = parseInt(getText(pitchEl, "octave") || "4", 10);
            const alter = parseFloat(getText(pitchEl, "alter") || "0");
            midiNum =
              stepOctaveToMidi(step, oct, alter) + info.transposeChromatic;
            pitchName = step as NoteName;
            octave = oct;
            accidental = alterToAccidental(alter);
          }

          // Note type
          const typeEl = child.querySelector("type");
          const typeText = typeEl?.textContent?.trim() ?? "quarter";
          const notatedDuration = parseDuration(typeText);
          const dotEls = child.querySelectorAll("dot");
          const dots = dotEls.length;

          // Position in measure
          const noteTime = isChord
            ? voiceTime[voice] - durSeconds
            : voiceTime[voice];
          const absoluteNoteTime = absoluteTime + noteTime;
          const beat = noteTime / quarterSeconds + 1;

          // Ties
          const tieEls = Array.from(child.querySelectorAll("tied, tie"));
          const isTied = tieEls.some((t) => getAttr(t, "type") === "stop");

          // Staff
          const staffEl = child.querySelector("staff");
          const staffNumber = parseInt(staffEl?.textContent ?? "1", 10);

          // Notations
          const notationsEl = child.querySelector("notations");
          const articleTypes = parseArticulations(notationsEl, "");
          const ornamentTypes = parseOrnaments(notationsEl, "");

          // Slurs
          if (notationsEl) {
            notationsEl.querySelectorAll("slur").forEach((slurEl) => {
              const slurType = getAttr(slurEl, "type");
              const slurNum = getAttr(slurEl, "number") || "1";
              if (slurType === "start" || slurType === "stop") {
                measureSlurs.push({
                  id: `slur-${partId}-${measureNumber}-${slurNum}`,
                  type: "slur",
                  startNoteId:
                    slurType === "start"
                      ? `n-${partId}-${measureNumber}-${midiNum}-${absoluteNoteTime.toFixed(3)}`
                      : "",
                  endNoteId:
                    slurType === "stop"
                      ? `n-${partId}-${measureNumber}-${midiNum}-${absoluteNoteTime.toFixed(3)}`
                      : "",
                  partId,
                });
              }
            });
          }

          // Tuplet
          if (notationsEl) {
            const tupletEl = notationsEl.querySelector("tuplet");
            if (tupletEl) {
              const tupType = getAttr(tupletEl, "type");
              const actual = parseInt(
                getText(tupletEl, "tuplet-actual > tuplet-number") || "3",
                10,
              );
              const normal = parseInt(
                getText(tupletEl, "tuplet-normal > tuplet-number") || "2",
                10,
              );
              if (tupType === "start") {
                const tid = `tuplet-${partId}-${measureNumber}-${beat.toFixed(2)}`;
                measureTuplets.push({ id: tid, actual, normal, noteIds: [] });
              }
            }
          }

          // Effects
          const technicalEl = child.querySelector("technical");
          const pizzicato = !!technicalEl?.querySelector("pizzicato");
          const harmonic = !!technicalEl?.querySelector("harmonic, artificial");
          const muted = !!notationsEl?.querySelector(
            "snap-pizzicato, brass > mute, plop, fall",
          );
          const tremolo = ornamentTypes.find(
            (o) => o.type === "tremolo",
          )?.tremoloStrokes;

          const noteId = `n-${partId}-${measureNumber}-${midiNum}-${absoluteNoteTime.toFixed(3)}`;

          const note: ScoreNote = {
            id: noteId,
            midi: midiNum,
            isRest,
            pitchName,
            octave,
            accidental,
            time: absoluteNoteTime,
            duration: isGrace ? 0.05 : durSeconds,
            notatedDuration,
            dots,
            velocity: DYNAMIC_VELOCITY[currentDynamic] ?? 0.6,
            dynamic: currentDynamic,
            measureNumber,
            beat,
            staffNumber,
            voice,
            articulations: articleTypes.map((a) => a.type),
            ornaments: ornamentTypes.map((o) => o.type),
            isTied,
            isGrace,
            isChordNote: isChord,
            pizzicato: pizzicato || undefined,
            harmonic: harmonic || undefined,
            muted: muted || undefined,
            tremolo: tremolo ?? undefined,
          };

          measureNotes.push(note);
          measureArticulations.push(
            ...articleTypes.map((a) => ({ ...a, noteId })),
          );
          measureOrnaments.push(
            ...ornamentTypes.map((o) => ({ ...o, noteId })),
          );

          // Advance voice time
          if (!isChord && !isGrace) {
            voiceTime[voice] = (voiceTime[voice] ?? 0) + durSeconds;
            if (voice === 1) voice1Beat = voiceTime[1];
          }

          if (!isRest && !isGrace) partNoteCount++;
        }

        // ---- Forward / Backup ----
        else if (tag === "forward") {
          const ticks = parseInt(getText(child, "duration") || "0", 10);
          const sec = (ticks / divisions) * (60 / currentBpm);
          const v = parseInt(getText(child, "voice") || "1", 10);
          voiceTime[v] = (voiceTime[v] ?? 0) + sec;
          if (v === 1) voice1Beat = voiceTime[1];
        } else if (tag === "backup") {
          const ticks = parseInt(getText(child, "duration") || "0", 10);
          const sec = (ticks / divisions) * (60 / currentBpm);
          // backup doesn't affect voice1Beat directly; used for multi-staff
          void sec;
        }
      }

      // Measure duration = max voice time (use time sig as fallback)
      const maxVoiceTime = Math.max(...Object.values(voiceTime), 0);
      const quarterSeconds = 60 / currentBpm;
      const timeSigDuration =
        (currentTimeSig.numerator / currentTimeSig.denominator) *
        4 *
        quarterSeconds;
      const measDuration = maxVoiceTime > 0 ? maxVoiceTime : timeSigDuration;

      const measure: Measure = {
        number: measureNumber,
        startTime: absoluteTime,
        duration: measDuration,
        notes: measureNotes,
        timeSignature:
          mIdx === 0 || (measureTempoChanges.length === 0 && mIdx === 0)
            ? currentTimeSig
            : undefined,
        keySignature: mIdx === 0 ? currentKeySig : undefined,
        tempoChanges: measureTempoChanges,
        dynamics: measureDynamics,
        wedges: measureWedges,
        pedals: measurePedals,
        articulations: measureArticulations,
        ornaments: measureOrnaments,
        slurs: measureSlurs,
        tuplets: measureTuplets,
        repeat: measureRepeat,
        ending: measureEnding,
        rehearsalMark: measureRehearsalMark,
        text: measureText,
        isPickup,
      };

      measures.push(measure);
      absoluteTime += measDuration;
    });

    // Build flat notes for this part
    const partFlatNotes: FlatNote[] = [];
    measures.forEach((m) => {
      m.notes.forEach((n) => {
        if (!n.isRest) {
          partFlatNotes.push({
            id: n.id,
            midi: n.midi,
            time: n.time,
            duration: n.duration,
            velocity: n.velocity,
            trackIndex: partIdx,
            partId,
            measureNumber: n.measureNumber,
            beat: n.beat,
            isRest: false,
            dynamic: n.dynamic,
            articulations: n.articulations,
            isTied: n.isTied,
            isGrace: n.isGrace,
          });
        }
      });
    });

    allFlatNotes.push(...partFlatNotes);

    const part: ScorePart = {
      id: partId,
      name: info.name,
      shortName: info.shortName || info.name.slice(0, 4),
      instrument: instrumentName,
      midiProgram: info.midiProgram,
      midiChannel: info.midiChannel,
      transposeChromatic: info.transposeChromatic,
      transposeDiatonic: info.transposeDiatonic,
      clef: currentClef,
      staffCount:
        info.name.toLowerCase().includes("piano") ||
        measures.some((m) => m.notes.some((n) => n.staffNumber === 2))
          ? 2
          : 1,
      color,
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      visible: true,
      measures,
      noteCount: partNoteCount,
    };

    parts.push(part);
  });

  // Sort all flat notes by time
  allFlatNotes.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const totalDuration = allFlatNotes.reduce(
    (max, n) => Math.max(max, n.time + n.duration),
    0,
  );

  // First tempo in score
  const primaryBpm =
    globalTempoMap.length > 0 ? globalTempoMap[0].bpm : globalBpm;

  const score: ScoreDocument = {
    id,
    metadata: {
      title: workTitle,
      composer: composer || undefined,
      lyricist: lyricist || undefined,
      copyright: copyright || undefined,
      source: "MusicXML",
      sourceFormat: "musicxml",
      bpm: primaryBpm,
      timeSignature: globalTimeSig,
      keySignature: globalKeySig,
      totalMeasures: Math.max(...parts.map((p) => p.measures.length), 0),
      duration: totalDuration,
    },
    parts,
    tempoMap:
      globalTempoMap.length > 0
        ? globalTempoMap
        : [{ bpm: primaryBpm, beatUnit: "quarter", measureNumber: 1, time: 0 }],
    timeSignatureMap: globalTimeSigMap,
    keySignatureMap: globalKeySigMap,
    globalDynamics: parts.flatMap((p) => p.measures.flatMap((m) => m.dynamics)),
    globalWedges: parts.flatMap((p) => p.measures.flatMap((m) => m.wedges)),
    globalPedals: parts.flatMap((p) => p.measures.flatMap((m) => m.pedals)),
    rehearsalMarks:
      parts[0]?.measures
        .filter((m) => m.rehearsalMark)
        .map((m) => ({ measureNumber: m.number, label: m.rehearsalMark! })) ??
      [],
    flatNotes: allFlatNotes,
  };

  return score;
}

function inferInstrumentName(partName: string, midiProgram: number): string {
  const lower = partName.toLowerCase();

  // Name-based matching
  if (lower.includes("piano")) return "Acoustic Grand Piano";
  if (lower.includes("violin") || lower.includes("violín")) return "Violin";
  if (lower.includes("viola")) return "Viola";
  if (lower.includes("cello") || lower.includes("violoncello")) return "Cello";
  if (lower.includes("bass") && !lower.includes("guitar"))
    return lower.includes("double") ? "Contrabass" : "Acoustic Bass";
  if (lower.includes("trumpet") || lower.includes("trompeta")) return "Trumpet";
  if (lower.includes("trombone") || lower.includes("trombón"))
    return "Trombone";
  if (lower.includes("french horn") || lower.includes("horn"))
    return "French Horn";
  if (lower.includes("tuba")) return "Tuba";
  if (lower.includes("flute") || lower.includes("flauta")) return "Flute";
  if (lower.includes("oboe")) return "Oboe";
  if (lower.includes("clarinet") || lower.includes("clarinete"))
    return "Clarinet";
  if (lower.includes("bassoon") || lower.includes("fagot")) return "Bassoon";
  if (lower.includes("saxophone") || lower.includes("sax")) {
    if (lower.includes("alto")) return "Alto Sax";
    if (lower.includes("tenor")) return "Tenor Sax";
    if (lower.includes("soprano")) return "Soprano Sax";
    if (lower.includes("baritone") || lower.includes("bariton"))
      return "Baritone Sax";
    return "Alto Sax";
  }
  if (lower.includes("guitar") || lower.includes("guitarra"))
    return "Acoustic Guitar (nylon)";
  if (lower.includes("harp") || lower.includes("arpa"))
    return "Orchestral Harp";
  if (lower.includes("organ") || lower.includes("órgano"))
    return "Church Organ";
  if (
    lower.includes("drum") ||
    lower.includes("percussion") ||
    lower.includes("percus")
  )
    return "Percussion";
  if (
    lower.includes("choir") ||
    lower.includes("voice") ||
    lower.includes("vocal")
  )
    return "Choir Aahs";
  if (lower.includes("string")) return "String Ensemble 1";

  // Fall back to GM program
  for (const [name, program] of Object.entries(GM_INSTRUMENTS)) {
    if (program === midiProgram) return name;
  }

  return "Acoustic Grand Piano";
}

// ---- Convenience: convert ScoreDocument to SongData-compatible format ----

export function scoreToParts(score: ScoreDocument): {
  notes: import("../types/score").FlatNote[];
  tracks: {
    index: number;
    name: string;
    instrument: string;
    noteCount: number;
    color: string;
    midiProgram: number;
    midiChannel: number;
    partId: string;
  }[];
  bpm: number;
  duration: number;
  title: string;
} {
  return {
    notes: score.flatNotes.filter((n) => !n.isRest),
    tracks: score.parts.map((p, i) => ({
      index: i,
      name: p.name,
      instrument: p.instrument,
      noteCount: p.noteCount,
      color: p.color,
      midiProgram: p.midiProgram,
      midiChannel: p.midiChannel,
      partId: p.id,
    })),
    bpm: score.metadata.bpm,
    duration: score.metadata.duration,
    title: score.metadata.title,
  };
}
