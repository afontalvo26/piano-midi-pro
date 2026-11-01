import type { ProjectDocumentV1, ProjectNote, ProjectPattern, ProjectTakeRef } from "../project/model.ts";
import type { ConvertedRecordedTake } from "../project/smfImport.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

export interface PreparePatternOverdubOptions {
  readonly trackId: string;
  readonly patternId: string;
  readonly projectStartTick: number;
  readonly sourceTakeId: string;
  /** A running scene owns its track independently of the arrangement clip. */
  readonly launcherActive?: boolean;
  readonly nextId?: () => string;
}

export interface PreparedPatternOverdub {
  readonly pattern: ProjectPattern;
  readonly destinationClipId: string;
  readonly patternInsertTick: number;
  readonly sharedClipCount: number;
  readonly addedNotes: number;
  readonly addedExpression: number;
  readonly sourcePpq: number;
  readonly sourceRoundedPositions: number;
  readonly retimedPositions: number;
  readonly tailsBeyondPattern: number;
  readonly tailsBeyondClip: number;
}

export function recordedOverdubTakeRef(converted: ConvertedRecordedTake,
  options: { readonly takeId: string; readonly referenceId: string; readonly at: number }): ProjectTakeRef {
  if (!options.takeId || !options.referenceId || !Number.isFinite(options.at) || options.at < 0) {
    throw new RangeError("Referencia de toma MIDI inválida");
  }
  const report = converted.report;
  return { id: options.referenceId, kind: "midi", recordingId: options.takeId,
    createdAt: options.at, midiImport: {
      sourceSha256: report.sourceSha256, sourceByteLength: report.sourceByteLength,
      sourcePpq: report.sourcePpq, tempoMap: converted.tempoMap, meterMap: converted.meterMap,
      sourceTempoEvents: report.sourceTempoEvents, sourceMeterEvents: report.sourceMeterEvents,
      roundedPositions: report.roundedPositions, ignoredMetaEvents: report.ignoredMetaEvents,
      ignoredSysExEvents: report.ignoredSysExEvents,
      normalizedZeroDurations: report.normalizedZeroDurations,
    } };
}

/**
 * Translate a verified, saved SMF take into the active arrangement pattern.
 * Source ticks first become seconds on the take's own tempo map, then project
 * ticks at the actual recording start. The raw RecordingLibrary bytes stay put.
 */
