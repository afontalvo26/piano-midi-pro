import type { ProjectCommand } from "./commands.ts";
import type { ProjectClip, ProjectInstrumentRef, ProjectPattern, ProjectTakeRef, ProjectTrack } from "./model.ts";
import type { ConvertedRecordedTake } from "./smfImport.ts";
import { validateStandalonePattern } from "./validate.ts";

const VIRTUOSITY_CORE_PITCHES = new Set([36, 38, 42, 46, 56]);

export interface PrepareRecordedTakeImportOptions {
  readonly takeId: string;
  readonly at: number;
  readonly startTick?: number;
  /** Pass PROJECT_PIANO_INSTRUMENT from projectAudioSink. */
  readonly pianoInstrument: ProjectInstrumentRef;
  /** Pass PROJECT_DRUM_INSTRUMENT from projectAudioSink. */
  readonly drumInstrument: ProjectInstrumentRef;
  readonly nextId?: () => string;
}

export interface PreparedRecordedTakeImport {
  /** One dispatch creates every track, pattern, clip and provenance entry; Undo removes the lot. */
  readonly command: Extract<ProjectCommand, { kind: "importRecordedTake" }>;
  /** These GM pitches stay in the drum track but need a mapped sample before they sound. */
  readonly unsupportedDrumPitches: readonly number[];
}

function withSuffix(name: string, suffix: string): string {
  return `${name.slice(0, Math.max(1, 100 - suffix.length)).trimEnd()}${suffix}`;
}

/** Splits MIDI channel 10 (zero-based 9) from melodic channels without changing the source take. */
export function prepareRecordedTakeImport(converted: ConvertedRecordedTake,
  options: PrepareRecordedTakeImportOptions): PreparedRecordedTakeImport {
  validateStandalonePattern(converted.pattern);
  if (options.pianoInstrument.instrumentId !== "salamander-grand" ||
      options.drumInstrument.instrumentId !== "virtuosity-core") {
    throw new RangeError("La importación requiere Salamander Grand y Virtuosity Core verificados");
  }
  if (!Number.isSafeInteger(options.at) || options.at < 0 ||
      !Number.isSafeInteger(options.startTick ?? 0) || (options.startTick ?? 0) < 0) {
    throw new RangeError("Fecha o tick de inserción inválido");
  }
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  const startTick = options.startTick ?? 0;
  const tracks: ProjectTrack[] = [];
  const patterns: ProjectPattern[] = [];
  const clips: ProjectClip[] = [];
  const groups = [
    { drum: false, instrument: options.pianoInstrument, trackName: "Toma MIDI · Piano Salamander",
      suffix: " · Piano" },
    { drum: true, instrument: options.drumInstrument, trackName: "Toma MIDI · Batería Virtuosity",
      suffix: " · Batería" },
  ] as const;
  for (const group of groups) {
    const notes = converted.pattern.notes.filter((note) => (note.channel === 9) === group.drum);
    const expression = converted.pattern.expression.filter((event) => (event.channel === 9) === group.drum);
    if (notes.length === 0 && expression.length === 0) continue;
    const trackId = nextId();
    const patternId = patterns.length === 0 ? converted.pattern.id : nextId();
    const track: ProjectTrack = {
      id: trackId, name: group.trackName, kind: group.drum ? "drum" : "instrument",
      instrument: group.instrument,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] },
    };
    const pattern: ProjectPattern = { ...converted.pattern, id: patternId,
      name: withSuffix(converted.pattern.name, group.suffix), notes, expression };
    const clip: ProjectClip = { id: nextId(), kind: "pattern", trackId, sourceId: patternId,
      sourceVersion: pattern.version, startTick, lengthTicks: pattern.lengthTicks, sourceOffsetTick: 0,
      loopMode: "none", tailPolicy: "cut", transpose: 0, gainDb: 0, muted: false };
    tracks.push(track); patterns.push(pattern); clips.push(clip);
  }
  if (tracks.length === 0) throw new RangeError("La toma MIDI no contiene notas ni expresión editables");
  const report = converted.report;
  const take: ProjectTakeRef = { id: nextId(), kind: "midi", recordingId: options.takeId,
    createdAt: options.at, midiImport: {
      sourceSha256: report.sourceSha256, sourceByteLength: report.sourceByteLength,
      sourcePpq: report.sourcePpq, tempoMap: converted.tempoMap, meterMap: converted.meterMap,
      sourceTempoEvents: report.sourceTempoEvents, sourceMeterEvents: report.sourceMeterEvents,
      roundedPositions: report.roundedPositions, ignoredMetaEvents: report.ignoredMetaEvents,
      ignoredSysExEvents: report.ignoredSysExEvents,
      normalizedZeroDurations: report.normalizedZeroDurations,
    } };
  const unsupportedDrumPitches = [...new Set(converted.pattern.notes.filter((note) => note.channel === 9 &&
    !VIRTUOSITY_CORE_PITCHES.has(note.pitch)).map((note) => note.pitch))].sort((a, b) => a - b);
  return { command: { kind: "importRecordedTake", take, tracks, patterns, clips, at: options.at },
    unsupportedDrumPitches };
}