export function preparePatternOverdub(document: ProjectDocumentV1,
  converted: ConvertedRecordedTake, options: PreparePatternOverdubOptions): PreparedPatternOverdub {
  if (!Number.isSafeInteger(options.projectStartTick) || options.projectStartTick < 0 ||
      !options.sourceTakeId || !options.trackId || !options.patternId) {
    throw new RangeError("Destino o inicio de la toma MIDI inválido");
  }
  if (options.launcherActive) throw new RangeError("Vuelve al arreglo antes de insertar la toma en un clip");
  const track = document.tracks.find((item) => item.id === options.trackId);
  const pattern = document.patterns.find((item) => item.id === options.patternId);
  if (!track || !pattern || track.kind !== "instrument" || track.drumRack) {
    throw new RangeError("El overdub requiere una pista instrumental y un patrón activo compatible");
  }
  if (pattern.notes.some((note) => note.origin.sourceTakeId === options.sourceTakeId) ||
      pattern.expression.some((event) => event.sourceTakeId === options.sourceTakeId)) {
    throw new RangeError("Esta toma ya se insertó en el patrón");
  }
  const clips = document.clips.filter((clip) => clip.trackId === track.id && !clip.muted &&
    clip.startTick <= options.projectStartTick &&
    options.projectStartTick < clip.startTick + clip.lengthTicks);
  const active = clips.reduce<(typeof clips)[number] | null>((best, clip) => !best ||
    clip.startTick > best.startTick || (clip.startTick === best.startTick && clip.id > best.id)
    ? clip : best, null);
  if (!active || active.kind !== "pattern" || active.sourceId !== pattern.id) {
    throw new RangeError("El patrón elegido no tiene autoridad en el cabezal de grabación");
  }
  if (active.transpose !== 0) {
    throw new RangeError("La instancia está transpuesta; hazla única y vuelve a grabar sin transposición");
  }
  const elapsed = options.projectStartTick - active.startTick;
  const initialSourceTick = active.sourceOffsetTick + elapsed;
  const patternInsertTick = active.loopMode === "loop"
    ? initialSourceTick % pattern.lengthTicks : initialSourceTick;
  if (patternInsertTick >= pattern.lengthTicks) {
    throw new RangeError("El cabezal ya pasó el final de la fuente sin repetición");
  }
  const authorityEnd = document.clips.reduce((end, clip) => clip.trackId === track.id && !clip.muted &&
    clip.id !== active.id && clip.startTick > options.projectStartTick && clip.startTick < end
    ? clip.startTick : end, active.startTick + active.lengthTicks);
  const sourceClock = new MusicalClock(converted.tempoMap, converted.meterMap);
  const projectClock = new MusicalClock(document.tempoMap, document.meterMap);
  const projectStartSeconds = projectClock.tickToSeconds(options.projectStartTick);
  let retimedPositions = 0;
  const localAt = (sourceTick: number): { localTick: number; projectTick: number } => {
    const seconds = projectStartSeconds + sourceClock.tickToSeconds(sourceTick);
    const projectTick = projectClock.secondsToTick(seconds, "nearest");
    if (Math.abs(projectClock.tickToSeconds(projectTick) - seconds) > 1e-7) retimedPositions++;
    return { projectTick, localTick: patternInsertTick + projectTick - options.projectStartTick };
  };
  const requireOnset = (localTick: number, projectTick: number): void => {
    if (localTick < 0 || localTick >= pattern.lengthTicks || projectTick >= authorityEnd) {
      throw new RangeError("La toma cruza el ciclo o cambia de clip: impórtala como pista nueva o elige otra instancia");
    }
  };
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  let tailsBeyondClip = 0;
  const newNotes: ProjectNote[] = converted.pattern.notes.map((note) => {
    const start = localAt(note.startTick);
    requireOnset(start.localTick, start.projectTick);
    const end = localAt(note.startTick + note.durationTick);
    if (end.projectTick > authorityEnd) tailsBeyondClip++;
    const durationTick = Math.max(1, end.localTick - start.localTick);
    return { ...note, id: nextId(), startTick: start.localTick, durationTick,
      origin: { ...note.origin, sourceTakeId: options.sourceTakeId,
        importedProjectStartTick: start.localTick, importedProjectDurationTick: durationTick } };
  });
  const sequenceBase = pattern.expression.reduce((max, event) => Math.max(max, event.sequence), -1) + 1;
  if (!Number.isSafeInteger(sequenceBase + converted.pattern.expression.length)) {
    throw new RangeError("La secuencia MIDI excede el rango seguro");
  }
  const newExpression = converted.pattern.expression.map((event, index) => {
    const position = localAt(event.tick);
    requireOnset(position.localTick, position.projectTick);
    return { ...event, id: nextId(), tick: position.localTick,
      sequence: sequenceBase + index, sourceTakeId: options.sourceTakeId };
  });
  if (!newNotes.length && !newExpression.length) {
    throw new RangeError("La toma no contiene notas ni expresión para insertar");
  }
  const replacement: ProjectPattern = { ...pattern, version: pattern.version + 1,
    notes: [...pattern.notes, ...newNotes], expression: [...pattern.expression, ...newExpression] };
  return { pattern: replacement, destinationClipId: active.id, patternInsertTick,
    sharedClipCount: document.clips.filter((clip) => clip.kind === "pattern" && clip.sourceId === pattern.id).length,
    addedNotes: newNotes.length, addedExpression: newExpression.length,
    sourcePpq: converted.report.sourcePpq, sourceRoundedPositions: converted.report.roundedPositions,
    retimedPositions,
    tailsBeyondPattern: newNotes.filter((note) => note.startTick + note.durationTick > pattern.lengthTicks).length,
    tailsBeyondClip };
}
