import type { MeterPoint, ProjectAssetRef, ProjectAudioComp, ProjectAudioCrossfade,
  ProjectAutomationLane, ProjectClip, ProjectDrumRack,
  ProjectDocumentV1, ProjectInstrumentRef, ProjectMixChannel, ProjectMixState,
  ProjectEffect, ProjectPattern, ProjectScene,
  ProjectSection, ProjectTakeRef, ProjectTrack, TempoPoint } from "./model.ts";
import { validateFocusedDrumRackPatternEdit, validateFocusedPatternEdit,
  validateProjectDocument } from "./validate.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

export type ProjectCommand =
  | { readonly kind: "renameProject"; readonly name: string; readonly at: number }
  | { readonly kind: "setArchived"; readonly archived: boolean; readonly at: number }
  | { readonly kind: "replaceTempoMap"; readonly tempoMap: readonly TempoPoint[]; readonly at: number }
  | { readonly kind: "replaceMeterMap"; readonly meterMap: readonly MeterPoint[]; readonly at: number }
  | { readonly kind: "replacePattern"; readonly expectedVersion: number; readonly pattern: ProjectPattern; readonly at: number }
  | { readonly kind: "overdubRecordedTake"; readonly expectedVersion: number;
      readonly pattern: ProjectPattern; readonly take: ProjectTakeRef;
      readonly asset: ProjectAssetRef; readonly at: number }
  | { readonly kind: "undoRecordedOverdub"; readonly expectedVersion: number;
      readonly pattern: ProjectPattern; readonly take: ProjectTakeRef;
      readonly asset: ProjectAssetRef; readonly previousTake?: ProjectTakeRef;
      readonly removeAssetIfUnused: boolean; readonly at: number }
  | { readonly kind: "createTrack"; readonly track: ProjectTrack; readonly orderIndex?: number; readonly dataIndex?: number; readonly at: number }
  | { readonly kind: "removeTrack"; readonly trackId: string; readonly at: number }
  | { readonly kind: "createPattern"; readonly pattern: ProjectPattern; readonly index?: number; readonly at: number }
  | { readonly kind: "removePattern"; readonly patternId: string; readonly at: number }
  | { readonly kind: "createClip"; readonly clip: ProjectClip; readonly index?: number; readonly at: number }
  | { readonly kind: "removeClip"; readonly clipId: string; readonly at: number }
  | { readonly kind: "replaceClips"; readonly expected: readonly ProjectClip[]; readonly clips: readonly ProjectClip[]; readonly at: number }
  | { readonly kind: "replaceAudioArrangement"; readonly expected: {
      readonly clips: readonly ProjectClip[];
      readonly audioCrossfades: readonly ProjectAudioCrossfade[] | undefined };
      readonly clips: readonly ProjectClip[];
      readonly audioCrossfades: readonly ProjectAudioCrossfade[] | undefined; readonly at: number }
  | { readonly kind: "replaceAudioComps";
      readonly expected: readonly ProjectAudioComp[] | undefined;
      readonly comps: readonly ProjectAudioComp[] | undefined; readonly at: number }
  | { readonly kind: "replaceAudioComposition"; readonly expected: {
      readonly clips: readonly ProjectClip[];
      readonly audioCrossfades: readonly ProjectAudioCrossfade[] | undefined;
      readonly audioComps: readonly ProjectAudioComp[] | undefined };
      readonly clips: readonly ProjectClip[];
      readonly audioCrossfades: readonly ProjectAudioCrossfade[] | undefined;
      readonly audioComps: readonly ProjectAudioComp[] | undefined; readonly at: number }
  | { readonly kind: "splitAudioClip"; readonly clipId: string; readonly newClipId: string;
      readonly splitTick?: number; readonly splitUs?: number; readonly at: number }
  | { readonly kind: "setAudioTakeLatency"; readonly takeId: string;
      readonly expectedOffsetFrames: number; readonly offsetFrames: number;
      readonly restoreCapturedFieldAbsent?: boolean; readonly at: number }
  | { readonly kind: "replaceScenes"; readonly expected: readonly ProjectScene[]; readonly scenes: readonly ProjectScene[]; readonly at: number }
  | { readonly kind: "replaceSections"; readonly expected: readonly ProjectSection[]; readonly sections: readonly ProjectSection[]; readonly at: number }
  | { readonly kind: "replaceArrangement"; readonly expected: {
      readonly clips: readonly ProjectClip[]; readonly sections: readonly ProjectSection[];
      readonly automation: readonly ProjectAutomationLane[] };
      readonly clips: readonly ProjectClip[]; readonly sections: readonly ProjectSection[];
      readonly automation: readonly ProjectAutomationLane[]; readonly at: number }
  | { readonly kind: "replaceFullArrangement"; readonly expected: {
      readonly clips: readonly ProjectClip[]; readonly sections: readonly ProjectSection[];
      readonly automation: readonly ProjectAutomationLane[];
      readonly audioCrossfades: readonly ProjectAudioCrossfade[] | undefined;
      readonly audioComps: readonly ProjectAudioComp[] | undefined };
      readonly clips: readonly ProjectClip[]; readonly sections: readonly ProjectSection[];
      readonly automation: readonly ProjectAutomationLane[];
      readonly audioCrossfades: readonly ProjectAudioCrossfade[] | undefined;
      readonly audioComps: readonly ProjectAudioComp[] | undefined; readonly at: number }
  | { readonly kind: "replaceAutomationLane"; readonly laneId: string;
      readonly expected: ProjectAutomationLane | null; readonly lane: ProjectAutomationLane | null;
      readonly index?: number; readonly at: number }
  | { readonly kind: "duplicateClip"; readonly clipId: string; readonly newClipId: string;
      readonly startTick: number; readonly absoluteStartUs?: number; readonly at: number }
  | { readonly kind: "duplicateClipWithAutomation"; readonly clipId: string;
      readonly expectedClip: ProjectClip; readonly expectedLanes: readonly ProjectAutomationLane[];
      readonly newClipId: string; readonly startTick: number; readonly absoluteStartUs?: number;
      readonly newLaneIds: readonly string[]; readonly newPointIds: readonly (readonly string[])[];
      readonly at: number }
  | { readonly kind: "makeClipUnique"; readonly clipId: string; readonly newPatternId: string;
      readonly noteIds: readonly string[]; readonly expressionIds: readonly string[];
      readonly stepIds: Readonly<Record<string, string>>; readonly at: number }
  | { readonly kind: "restoreClipSource"; readonly clipId: string; readonly originalPatternId: string;
      readonly originalVersion: number; readonly uniquePatternId: string; readonly at: number }
  | { readonly kind: "installUniquePattern"; readonly clipId: string; readonly originalPatternId: string;
      readonly originalVersion: number; readonly pattern: ProjectPattern; readonly at: number }
  | { readonly kind: "importRecordedTake"; readonly take: ProjectTakeRef;
      readonly tracks: readonly ProjectTrack[]; readonly patterns: readonly ProjectPattern[];
      readonly clips: readonly ProjectClip[]; readonly at: number }
  | { readonly kind: "removeImportedTake"; readonly takeId: string;
      readonly trackIds: readonly string[]; readonly patternIds: readonly string[];
      readonly clipIds: readonly string[]; readonly at: number }
  | { readonly kind: "installUserSample"; readonly asset: ProjectAssetRef;
      readonly track: ProjectTrack; readonly pattern: ProjectPattern; readonly clip: ProjectClip; readonly at: number }
  | { readonly kind: "removeInstalledUserSample"; readonly assetId: string; readonly trackId: string;
      readonly patternId: string; readonly clipId: string; readonly at: number }
  | { readonly kind: "replaceSampleRegion"; readonly trackId: string;
      readonly expected: ProjectInstrumentRef["sampleRegion"];
      readonly region: ProjectInstrumentRef["sampleRegion"]; readonly at: number }
  | { readonly kind: "replaceSampleVoice"; readonly trackId: string;
      readonly expected: ProjectInstrumentRef["sampleVoice"];
      readonly voice: ProjectInstrumentRef["sampleVoice"]; readonly at: number }
  | { readonly kind: "replaceDrumRack"; readonly trackId: string;
      readonly expected: ProjectDrumRack | undefined;
      readonly rack: ProjectDrumRack | undefined; readonly at: number }
  | { readonly kind: "replaceDrumRackPatterns"; readonly trackId: string;
      readonly expectedRack: ProjectDrumRack | undefined; readonly rack: ProjectDrumRack | undefined;
      readonly patterns: readonly { readonly expectedVersion: number;
        readonly pattern: ProjectPattern }[]; readonly at: number }
  | { readonly kind: "installSampleSlices"; readonly trackId: string;
      readonly expectedRack: ProjectDrumRack; readonly asset: ProjectAssetRef;
      readonly slices: readonly { readonly padId: string; readonly startFrame: number;
        readonly endFrame: number }[]; readonly at: number }
  | { readonly kind: "restoreSampleSlices"; readonly trackId: string;
      readonly expectedRack: ProjectDrumRack; readonly rack: ProjectDrumRack;
      readonly asset: ProjectAssetRef; readonly slices: readonly { readonly padId: string;
        readonly startFrame: number; readonly endFrame: number }[];
      readonly removeAssetIfUnused: boolean; readonly at: number }
  | { readonly kind: "replaceTrackInstrument"; readonly trackId: string;
      readonly expected: ProjectInstrumentRef | undefined;
      readonly instrument: ProjectInstrumentRef | undefined; readonly at: number }
  | { readonly kind: "replaceTrackMix"; readonly trackId: string;
      readonly expected: ProjectMixChannel; readonly mix: ProjectMixChannel; readonly at: number }
  | { readonly kind: "replaceMasterMix"; readonly expected: ProjectMixState;
      readonly mix: ProjectMixState; readonly at: number }
  | { readonly kind: "replaceTrackEffects"; readonly trackId: string;
      readonly expected: readonly ProjectEffect[]; readonly effects: readonly ProjectEffect[];
      readonly at: number }
  | { readonly kind: "replaceMasterEffects"; readonly expected: readonly ProjectEffect[];
      readonly effects: readonly ProjectEffect[]; readonly at: number }
  | { readonly kind: "addAudioTake"; readonly asset: ProjectAssetRef;
      readonly take: ProjectTakeRef; readonly clip: ProjectClip; readonly at: number }
  | { readonly kind: "removeAudioTake"; readonly assetId: string;
      readonly takeId: string; readonly clipId: string; readonly at: number }
  | { readonly kind: "installRecordedAudioTake"; readonly asset: ProjectAssetRef;
      readonly take: ProjectTakeRef; readonly clip: Extract<ProjectClip, { kind: "audio" }>;
      readonly track?: ProjectTrack; readonly at: number }
  | { readonly kind: "removeInstalledRecordedAudioTake"; readonly assetId: string;
      readonly takeId: string; readonly clipId: string; readonly trackId?: string; readonly at: number }
  | { readonly kind: "installBusResample"; readonly asset: ProjectAssetRef;
      readonly take: ProjectTakeRef; readonly clip: Extract<ProjectClip, { kind: "audio" }>;
      readonly expectedSourceBus: ProjectTrack; readonly expectedDestinationTrack: ProjectTrack;
      readonly at: number }
  | { readonly kind: "removeBusResample"; readonly asset: ProjectAssetRef;
      readonly take: ProjectTakeRef; readonly clip: Extract<ProjectClip, { kind: "audio" }>;
      readonly expectedSourceBus: ProjectTrack; readonly expectedDestinationTrack: ProjectTrack;
      readonly at: number };

export interface AppliedProjectCommand {
  readonly document: ProjectDocumentV1;
  readonly inverse: ProjectCommand;
}

/** A copy has a new project identity; entity IDs remain stable within its own namespace. */
export function duplicateProjectDocument(source: ProjectDocumentV1,
  options: { readonly id: string; readonly name: string; readonly at: number }): ProjectDocumentV1 {
  validateProjectDocument(source);
  const copy: ProjectDocumentV1 = {
    ...structuredClone(source), id: options.id, name: options.name,
    createdAt: options.at, updatedAt: options.at, archived: false,
  };
  validateProjectDocument(copy);
  return copy;
}

function indexFor(requested: number | undefined, length: number): number {
  const index = requested ?? length;
  if (!Number.isSafeInteger(index) || index < 0 || index > length) throw new RangeError("Posición de inserción inválida");
  return index;
}

function inserted<T>(items: readonly T[], item: T, index: number): readonly T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function clipAt(snapshot: ProjectDocumentV1, clipId: string): { clip: ProjectClip; index: number } {
  const index = snapshot.clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) throw new RangeError("Clip inexistente");
  return { clip: snapshot.clips[index]!, index };
}

function cloneClipAt(snapshot: ProjectDocumentV1, clip: ProjectClip,
  newClipId: string, startTick: number, requestedStartUs?: number): ProjectClip {
  if (!Number.isSafeInteger(startTick) || startTick < 0) {
    throw new RangeError("Inicio de clip duplicado inválido");
  }
  if (clip.kind === "audio" && clip.timeMode === "absolute") {
    const clock = new MusicalClock(snapshot.tempoMap, snapshot.meterMap);
    const absoluteStartUs = requestedStartUs ?? Math.round(clock.tickToSeconds(startTick) * 1_000_000);
    if (!Number.isSafeInteger(absoluteStartUs) || absoluteStartUs < 0 ||
        clock.secondsToTick(absoluteStartUs / 1_000_000) !== startTick) {
      throw new RangeError("Ancla absoluta de copia incompatible con su tick proyectado");
    }
    const absoluteEndUs = absoluteStartUs + clip.absoluteEndUs! - clip.absoluteStartUs!;
    if (!Number.isSafeInteger(absoluteEndUs)) {
      throw new RangeError("Copia de clip absoluto excede el rango seguro");
    }
    const endTick = clock.secondsToTick(absoluteEndUs / 1_000_000);
    if (endTick <= startTick) throw new RangeError("Copia de audio colapsa en ticks");
    const copy = { ...structuredClone(clip), id: newClipId, startTick,
      lengthTicks: endTick - startTick, absoluteStartUs, absoluteEndUs };
    delete (copy as { groupId?: string }).groupId;
    return copy;
  }
  if (requestedStartUs !== undefined) {
    throw new RangeError("Sólo un clip de audio absoluto acepta ancla de microsegundos");
  }
  const copy = { ...structuredClone(clip), id: newClipId, startTick };
  delete (copy as { groupId?: string }).groupId;
  return copy;
}

function assertExpected<T>(current: readonly T[], expected: readonly T[], label: string): void {
  if (current !== expected && JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new RangeError(`${label}: snapshot desactualizado`);
  }
}

function assertStablePadIds(previous: ProjectDrumRack | undefined, next: ProjectDrumRack | undefined): void {
  if (previous !== undefined && next !== undefined &&
      previous.pads.some((pad, index) => pad.id !== next.pads?.[index]?.id)) {
    throw new RangeError("Los IDs y posiciones de pads existentes deben permanecer estables");
  }
}

function sameAssetRef(first: ProjectAssetRef, second: ProjectAssetRef): boolean {
  return first.id === second.id && first.sha256 === second.sha256 &&
    first.byteLength === second.byteLength && first.mimeType === second.mimeType &&
    first.sourceKind === second.sourceKind && first.license === second.license &&
    first.creator === second.creator && first.sourceUrl === second.sourceUrl &&
    first.packageVersion === second.packageVersion && first.frameCount === second.frameCount &&
    first.sampleRate === second.sampleRate && first.channelCount === second.channelCount;
}

function routeToBus(snapshot: ProjectDocumentV1, sourceId: string, busId: string): ProjectTrack[] {
  const tracks = new Map(snapshot.tracks.map((track) => [track.id, track]));
  const route: ProjectTrack[] = [];
  const visited = new Set<string>();
  let current = tracks.get(sourceId);
  while (current && !visited.has(current.id)) {
    route.push(current);
    if (current.id === busId) return route;
    visited.add(current.id);
    current = current.mix.outputBusTrackId ? tracks.get(current.mix.outputBusTrackId) : undefined;
  }
  throw new RangeError(`Pista ${sourceId} no enruta al bus ${busId}`);
}

/** Pure command reducer; validates the entire result for an untrusted caller. */
export function applyCommand(snapshot: ProjectDocumentV1, command: ProjectCommand): AppliedProjectCommand {
  return reduceCommand(snapshot, command, false);
}

/** Internal session path: the starting snapshot was validated, and small pattern edits are checked focally. */
export function applySessionCommand(snapshot: ProjectDocumentV1, command: ProjectCommand): AppliedProjectCommand {
  return reduceCommand(snapshot, command, true);
}

function reduceCommand(snapshot: ProjectDocumentV1, command: ProjectCommand, trustedSnapshot: boolean): AppliedProjectCommand {
  // Only validate the resulting document. A gesture sends one command, not one per pointer frame.
  if (!Number.isSafeInteger(command.at) || command.at < snapshot.createdAt || command.at > 8.64e15) {
    throw new RangeError("Fecha del comando inválida");
  }
  let document: ProjectDocumentV1;
  let inverse: ProjectCommand;
  let focusedValidated = false;
  switch (command.kind) {
    case "renameProject":
      document = { ...snapshot, name: command.name, updatedAt: command.at };
      inverse = { kind: "renameProject", name: snapshot.name, at: snapshot.updatedAt };
      break;
    case "setArchived":
      document = { ...snapshot, archived: command.archived, updatedAt: command.at };
      inverse = { kind: "setArchived", archived: snapshot.archived, at: snapshot.updatedAt };
      break;
    case "replaceTempoMap":
      {
        const hasAbsolute = snapshot.clips.some((clip) => clip.kind === "audio" &&
          clip.timeMode === "absolute");
        const clock = hasAbsolute ? new MusicalClock(command.tempoMap, snapshot.meterMap) : null;
        const clips = snapshot.clips.map((clip) => {
          if (clip.kind !== "audio" || clip.timeMode !== "absolute") return clip;
          const startTick = clock!.secondsToTick(clip.absoluteStartUs! / 1_000_000);
          const endTick = clock!.secondsToTick(clip.absoluteEndUs! / 1_000_000);
          if (endTick <= startTick) throw new RangeError("El nuevo tempo colapsa un clip absoluto");
          return { ...clip, startTick, lengthTicks: endTick - startTick };
        });
        document = { ...snapshot, tempoMap: command.tempoMap.map((point) => ({ ...point })),
          clips, updatedAt: command.at };
      }
      inverse = { kind: "replaceTempoMap", tempoMap: snapshot.tempoMap.map((point) => ({ ...point })), at: snapshot.updatedAt };
      break;
    case "replaceMeterMap":
      document = { ...snapshot, meterMap: command.meterMap.map((point) => ({ ...point })), updatedAt: command.at };
      inverse = { kind: "replaceMeterMap", meterMap: snapshot.meterMap.map((point) => ({ ...point })), at: snapshot.updatedAt };
      break;
    case "replacePattern": {
      const index = snapshot.patterns.findIndex((pattern) => pattern.id === command.pattern.id);
      if (index < 0) throw new RangeError("Patrón inexistente");
      const previous = snapshot.patterns[index]!;
      if (previous.version !== command.expectedVersion ||
          Math.abs(command.pattern.version - previous.version) !== 1) {
        throw new RangeError("Versión de patrón inesperada");
      }
      focusedValidated = trustedSnapshot && validateFocusedPatternEdit(previous, command.pattern, snapshot);
      if (focusedValidated) validateFocusedDrumRackPatternEdit(snapshot, previous, command.pattern);
      const priorNotes = focusedValidated && previous.notes.length !== command.pattern.notes.length
        ? new Map(previous.notes.map((note) => [note.id, note])) : null;
      const priorExpression = focusedValidated && previous.expression.length !== command.pattern.expression.length
        ? new Map(previous.expression.map((event) => [event.id, event])) : null;
      const replacement: ProjectPattern = focusedValidated ? {
        ...command.pattern,
        notes: command.pattern.notes.map((note, atIndex) =>
          note === (priorNotes?.get(note.id) ?? previous.notes[atIndex]) ? note : structuredClone(note)),
        expression: command.pattern.expression.map((event, atIndex) =>
          event === (priorExpression?.get(event.id) ?? previous.expression[atIndex])
            ? event : structuredClone(event)),
      } : structuredClone(command.pattern);
      document = {
        ...snapshot,
        patterns: snapshot.patterns.map((pattern, atIndex) => atIndex === index ? replacement : pattern),
        clips: snapshot.clips.map((clip) => clip.kind === "pattern" && clip.sourceId === replacement.id
          ? { ...clip, sourceVersion: replacement.version } : clip),
        updatedAt: command.at,
      };
      inverse = { kind: "replacePattern", expectedVersion: replacement.version,
        pattern: focusedValidated ? previous : structuredClone(previous), at: snapshot.updatedAt };
      break;
    }
    case "overdubRecordedTake": {
      const index = snapshot.patterns.findIndex((pattern) => pattern.id === command.pattern.id);
      if (index < 0) throw new RangeError("Patrón de overdub inexistente");
      const previous = snapshot.patterns[index]!;
      const next = command.pattern;
      if (previous.version !== command.expectedVersion || next.version !== previous.version + 1 ||
          previous.id !== next.id || previous.name !== next.name ||
          previous.lengthTicks !== next.lengthTicks ||
          next.notes.length < previous.notes.length ||
          next.expression.length < previous.expression.length) {
        throw new RangeError("Versión o estructura de overdub desactualizada");
      }
      if (command.take.kind !== "midi" || !command.take.recordingId || !command.take.midiImport ||
          command.take.assetId !== command.asset.id || command.asset.sourceKind !== "recorded" ||
          command.asset.mimeType !== "audio/midi" ||
          command.asset.sha256 !== command.take.midiImport.sourceSha256 ||
          command.asset.byteLength !== command.take.midiImport.sourceByteLength) {
        throw new RangeError("Overdub requiere bytes SMF originales verificados en el proyecto");
      }
      const takeId = command.take.id;
      const existing = snapshot.takes.find((take) => take.id === takeId);
      const existingAsset = snapshot.assets.find((asset) => asset.id === command.asset.id);
      if (existing && (existing.kind !== "midi" || existing.recordingId !== command.take.recordingId ||
          existing.createdAt !== command.take.createdAt ||
          (existing.assetId !== undefined && existing.assetId !== command.asset.id) ||
          (existing.midiImport !== undefined &&
            JSON.stringify(existing.midiImport) !== JSON.stringify(command.take.midiImport)))) {
        throw new RangeError("La referencia de toma MIDI cambió");
      }
      if (existingAsset && JSON.stringify(existingAsset) !== JSON.stringify(command.asset)) {
        throw new RangeError("El activo SMF original cambió");
      }
      if (!existing && snapshot.takes.some((take) => take.kind === "midi" &&
          take.recordingId === command.take.recordingId)) {
        throw new RangeError("La toma MIDI ya tiene una referencia; reutiliza su ID");
      }
      for (let offset = 0; offset < previous.notes.length; offset++) {
        if (JSON.stringify(previous.notes[offset]) !== JSON.stringify(next.notes[offset])) {
          throw new RangeError("Overdub no debe modificar notas existentes");
        }
      }
      for (let offset = 0; offset < previous.expression.length; offset++) {
        if (JSON.stringify(previous.expression[offset]) !== JSON.stringify(next.expression[offset])) {
          throw new RangeError("Overdub no debe modificar expresión existente");
        }
      }
      const addedNotes = next.notes.slice(previous.notes.length);
      const addedExpression = next.expression.slice(previous.expression.length);
      if (addedNotes.length + addedExpression.length === 0 ||
          [...previous.notes, ...previous.expression].some((event) =>
            ("origin" in event ? event.origin.sourceTakeId : event.sourceTakeId) === takeId) ||
          addedNotes.some((note) => note.origin.sourceTakeId !== takeId) ||
          addedExpression.some((event) => event.sourceTakeId !== takeId)) {
        throw new RangeError("Procedencia de overdub ausente o duplicada en el patrón");
      }
      const replacement = structuredClone(next);
      document = { ...snapshot,
        patterns: snapshot.patterns.map((pattern, atIndex) => atIndex === index ? replacement : pattern),
        clips: snapshot.clips.map((clip) => clip.kind === "pattern" && clip.sourceId === replacement.id
          ? { ...clip, sourceVersion: replacement.version } : clip),
        assets: existingAsset ? snapshot.assets : [...snapshot.assets, structuredClone(command.asset)],
        takes: existing ? snapshot.takes.map((take) => take.id === takeId
          ? structuredClone(command.take) : take) : [...snapshot.takes, structuredClone(command.take)],
        updatedAt: command.at };
      inverse = { kind: "undoRecordedOverdub", expectedVersion: replacement.version,
        pattern: structuredClone(previous), take: structuredClone(command.take),
        asset: structuredClone(command.asset),
        ...(existing ? { previousTake: structuredClone(existing) } : {}),
        removeAssetIfUnused: !existingAsset, at: snapshot.updatedAt };
      break;
    }
    case "undoRecordedOverdub": {
      const index = snapshot.patterns.findIndex((pattern) => pattern.id === command.pattern.id);
      if (index < 0 || snapshot.patterns[index]!.version !== command.expectedVersion ||
          command.pattern.version !== command.expectedVersion - 1) {
        throw new RangeError("Patrón de overdub cambió antes de deshacer");
      }
      const currentTake = snapshot.takes.find((take) => take.id === command.take.id);
      const currentAsset = snapshot.assets.find((asset) => asset.id === command.asset.id);
      if (!currentTake || JSON.stringify(currentTake) !== JSON.stringify(command.take)) {
        throw new RangeError("Referencia de toma MIDI cambió antes de deshacer");
      }
      if (!currentAsset || JSON.stringify(currentAsset) !== JSON.stringify(command.asset)) {
        throw new RangeError("Activo SMF cambió antes de deshacer");
      }
      const current = snapshot.patterns[index]!;
      const restored = structuredClone(command.pattern);
      const patterns = snapshot.patterns.map((pattern, atIndex) => atIndex === index ? restored : pattern);
      const stillReferenced = patterns.some((pattern) => pattern.notes.some((note) =>
        note.origin.sourceTakeId === command.take.id) || pattern.expression.some((event) =>
        event.sourceTakeId === command.take.id));
      const takes = command.previousTake
        ? snapshot.takes.map((take) => take.id === command.take.id
          ? structuredClone(command.previousTake!) : take)
        : stillReferenced ? snapshot.takes
          : snapshot.takes.filter((take) => take.id !== command.take.id);
      const assetStillReferenced = takes.some((take) => take.assetId === command.asset.id) ||
        snapshot.clips.some((clip) => clip.kind === "audio" && clip.sourceId === command.asset.id) ||
        snapshot.tracks.some((track) => track.instrument?.presetId === `asset:${command.asset.id}` ||
          track.drumRack?.pads.some((pad) => pad.source?.kind === "asset" &&
            pad.source.assetId === command.asset.id));
      document = { ...snapshot, patterns,
        clips: snapshot.clips.map((clip) => clip.kind === "pattern" && clip.sourceId === restored.id
          ? { ...clip, sourceVersion: restored.version } : clip),
        takes,
        assets: command.removeAssetIfUnused && !assetStillReferenced
          ? snapshot.assets.filter((asset) => asset.id !== command.asset.id) : snapshot.assets,
        updatedAt: command.at };
      inverse = { kind: "overdubRecordedTake", expectedVersion: restored.version,
        pattern: structuredClone(current), take: structuredClone(command.take),
        asset: structuredClone(command.asset), at: snapshot.updatedAt };
      break;
    }
    case "createTrack": {
      const track = structuredClone(command.track);
      const orderIndex = indexFor(command.orderIndex, snapshot.trackOrder.length);
      const dataIndex = indexFor(command.dataIndex, snapshot.tracks.length);
      document = { ...snapshot, tracks: inserted(snapshot.tracks, track, dataIndex),
        trackOrder: inserted(snapshot.trackOrder, track.id, orderIndex), updatedAt: command.at };
      inverse = { kind: "removeTrack", trackId: track.id, at: snapshot.updatedAt };
      break;
    }
    case "removeTrack": {
      const dataIndex = snapshot.tracks.findIndex((track) => track.id === command.trackId);
      const orderIndex = snapshot.trackOrder.indexOf(command.trackId);
      if (dataIndex < 0 || orderIndex < 0) throw new RangeError("Pista inexistente");
      const track = snapshot.tracks[dataIndex]!;
      document = { ...snapshot, tracks: snapshot.tracks.filter((_, index) => index !== dataIndex),
        trackOrder: snapshot.trackOrder.filter((_, index) => index !== orderIndex), updatedAt: command.at };
      inverse = { kind: "createTrack", track: structuredClone(track), orderIndex, dataIndex, at: snapshot.updatedAt };
      break;
    }
    case "createPattern": {
      const pattern = structuredClone(command.pattern);
      document = { ...snapshot, patterns: inserted(snapshot.patterns, pattern, indexFor(command.index, snapshot.patterns.length)),
        updatedAt: command.at };
      inverse = { kind: "removePattern", patternId: pattern.id, at: snapshot.updatedAt };
      break;
    }
    case "removePattern": {
      const index = snapshot.patterns.findIndex((pattern) => pattern.id === command.patternId);
      if (index < 0) throw new RangeError("Patrón inexistente");
      document = { ...snapshot, patterns: snapshot.patterns.filter((_, atIndex) => atIndex !== index), updatedAt: command.at };
      inverse = { kind: "createPattern", pattern: structuredClone(snapshot.patterns[index]!), index, at: snapshot.updatedAt };
      break;
    }
    case "createClip": {
      const clip = structuredClone(command.clip);
      document = { ...snapshot, clips: inserted(snapshot.clips, clip, indexFor(command.index, snapshot.clips.length)),
        updatedAt: command.at };
      inverse = { kind: "removeClip", clipId: clip.id, at: snapshot.updatedAt };
      break;
    }
    case "removeClip": {
      const { clip, index } = clipAt(snapshot, command.clipId);
      document = { ...snapshot, clips: snapshot.clips.filter((_, atIndex) => atIndex !== index), updatedAt: command.at };
      inverse = { kind: "createClip", clip: structuredClone(clip), index, at: snapshot.updatedAt };
      break;
    }
    case "replaceClips": {
      assertExpected(snapshot.clips, command.expected, "Clips");
      const clips = structuredClone(command.clips);
      document = { ...snapshot, clips, updatedAt: command.at };
      inverse = { kind: "replaceClips", expected: clips, clips: structuredClone(snapshot.clips), at: snapshot.updatedAt };
      break;
    }
    case "replaceAudioArrangement": {
      assertExpected(snapshot.clips, command.expected.clips, "Clips de audio");
      if (JSON.stringify(snapshot.audioCrossfades) !== JSON.stringify(command.expected.audioCrossfades)) {
        throw new RangeError("Crossfades: snapshot desactualizado");
      }
      const previousPatternClips = snapshot.clips.filter((clip) => clip.kind === "pattern");
      const nextPatternClips = command.clips.filter((clip) => clip.kind === "pattern");
      if (JSON.stringify(previousPatternClips) !== JSON.stringify(nextPatternClips)) {
        throw new RangeError("replaceAudioArrangement sólo puede editar clips de audio");
      }
      const clips = structuredClone(command.clips);
      const audioCrossfades = command.audioCrossfades === undefined ? undefined :
        structuredClone(command.audioCrossfades);
      document = { ...snapshot, clips, updatedAt: command.at,
        ...(audioCrossfades === undefined ? {} : { audioCrossfades }) };
      if (audioCrossfades === undefined) {
        delete (document as { audioCrossfades?: readonly ProjectAudioCrossfade[] }).audioCrossfades;
      }
      inverse = { kind: "replaceAudioArrangement",
        expected: { clips, audioCrossfades }, clips: structuredClone(snapshot.clips),
        audioCrossfades: snapshot.audioCrossfades === undefined ? undefined :
          structuredClone(snapshot.audioCrossfades), at: snapshot.updatedAt };
      break;
    }
    case "replaceAudioComps": {
      if (JSON.stringify(snapshot.audioComps) !== JSON.stringify(command.expected)) {
        throw new RangeError("Comping: snapshot desactualizado");
      }
      const audioComps = command.comps === undefined ? undefined : structuredClone(command.comps);
      document = { ...snapshot, updatedAt: command.at,
        ...(audioComps === undefined ? {} : { audioComps }) };
      if (audioComps === undefined) {
        delete (document as { audioComps?: readonly ProjectAudioComp[] }).audioComps;
      }
      inverse = { kind: "replaceAudioComps", expected: audioComps,
        comps: snapshot.audioComps === undefined ? undefined : structuredClone(snapshot.audioComps),
        at: snapshot.updatedAt };
      break;
    }
    case "replaceAudioComposition": {
      assertExpected(snapshot.clips, command.expected.clips, "Clips de comping");
      if (JSON.stringify(snapshot.audioCrossfades) !== JSON.stringify(command.expected.audioCrossfades) ||
          JSON.stringify(snapshot.audioComps) !== JSON.stringify(command.expected.audioComps)) {
        throw new RangeError("Comping: snapshot desactualizado");
      }
      if (JSON.stringify(snapshot.clips.filter((clip) => clip.kind === "pattern")) !==
          JSON.stringify(command.clips.filter((clip) => clip.kind === "pattern"))) {
        throw new RangeError("Comping sólo puede editar clips de audio");
      }
      const clips = structuredClone(command.clips);
      const audioCrossfades = command.audioCrossfades === undefined ? undefined :
        structuredClone(command.audioCrossfades);
      const audioComps = command.audioComps === undefined ? undefined : structuredClone(command.audioComps);
      document = { ...snapshot, clips, updatedAt: command.at,
        ...(audioCrossfades === undefined ? {} : { audioCrossfades }),
        ...(audioComps === undefined ? {} : { audioComps }) };
      if (audioCrossfades === undefined) {
        delete (document as { audioCrossfades?: readonly ProjectAudioCrossfade[] }).audioCrossfades;
      }
      if (audioComps === undefined) {
        delete (document as { audioComps?: readonly ProjectAudioComp[] }).audioComps;
      }
      inverse = { kind: "replaceAudioComposition",
        expected: { clips, audioCrossfades, audioComps },
        clips: structuredClone(snapshot.clips),
        audioCrossfades: snapshot.audioCrossfades === undefined ? undefined :
          structuredClone(snapshot.audioCrossfades),
        audioComps: snapshot.audioComps === undefined ? undefined : structuredClone(snapshot.audioComps),
        at: snapshot.updatedAt };
      break;
    }
    case "splitAudioClip": {
      const { clip, index } = clipAt(snapshot, command.clipId);
      if (clip.kind !== "audio") throw new RangeError("Split requiere un clip de audio");
      if (snapshot.audioCrossfades?.some((fade) => fade.outgoingClipId === clip.id ||
          fade.incomingClipId === clip.id)) {
        throw new RangeError("Retira el crossfade antes de dividir el clip participante");
      }
      if (snapshot.audioComps?.some((comp) => comp.segments.some((segment) => segment.clipId === clip.id))) {
        throw new RangeError("Edita clip y comp juntos con replaceAudioComposition");
      }
      const asset = snapshot.assets.find((item) => item.id === clip.sourceId);
      if (!asset?.sampleRate || !asset.frameCount) {
        throw new RangeError("Split requiere frames y sample rate verificados del activo");
      }
      const clock = new MusicalClock(snapshot.tempoMap, snapshot.meterMap);
      const startTick = clip.startTick;
      const endTick = startTick + clip.lengthTicks;
      let splitTick: number;
      let splitUs: number | undefined;
      let secondsIntoSource: number;
      if (clip.timeMode === "absolute") {
        if (command.splitTick !== undefined || !Number.isSafeInteger(command.splitUs) ||
            command.splitUs! <= clip.absoluteStartUs! || command.splitUs! >= clip.absoluteEndUs!) {
          throw new RangeError("Split absoluto requiere µs dentro del clip");
        }
        splitUs = command.splitUs!;
        splitTick = clock.secondsToTick(splitUs / 1_000_000);
        secondsIntoSource = (splitUs - clip.absoluteStartUs!) / 1_000_000;
      } else {
        if (command.splitUs !== undefined || !Number.isSafeInteger(command.splitTick) ||
            command.splitTick! <= startTick || command.splitTick! >= endTick) {
          throw new RangeError("Split beat requiere tick dentro del clip");
        }
        splitTick = command.splitTick!;
        secondsIntoSource = clock.secondsBetween(startTick, splitTick);
      }
      if (splitTick <= startTick || splitTick >= endTick) {
        throw new RangeError("Split colapsa un lado del clip en la rejilla musical");
      }
      const cutFrame = clip.sourceStartFrame + Math.round(secondsIntoSource * asset.sampleRate);
      if (cutFrame <= clip.sourceStartFrame || cutFrame >= clip.sourceEndFrame) {
        throw new RangeError("Split fuera de los frames originales del clip");
      }
      const envelopeStartFrame = clip.envelopeStartFrame ?? clip.sourceStartFrame;
      const envelopeEndFrame = clip.envelopeEndFrame ?? clip.sourceEndFrame;
      const left: ProjectClip = { ...clip, lengthTicks: splitTick - startTick,
        sourceEndFrame: cutFrame, envelopeStartFrame, envelopeEndFrame,
        ...(splitUs === undefined ? {} : { absoluteEndUs: splitUs }) };
      const right: ProjectClip = { ...clip, id: command.newClipId, startTick: splitTick,
        lengthTicks: endTick - splitTick, sourceStartFrame: cutFrame,
        envelopeStartFrame, envelopeEndFrame,
        ...(splitUs === undefined ? {} : { absoluteStartUs: splitUs }) };
      const clips = [...snapshot.clips.slice(0, index), left, right, ...snapshot.clips.slice(index + 1)];
      document = { ...snapshot, clips, updatedAt: command.at };
      inverse = { kind: "replaceAudioArrangement",
        expected: { clips, audioCrossfades: snapshot.audioCrossfades },
        clips: structuredClone(snapshot.clips), audioCrossfades: snapshot.audioCrossfades,
        at: snapshot.updatedAt };
      break;
    }
    case "replaceScenes": {
      assertExpected(snapshot.scenes, command.expected, "Escenas");
      const scenes = structuredClone(command.scenes);
      document = { ...snapshot, scenes, updatedAt: command.at };
      inverse = { kind: "replaceScenes", expected: scenes, scenes: structuredClone(snapshot.scenes), at: snapshot.updatedAt };
      break;
    }
    case "replaceSections": {
      assertExpected(snapshot.sections, command.expected, "Secciones");
      const sections = structuredClone(command.sections);
      document = { ...snapshot, sections, updatedAt: command.at };
      inverse = { kind: "replaceSections", expected: sections, sections: structuredClone(snapshot.sections), at: snapshot.updatedAt };
      break;
    }
    case "replaceArrangement": {
      assertExpected(snapshot.clips, command.expected.clips, "Clips");
      assertExpected(snapshot.sections, command.expected.sections, "Secciones");
      assertExpected(snapshot.automation, command.expected.automation, "Automatización");
      const clips = structuredClone(command.clips);
      const sections = structuredClone(command.sections);
      const automation = structuredClone(command.automation);
      document = { ...snapshot, clips, sections, automation, updatedAt: command.at };
      inverse = { kind: "replaceArrangement", expected: { clips, sections, automation },
        clips: structuredClone(snapshot.clips), sections: structuredClone(snapshot.sections),
        automation: structuredClone(snapshot.automation), at: snapshot.updatedAt };
      break;
    }
    case "replaceFullArrangement": {
      assertExpected(snapshot.clips, command.expected.clips, "Clips");
      assertExpected(snapshot.sections, command.expected.sections, "Secciones");
      assertExpected(snapshot.automation, command.expected.automation, "Automatización");
      if (JSON.stringify(snapshot.audioCrossfades) !==
          JSON.stringify(command.expected.audioCrossfades) ||
          JSON.stringify(snapshot.audioComps) !== JSON.stringify(command.expected.audioComps)) {
        throw new RangeError("Relaciones de audio: snapshot desactualizado");
      }
      const clips = structuredClone(command.clips);
      const sections = structuredClone(command.sections);
      const automation = structuredClone(command.automation);
      const audioCrossfades = command.audioCrossfades === undefined ? undefined :
        structuredClone(command.audioCrossfades);
      const audioComps = command.audioComps === undefined ? undefined :
        structuredClone(command.audioComps);
      document = { ...snapshot, clips, sections, automation, updatedAt: command.at,
        ...(audioCrossfades === undefined ? {} : { audioCrossfades }),
        ...(audioComps === undefined ? {} : { audioComps }) };
      if (audioCrossfades === undefined) {
        delete (document as { audioCrossfades?: readonly ProjectAudioCrossfade[] }).audioCrossfades;
      }
      if (audioComps === undefined) {
        delete (document as { audioComps?: readonly ProjectAudioComp[] }).audioComps;
      }
      inverse = { kind: "replaceFullArrangement",
        expected: { clips, sections, automation, audioCrossfades, audioComps },
        clips: structuredClone(snapshot.clips), sections: structuredClone(snapshot.sections),
        automation: structuredClone(snapshot.automation),
        audioCrossfades: snapshot.audioCrossfades === undefined ? undefined :
          structuredClone(snapshot.audioCrossfades),
        audioComps: snapshot.audioComps === undefined ? undefined :
          structuredClone(snapshot.audioComps), at: snapshot.updatedAt };
      break;
    }
    case "replaceAutomationLane": {
      const index = snapshot.automation.findIndex((lane) => lane.id === command.laneId);
      const current = index < 0 ? null : snapshot.automation[index]!;
      if (JSON.stringify(current) !== JSON.stringify(command.expected)) {
        throw new RangeError("Curva de automatización: snapshot desactualizado");
      }
      if (command.lane !== null && command.lane.id !== command.laneId) {
        throw new RangeError("La curva cambió de identidad");
      }
      if (current === null && command.lane === null) throw new RangeError("Curva inexistente");
      const lane = command.lane === null ? null : structuredClone(command.lane);
      const insertion = current === null ? indexFor(command.index, snapshot.automation.length) : index;
      const automation = current === null ? inserted(snapshot.automation, lane!, insertion)
        : lane === null ? snapshot.automation.filter((_, atIndex) => atIndex !== index)
          : snapshot.automation.map((item, atIndex) => atIndex === index ? lane : item);
      document = { ...snapshot, automation, updatedAt: command.at };
      inverse = { kind: "replaceAutomationLane", laneId: command.laneId,
        expected: lane, lane: current === null ? null : structuredClone(current),
        ...(current === null ? {} : { index }), at: snapshot.updatedAt };
      break;
    }
    case "duplicateClip": {
      const { clip, index } = clipAt(snapshot, command.clipId);
      if (snapshot.automation.some((lane) => lane.target.scope === "clip" &&
          lane.target.ownerId === clip.id)) {
        throw new RangeError("Duplica clip y sus curvas juntos con duplicateClipWithAutomation");
      }
      const copy = cloneClipAt(snapshot, clip, command.newClipId, command.startTick,
        command.absoluteStartUs);
      document = { ...snapshot, clips: inserted(snapshot.clips, copy, index + 1), updatedAt: command.at };
      inverse = { kind: "removeClip", clipId: copy.id, at: snapshot.updatedAt };
      break;
    }
    case "duplicateClipWithAutomation": {
      const { clip, index } = clipAt(snapshot, command.clipId);
      const sourceLanes = snapshot.automation.filter((lane) => lane.target.scope === "clip" &&
        lane.target.ownerId === clip.id);
      if (JSON.stringify(clip) !== JSON.stringify(command.expectedClip) ||
          JSON.stringify(sourceLanes) !== JSON.stringify(command.expectedLanes)) {
        throw new RangeError("Clip o curvas cambiaron antes de duplicar");
      }
      if (sourceLanes.length !== command.newLaneIds.length ||
          sourceLanes.length !== command.newPointIds.length ||
          sourceLanes.some((lane, laneIndex) =>
            lane.points.length !== command.newPointIds[laneIndex]?.length)) {
        throw new RangeError("Faltan IDs nuevos de curvas o puntos para duplicar");
      }
      const copy = cloneClipAt(snapshot, clip, command.newClipId, command.startTick,
        command.absoluteStartUs);
      const copiedLanes = sourceLanes.map((lane, laneIndex): ProjectAutomationLane => ({
        ...structuredClone(lane), id: command.newLaneIds[laneIndex]!,
        target: { ...lane.target, ownerId: copy.id },
        points: lane.points.map((point, pointIndex) => ({ ...point,
          id: command.newPointIds[laneIndex]![pointIndex]! })),
      }));
      const bySourceId = new Map(sourceLanes.map((lane, laneIndex) =>
        [lane.id, copiedLanes[laneIndex]!]));
      const clips = inserted(snapshot.clips, copy, index + 1);
      const automation = snapshot.automation.flatMap((lane) => {
        const duplicate = bySourceId.get(lane.id);
        return duplicate ? [lane, duplicate] : [lane];
      });
      document = { ...snapshot, clips, automation, updatedAt: command.at };
      inverse = { kind: "replaceArrangement",
        expected: { clips, sections: snapshot.sections, automation },
        clips: structuredClone(snapshot.clips), sections: structuredClone(snapshot.sections),
        automation: structuredClone(snapshot.automation), at: snapshot.updatedAt };
      break;
    }
    case "makeClipUnique": {
      const { clip, index } = clipAt(snapshot, command.clipId);
      if (clip.kind !== "pattern") throw new RangeError("Sólo un clip de patrón puede hacerse único");
      const source = snapshot.patterns.find((pattern) => pattern.id === clip.sourceId);
      if (!source) throw new RangeError("Patrón fuente inexistente");
      if (command.noteIds.length !== source.notes.length || command.expressionIds.length !== source.expression.length) {
        throw new RangeError("Faltan IDs para clonar notas o controladores");
      }
      const oldSteps = new Set(source.notes.map((note) => note.stepId).filter((step): step is string => step !== undefined));
      const suppliedSteps = Object.keys(command.stepIds);
      if (suppliedSteps.length !== oldSteps.size || suppliedSteps.some((step) => !oldSteps.has(step) || command.stepIds[step] === step) ||
          new Set(Object.values(command.stepIds)).size !== oldSteps.size) {
        throw new RangeError("Mapa de IDs de pasos incompleto o duplicado");
      }
      const pattern: ProjectPattern = {
        ...source, id: command.newPatternId, version: 1,
        notes: source.notes.map((note, atIndex) => ({ ...structuredClone(note), id: command.noteIds[atIndex]!,
          ...(note.stepId === undefined ? {} : { stepId: command.stepIds[note.stepId]! }) })),
        expression: source.expression.map((event, atIndex) => ({ ...structuredClone(event), id: command.expressionIds[atIndex]! })),
      };
      document = { ...snapshot, patterns: [...snapshot.patterns, pattern],
        clips: snapshot.clips.map((item, atIndex) => atIndex === index
          ? { ...item, sourceId: pattern.id, sourceVersion: pattern.version } : item), updatedAt: command.at };
      inverse = { kind: "restoreClipSource", clipId: clip.id, originalPatternId: source.id,
        originalVersion: clip.sourceVersion, uniquePatternId: pattern.id, at: snapshot.updatedAt };
      break;
    }
    case "restoreClipSource": {
      const { clip, index } = clipAt(snapshot, command.clipId);
      if (clip.kind !== "pattern" || clip.sourceId !== command.uniquePatternId) throw new RangeError("Clip único inesperado");
      const pattern = snapshot.patterns.find((item) => item.id === command.uniquePatternId);
      if (!pattern) throw new RangeError("Patrón único inexistente");
      document = { ...snapshot, patterns: snapshot.patterns.filter((item) => item.id !== pattern.id),
        clips: snapshot.clips.map((item, atIndex) => atIndex === index
          ? { ...item, sourceId: command.originalPatternId, sourceVersion: command.originalVersion } : item),
        updatedAt: command.at };
      inverse = { kind: "installUniquePattern", clipId: clip.id, originalPatternId: command.originalPatternId,
        originalVersion: command.originalVersion, pattern: structuredClone(pattern), at: snapshot.updatedAt };
      break;
    }
    case "installUniquePattern": {
      const { clip, index } = clipAt(snapshot, command.clipId);
      if (clip.kind !== "pattern" || clip.sourceId !== command.originalPatternId ||
          clip.sourceVersion !== command.originalVersion) throw new RangeError("Fuente del clip cambió");
      const pattern = structuredClone(command.pattern);
      document = { ...snapshot, patterns: [...snapshot.patterns, pattern],
        clips: snapshot.clips.map((item, atIndex) => atIndex === index
          ? { ...item, sourceId: pattern.id, sourceVersion: pattern.version } : item), updatedAt: command.at };
      inverse = { kind: "restoreClipSource", clipId: clip.id, originalPatternId: command.originalPatternId,
        originalVersion: command.originalVersion, uniquePatternId: pattern.id, at: snapshot.updatedAt };
      break;
    }
    case "importRecordedTake": {
      if (command.take.kind !== "midi" || !command.take.midiImport ||
          command.tracks.length < 1 || command.tracks.length > 2 ||
          command.tracks.length !== command.patterns.length || command.tracks.length !== command.clips.length) {
        throw new RangeError("Lote de toma MIDI inválido");
      }
      for (let index = 0; index < command.tracks.length; index++) {
        const track = command.tracks[index]!;
        const pattern = command.patterns[index]!;
        const clip = command.clips[index]!;
        const drum = track.kind === "drum";
        if ((!drum && track.kind !== "instrument") ||
            track.instrument?.instrumentId !== (drum ? "virtuosity-core" : "salamander-grand") ||
            clip.kind !== "pattern" || clip.trackId !== track.id || clip.sourceId !== pattern.id ||
            clip.sourceVersion !== pattern.version ||
            [...pattern.notes, ...pattern.expression].some((event) => (event.channel === 9) !== drum)) {
          throw new RangeError("La toma debe separar canal 10 en Virtuosity y los demás en Salamander");
        }
      }
      const tracks = structuredClone(command.tracks);
      const patterns = structuredClone(command.patterns);
      const clips = structuredClone(command.clips);
      const take = structuredClone(command.take);
      document = { ...snapshot, tracks: [...snapshot.tracks, ...tracks],
        trackOrder: [...snapshot.trackOrder, ...tracks.map((track) => track.id)],
        patterns: [...snapshot.patterns, ...patterns], clips: [...snapshot.clips, ...clips],
        takes: [...snapshot.takes, take], updatedAt: command.at };
      inverse = { kind: "removeImportedTake", takeId: take.id,
        trackIds: tracks.map((track) => track.id), patternIds: patterns.map((pattern) => pattern.id),
        clipIds: clips.map((clip) => clip.id), at: snapshot.updatedAt };
      break;
    }
    case "removeImportedTake": {
      const take = snapshot.takes.find((item) => item.id === command.takeId);
      const tracks = command.trackIds.map((trackId) => snapshot.tracks.find((item) => item.id === trackId));
      const patterns = command.patternIds.map((patternId) => snapshot.patterns.find((item) => item.id === patternId));
      const clips = command.clipIds.map((clipId) => snapshot.clips.find((item) => item.id === clipId));
      if (!take || tracks.some((item) => !item) || patterns.some((item) => !item) || clips.some((item) => !item) ||
          command.trackIds.length !== command.patternIds.length ||
          command.trackIds.length !== command.clipIds.length) {
        throw new RangeError("La toma importada ya no está completa");
      }
      const trackIds = new Set(command.trackIds);
      const patternIds = new Set(command.patternIds);
      const clipIds = new Set(command.clipIds);
      document = { ...snapshot, tracks: snapshot.tracks.filter((track) => !trackIds.has(track.id)),
        trackOrder: snapshot.trackOrder.filter((trackId) => !trackIds.has(trackId)),
        patterns: snapshot.patterns.filter((pattern) => !patternIds.has(pattern.id)),
        clips: snapshot.clips.filter((clip) => !clipIds.has(clip.id)),
        takes: snapshot.takes.filter((item) => item.id !== take.id), updatedAt: command.at };
      inverse = { kind: "importRecordedTake", take: structuredClone(take),
        tracks: structuredClone(tracks as ProjectTrack[]),
        patterns: structuredClone(patterns as ProjectPattern[]),
        clips: structuredClone(clips as ProjectClip[]), at: snapshot.updatedAt };
      break;
    }
    case "installUserSample": {
      const { asset, track, pattern, clip } = command;
      if ((asset.sourceKind !== "user" && asset.sourceKind !== "recorded") ||
          track.kind !== "instrument" || track.instrument?.instrumentId !== "user-sampler" ||
          track.instrument.presetId !== `asset:${asset.id}` ||
          track.instrument.packageVersion !== `sha256:${asset.sha256.toLowerCase()}` ||
          clip.kind !== "pattern" || clip.trackId !== track.id || clip.sourceId !== pattern.id ||
          clip.sourceVersion !== pattern.version) {
        throw new RangeError("Instalación de muestra sin referencias coherentes");
      }
      document = { ...snapshot, assets: [...snapshot.assets, structuredClone(asset)],
        tracks: [...snapshot.tracks, structuredClone(track)], trackOrder: [...snapshot.trackOrder, track.id],
        patterns: [...snapshot.patterns, structuredClone(pattern)], clips: [...snapshot.clips, structuredClone(clip)],
        updatedAt: command.at };
      inverse = { kind: "removeInstalledUserSample", assetId: asset.id, trackId: track.id,
        patternId: pattern.id, clipId: clip.id, at: snapshot.updatedAt };
      break;
    }
    case "removeInstalledUserSample": {
      const asset = snapshot.assets.find((item) => item.id === command.assetId);
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      const pattern = snapshot.patterns.find((item) => item.id === command.patternId);
      const clip = snapshot.clips.find((item) => item.id === command.clipId);
      if (!asset || !track || !pattern || !clip) throw new RangeError("Muestra instalada incompleta");
      document = { ...snapshot,
        assets: snapshot.assets.filter((item) => item.id !== asset.id),
        tracks: snapshot.tracks.filter((item) => item.id !== track.id),
        trackOrder: snapshot.trackOrder.filter((item) => item !== track.id),
        patterns: snapshot.patterns.filter((item) => item.id !== pattern.id),
        clips: snapshot.clips.filter((item) => item.id !== clip.id),
        updatedAt: command.at };
      inverse = { kind: "installUserSample", asset: structuredClone(asset), track: structuredClone(track),
        pattern: structuredClone(pattern), clip: structuredClone(clip), at: snapshot.updatedAt };
      break;
    }
    case "replaceSampleRegion": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      if (!track || track.kind !== "instrument" || track.instrument?.instrumentId !== "user-sampler") {
        throw new RangeError("Pista sampler propia inexistente");
      }
      const { sampleRegion: previous, ...base } = track.instrument;
      if (JSON.stringify(previous) !== JSON.stringify(command.expected)) {
        throw new RangeError("Región de muestra: snapshot desactualizado");
      }
      const instrument: ProjectInstrumentRef = command.region === undefined ? base
        : { ...base, sampleRegion: structuredClone(command.region) };
      document = { ...snapshot, tracks: snapshot.tracks.map((item) => item.id === track.id
        ? { ...item, instrument } : item), updatedAt: command.at };
      inverse = { kind: "replaceSampleRegion", trackId: track.id,
        expected: command.region === undefined ? undefined : structuredClone(command.region),
        region: previous === undefined ? undefined : structuredClone(previous), at: snapshot.updatedAt };
      break;
    }
    case "replaceSampleVoice": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      if (!track || track.kind !== "instrument" || track.instrument?.instrumentId !== "user-sampler") {
        throw new RangeError("Pista sampler propia inexistente");
      }
      const { sampleVoice: previous, ...base } = track.instrument;
      if (JSON.stringify(previous) !== JSON.stringify(command.expected)) {
        throw new RangeError("Política de voz: snapshot desactualizado");
      }
      const instrument: ProjectInstrumentRef = command.voice === undefined ? base
        : { ...base, sampleVoice: structuredClone(command.voice) };
      document = { ...snapshot, tracks: snapshot.tracks.map((item) => item.id === track.id
        ? { ...item, instrument } : item), updatedAt: command.at };
      inverse = { kind: "replaceSampleVoice", trackId: track.id,
        expected: command.voice === undefined ? undefined : structuredClone(command.voice),
        voice: previous === undefined ? undefined : structuredClone(previous), at: snapshot.updatedAt };
      break;
    }
    case "replaceDrumRack": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      if (!track || track.kind !== "drum") throw new RangeError("Pista de batería inexistente");
      const { drumRack: previous, ...base } = track;
      if (JSON.stringify(previous) !== JSON.stringify(command.expected)) {
        throw new RangeError("Rack de batería: snapshot desactualizado");
      }
      assertStablePadIds(previous, command.rack);
      const next: ProjectTrack = command.rack === undefined ? base :
        { ...base, drumRack: structuredClone(command.rack) };
      document = { ...snapshot, tracks: snapshot.tracks.map((item) => item.id === track.id ? next : item),
        updatedAt: command.at };
      inverse = { kind: "replaceDrumRack", trackId: track.id,
        expected: command.rack === undefined ? undefined : structuredClone(command.rack),
        rack: previous === undefined ? undefined : structuredClone(previous), at: snapshot.updatedAt };
      break;
    }
    case "replaceDrumRackPatterns": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      if (!track || track.kind !== "drum") throw new RangeError("Pista de batería inexistente");
      const { drumRack: previousRack, ...base } = track;
      if (JSON.stringify(previousRack) !== JSON.stringify(command.expectedRack)) {
        throw new RangeError("Rack de batería: snapshot desactualizado");
      }
      assertStablePadIds(previousRack, command.rack);
      if (command.patterns.length > 100_000) throw new RangeError("Demasiados patrones de batería");
      const replacements = new Map<string, ProjectPattern>();
      const inversePatterns: { expectedVersion: number; pattern: ProjectPattern }[] = [];
      for (const item of command.patterns) {
        const previous = snapshot.patterns.find((pattern) => pattern.id === item.pattern.id);
        if (!previous || replacements.has(previous.id) || previous.version !== item.expectedVersion ||
            Math.abs(item.pattern.version - previous.version) !== 1) {
          throw new RangeError("Patrón de batería o versión inesperada");
        }
        replacements.set(previous.id, structuredClone(item.pattern));
        inversePatterns.push({ expectedVersion: item.pattern.version, pattern: structuredClone(previous) });
      }
      const rack = command.rack === undefined ? undefined : structuredClone(command.rack);
      document = { ...snapshot,
        tracks: snapshot.tracks.map((item) => item.id === track.id
          ? (rack === undefined ? base : { ...base, drumRack: rack }) : item),
        patterns: snapshot.patterns.map((pattern) => replacements.get(pattern.id) ?? pattern),
        clips: snapshot.clips.map((clip) => {
          const replacement = clip.kind === "pattern" ? replacements.get(clip.sourceId) : undefined;
          return replacement ? { ...clip, sourceVersion: replacement.version } : clip;
        }), updatedAt: command.at };
      inverse = { kind: "replaceDrumRackPatterns", trackId: track.id,
        expectedRack: rack, rack: previousRack === undefined ? undefined : structuredClone(previousRack),
        patterns: inversePatterns, at: snapshot.updatedAt };
      break;
    }
    case "installSampleSlices": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      if (!track || track.kind !== "drum" || !track.drumRack) {
        throw new RangeError("Slicing requiere una pista con rack de 16 pads");
      }
      if (track.drumRack !== command.expectedRack &&
          JSON.stringify(track.drumRack) !== JSON.stringify(command.expectedRack)) {
        throw new RangeError("Rack de slicing: snapshot desactualizado");
      }
      const asset = command.asset;
      const frameCount = asset.frameCount;
      if ((asset.sourceKind !== "user" && asset.sourceKind !== "recorded") ||
          !asset.mimeType.startsWith("audio/") || asset.mimeType === "audio/midi" ||
          typeof frameCount !== "number" || !Number.isSafeInteger(frameCount) || frameCount < 1 ||
          !Number.isSafeInteger(asset.sampleRate) || !Number.isSafeInteger(asset.channelCount)) {
        throw new RangeError("Slicing requiere audio propio con frames y formato verificados");
      }
      const existing = snapshot.assets.find((item) => item.id === asset.id);
      if (existing && !sameAssetRef(existing, asset)) {
        throw new RangeError("Activo de slicing existente con metadatos diferentes");
      }
      if (command.slices.length < 1 || command.slices.length > 16) {
        throw new RangeError("Slicing requiere entre 1 y 16 cortes asignados a pads");
      }
      const byPad = new Map<string, { readonly startFrame: number; readonly endFrame: number }>();
      for (const slice of command.slices) {
        if (byPad.has(slice.padId) || !track.drumRack.pads.some((pad) => pad.id === slice.padId) ||
            !Number.isSafeInteger(slice.startFrame) || !Number.isSafeInteger(slice.endFrame) ||
            slice.startFrame < 0 || slice.endFrame <= slice.startFrame ||
            slice.endFrame > frameCount) {
          throw new RangeError("Corte de muestra duplicado, inexistente o fuera de frames");
        }
        byPad.set(slice.padId, slice);
      }
      const rack: ProjectDrumRack = { pads: track.drumRack.pads.map((pad) => {
        const slice = byPad.get(pad.id);
        return slice ? { ...pad, source: { kind: "asset" as const,
          assetId: asset.id, sha256: asset.sha256 }, startFrame: slice.startFrame,
          endFrame: slice.endFrame } : pad;
      }) };
      document = { ...snapshot,
        assets: existing ? snapshot.assets : [...snapshot.assets, structuredClone(asset)],
        tracks: snapshot.tracks.map((item) => item.id === track.id ? { ...item, drumRack: rack } : item),
        updatedAt: command.at };
      inverse = { kind: "restoreSampleSlices", trackId: track.id,
        expectedRack: structuredClone(rack), rack: structuredClone(track.drumRack),
        asset: structuredClone(asset), slices: structuredClone(command.slices),
        removeAssetIfUnused: !existing, at: snapshot.updatedAt };
      break;
    }
    case "restoreSampleSlices": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      const asset = snapshot.assets.find((item) => item.id === command.asset.id);
      if (!track || track.kind !== "drum" || !track.drumRack || !asset ||
          !sameAssetRef(asset, command.asset) ||
          JSON.stringify(track.drumRack) !== JSON.stringify(command.expectedRack)) {
        throw new RangeError("Slicing cambió antes de deshacer");
      }
      assertStablePadIds(track.drumRack, command.rack);
      const tracks = snapshot.tracks.map((item) => item.id === track.id
        ? { ...item, drumRack: structuredClone(command.rack) } : item);
      const stillUsed = snapshot.takes.some((take) => take.assetId === asset.id) ||
        snapshot.clips.some((clip) => clip.kind === "audio" && clip.sourceId === asset.id) ||
        tracks.some((item) => item.instrument?.presetId === `asset:${asset.id}` ||
          item.drumRack?.pads.some((pad) => pad.source?.kind === "asset" && pad.source.assetId === asset.id));
      document = { ...snapshot, tracks,
        assets: command.removeAssetIfUnused && !stillUsed
          ? snapshot.assets.filter((item) => item.id !== asset.id) : snapshot.assets,
        updatedAt: command.at };
      inverse = { kind: "installSampleSlices", trackId: track.id,
        expectedRack: structuredClone(command.rack), asset: structuredClone(asset),
        slices: structuredClone(command.slices), at: snapshot.updatedAt };
      break;
    }
    case "replaceTrackInstrument": {
      const track = snapshot.tracks.find((item)=>item.id===command.trackId);
      if (!track || track.kind !== "instrument") {
        throw new RangeError("Sólo las pistas de instrumento pueden cambiar de banco");
      }
      if (JSON.stringify(track.instrument) !== JSON.stringify(command.expected)) {
        throw new RangeError("Instrumento de pista: revisión desactualizada");
      }
      if (command.instrument && (!command.instrument.instrumentId || !command.instrument.packageVersion ||
          !command.instrument.presetId)) {
        throw new RangeError("Referencia de instrumento incompleta");
      }
      const next = command.instrument ? structuredClone(command.instrument) : undefined;
      document = { ...snapshot,
        tracks: snapshot.tracks.map((item)=>item.id===track.id
          ? {...item,instrument:next} : item),
        updatedAt: command.at };
      inverse = {kind:"replaceTrackInstrument",trackId:track.id,
        expected:next, instrument:track.instrument ? structuredClone(track.instrument) : undefined,
        at:snapshot.updatedAt};
      break;
    }
    case "replaceTrackMix": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      if (!track) throw new RangeError("Pista de mezcla inexistente");
      if (track.mix !== command.expected && JSON.stringify(track.mix) !== JSON.stringify(command.expected)) {
        throw new RangeError("Mezcla de pista: snapshot desactualizado");
      }
      document = { ...snapshot, tracks: snapshot.tracks.map((item) => item.id === track.id
        ? { ...item, mix: structuredClone(command.mix) } : item), updatedAt: command.at };
      inverse = { kind: "replaceTrackMix", trackId: track.id,
        expected: structuredClone(command.mix), mix: structuredClone(track.mix), at: snapshot.updatedAt };
      break;
    }
    case "replaceMasterMix": {
      if (snapshot.mix !== command.expected && JSON.stringify(snapshot.mix) !== JSON.stringify(command.expected)) {
        throw new RangeError("Mezcla maestra: snapshot desactualizado");
      }
      document = { ...snapshot, mix: structuredClone(command.mix), updatedAt: command.at };
      inverse = { kind: "replaceMasterMix", expected: structuredClone(command.mix),
        mix: structuredClone(snapshot.mix), at: snapshot.updatedAt };
      break;
    }
    case "replaceTrackEffects": {
      const track = snapshot.tracks.find((item) => item.id === command.trackId);
      if (!track) throw new RangeError("Pista de efectos inexistente");
      assertExpected(track.mix.effects, command.expected, "Efectos de pista");
      const effects = structuredClone(command.effects);
      document = { ...snapshot, tracks: snapshot.tracks.map((item) => item.id === track.id
        ? { ...item, mix: { ...item.mix, effects } } : item), updatedAt: command.at };
      inverse = { kind: "replaceTrackEffects", trackId: track.id,
        expected: effects, effects: structuredClone(track.mix.effects), at: snapshot.updatedAt };
      break;
    }
    case "replaceMasterEffects": {
      assertExpected(snapshot.mix.masterEffects, command.expected, "Efectos maestros");
      const effects = structuredClone(command.effects);
      document = { ...snapshot, mix: { ...snapshot.mix, masterEffects: effects }, updatedAt: command.at };
      inverse = { kind: "replaceMasterEffects", expected: effects,
        effects: structuredClone(snapshot.mix.masterEffects), at: snapshot.updatedAt };
      break;
    }
    case "setAudioTakeLatency": {
      const take = snapshot.takes.find((item) => item.id === command.takeId);
      const capture = take?.audioCapture;
      if (!take || take.kind !== "audio" || !capture || !take.assetId) {
        throw new RangeError("Toma de audio para latencia inexistente");
      }
      if (capture.latencyOffsetFrames !== command.expectedOffsetFrames) {
        throw new RangeError("Latencia de toma: snapshot desactualizado");
      }
      if (!Number.isSafeInteger(command.offsetFrames) ||
          Math.abs(command.offsetFrames) > 2 * capture.sampleRate) {
        throw new RangeError("Latencia fuera de ±2 segundos en frames");
      }
      const baseline = capture.capturedLatencyOffsetFrames ?? capture.latencyOffsetFrames;
      if (command.restoreCapturedFieldAbsent && command.offsetFrames !== baseline) {
        throw new RangeError("Restaurar latencia capturada requiere el valor original");
      }
      const nextCapture = { ...capture, latencyOffsetFrames: command.offsetFrames,
        capturedLatencyOffsetFrames: baseline };
      if (command.restoreCapturedFieldAbsent) {
        delete (nextCapture as { capturedLatencyOffsetFrames?: number }).capturedLatencyOffsetFrames;
      }
      const clock = new MusicalClock(snapshot.tempoMap, snapshot.meterMap);
      const deltaUs = Math.round((capture.latencyOffsetFrames - command.offsetFrames) *
        1_000_000 / capture.sampleRate);
      const clips = snapshot.clips.map((clip) => {
        if (clip.kind !== "audio" || clip.sourceTakeId !== take.id) return clip;
        if (clip.timeMode !== "absolute") {
          throw new RangeError("Latencia por toma requiere clips absolute vinculados");
        }
        const absoluteStartUs = clip.absoluteStartUs! + deltaUs;
        const absoluteEndUs = clip.absoluteEndUs! + deltaUs;
        if (absoluteStartUs < 0 || !Number.isSafeInteger(absoluteEndUs)) {
          throw new RangeError("Compensación requiere pre-roll antes del inicio del proyecto");
        }
        const startTick = clock.secondsToTick(absoluteStartUs / 1_000_000);
        const endTick = clock.secondsToTick(absoluteEndUs / 1_000_000);
        if (endTick <= startTick) throw new RangeError("Compensación colapsa el clip en ticks");
        return { ...clip, absoluteStartUs, absoluteEndUs,
          startTick, lengthTicks: endTick - startTick };
      });
      document = { ...snapshot, clips,
        takes: snapshot.takes.map((item) => item.id === take.id
          ? { ...item, audioCapture: nextCapture } : item), updatedAt: command.at };
      inverse = { kind: "setAudioTakeLatency", takeId: take.id,
        expectedOffsetFrames: command.offsetFrames,
        offsetFrames: capture.latencyOffsetFrames,
        ...(capture.capturedLatencyOffsetFrames === undefined
          ? { restoreCapturedFieldAbsent: true } : {}), at: snapshot.updatedAt };
      break;
    }
    case "addAudioTake": {
      const { asset, take, clip } = command;
      const track = snapshot.tracks.find((item) => item.id === clip.trackId);
      if (asset.sourceKind !== "recorded" || take.kind !== "audio" || !take.audioCapture ||
          take.assetId !== asset.id || clip.kind !== "audio" || clip.sourceId !== asset.id ||
          track?.kind !== "audio") {
        throw new RangeError("Toma de audio sin pista, activo o captura coherentes");
      }
      document = { ...snapshot, assets: [...snapshot.assets, structuredClone(asset)],
        takes: [...snapshot.takes, structuredClone(take)],
        clips: [...snapshot.clips, structuredClone(clip)], updatedAt: command.at };
      inverse = { kind: "removeAudioTake", assetId: asset.id, takeId: take.id,
        clipId: clip.id, at: snapshot.updatedAt };
      break;
    }
    case "removeAudioTake": {
      const asset = snapshot.assets.find((item) => item.id === command.assetId);
      const take = snapshot.takes.find((item) => item.id === command.takeId);
      const clip = snapshot.clips.find((item) => item.id === command.clipId);
      if (!asset || !take || !clip) throw new RangeError("Toma de audio instalada incompleta");
      document = { ...snapshot, assets: snapshot.assets.filter((item) => item.id !== asset.id),
        takes: snapshot.takes.filter((item) => item.id !== take.id),
        clips: snapshot.clips.filter((item) => item.id !== clip.id), updatedAt: command.at };
      inverse = { kind: "addAudioTake", asset: structuredClone(asset), take: structuredClone(take),
        clip: structuredClone(clip), at: snapshot.updatedAt };
      break;
    }
    case "installRecordedAudioTake": {
      const { asset, take, clip, track } = command;
      const target = track ?? snapshot.tracks.find((item) => item.id === clip.trackId);
      if (asset.sourceKind !== "recorded" || take.kind !== "audio" || !take.audioCapture ||
          take.assetId !== asset.id || clip.sourceId !== asset.id ||
          target?.kind !== "audio" || target.id !== clip.trackId ||
          (track !== undefined && snapshot.tracks.some((item) => item.id === track.id))) {
        throw new RangeError("Instalación de toma de audio incoherente");
      }
      document = { ...snapshot,
        assets: [...snapshot.assets, structuredClone(asset)],
        takes: [...snapshot.takes, structuredClone(take)],
        clips: [...snapshot.clips, structuredClone(clip)],
        tracks: track === undefined ? snapshot.tracks : [...snapshot.tracks, structuredClone(track)],
        trackOrder: track === undefined ? snapshot.trackOrder : [...snapshot.trackOrder, track.id],
        updatedAt: command.at };
      inverse = { kind: "removeInstalledRecordedAudioTake", assetId: asset.id,
        takeId: take.id, clipId: clip.id, ...(track === undefined ? {} : { trackId: track.id }),
        at: snapshot.updatedAt };
      break;
    }
    case "removeInstalledRecordedAudioTake": {
      const asset = snapshot.assets.find((item) => item.id === command.assetId);
      const take = snapshot.takes.find((item) => item.id === command.takeId);
      const clip = snapshot.clips.find((item) => item.id === command.clipId);
      const track = command.trackId === undefined ? undefined :
        snapshot.tracks.find((item) => item.id === command.trackId);
      if (!asset || !take || !clip ||
          (command.trackId !== undefined && (!track || track.id !== clip.trackId)) ||
          take.kind !== "audio" || clip.kind !== "audio" ||
          take.assetId !== asset.id || clip.sourceId !== asset.id) {
        throw new RangeError("Toma grabada incompleta o modificada");
      }
      document = { ...snapshot,
        assets: snapshot.assets.filter((item) => item.id !== asset.id),
        takes: snapshot.takes.filter((item) => item.id !== take.id),
        clips: snapshot.clips.filter((item) => item.id !== clip.id),
        tracks: track === undefined ? snapshot.tracks : snapshot.tracks.filter((item) => item.id !== track.id),
        trackOrder: track === undefined ? snapshot.trackOrder : snapshot.trackOrder.filter((id) => id !== track.id),
        updatedAt: command.at };
      inverse = { kind: "installRecordedAudioTake", asset: structuredClone(asset),
        take: structuredClone(take), clip: structuredClone(clip),
        ...(track === undefined ? {} : { track: structuredClone(track) }), at: snapshot.updatedAt };
      break;
    }
    case "installBusResample": {
      const { asset, take, clip, expectedSourceBus, expectedDestinationTrack } = command;
      const resample = take.audioResample;
      const sourceBus = snapshot.tracks.find((track) => track.id === expectedSourceBus.id);
      const destination = snapshot.tracks.find((track) => track.id === expectedDestinationTrack.id);
      if (!resample || take.kind !== "audio" || take.audioCapture !== undefined ||
          asset.sourceKind !== "recorded" || asset.mimeType !== "audio/wav" ||
          take.assetId !== asset.id || clip.sourceId !== asset.id || clip.sourceTakeId !== take.id ||
          sourceBus?.kind !== "bus" || destination?.kind !== "audio" ||
          resample.sourceBusTrackId !== sourceBus.id ||
          resample.destinationTrackId !== destination.id || clip.trackId !== destination.id ||
          JSON.stringify(sourceBus) !== JSON.stringify(expectedSourceBus) ||
          JSON.stringify(destination) !== JSON.stringify(expectedDestinationTrack) ||
          snapshot.assets.some((item) => item.id === asset.id) ||
          snapshot.takes.some((item) => item.id === take.id) ||
          snapshot.clips.some((item) => item.id === clip.id)) {
        throw new RangeError("Resampling de bus desactualizado o incoherente");
      }
      const clock = new MusicalClock(snapshot.tempoMap, snapshot.meterMap);
      const startUs = Math.round(clock.tickToSeconds(resample.startTick) * 1_000_000);
      const endUs = startUs + Math.round(resample.frameCount * 1_000_000 / resample.sampleRate);
      if (clip.timeMode !== "absolute" || clip.absoluteStartUs !== startUs ||
          clip.absoluteEndUs !== endUs || clip.startTick !== resample.startTick ||
          clip.sourceStartFrame !== 0 || clip.sourceEndFrame !== resample.frameCount ||
          clip.fadeInFrames !== 0 || clip.fadeOutFrames !== 0 ||
          clip.tailPolicy !== "continue" || clip.loopMode !== "none" ||
          clip.sourceOffsetTick !== 0 || clip.transpose !== 0 ||
          clip.gainDb !== 0 || clip.muted !== false ||
          clip.envelopeStartFrame !== undefined || clip.envelopeEndFrame !== undefined) {
        throw new RangeError("Clip de resampling debe contener el WAV completo una sola vez");
      }
      const allowedEffects = new Set<string>();
      for (const trackId of resample.sourceTrackIds) {
        const source = snapshot.tracks.find((track) => track.id === trackId);
        if (!source || source.kind === "bus" || source.id === destination.id) {
          throw new RangeError("Fuente de resampling inválida o incluye la pista destino");
        }
        for (const track of routeToBus(snapshot, trackId, sourceBus.id)) {
          for (const effect of track.mix.effects) if (effect.enabled) allowedEffects.add(effect.id);
        }
      }
      if (resample.includedEffectIds.some((id) => !allowedEffects.has(id))) {
        throw new RangeError("El reporte de resampling incluye efectos fuera del bus elegido");
      }
      document = { ...snapshot, assets: [...snapshot.assets, structuredClone(asset)],
        takes: [...snapshot.takes, structuredClone(take)],
        clips: [...snapshot.clips, structuredClone(clip)], updatedAt: command.at };
      inverse = { kind: "removeBusResample", asset: structuredClone(asset),
        take: structuredClone(take), clip: structuredClone(clip),
        expectedSourceBus: structuredClone(sourceBus),
        expectedDestinationTrack: structuredClone(destination), at: snapshot.updatedAt };
      break;
    }
    case "removeBusResample": {
      const { asset, take, clip } = command;
      if (!snapshot.assets.some((item) => sameAssetRef(item, asset)) ||
          !snapshot.takes.some((item) => JSON.stringify(item) === JSON.stringify(take)) ||
          !snapshot.clips.some((item) => JSON.stringify(item) === JSON.stringify(clip))) {
        throw new RangeError("Resampling instalado cambió antes de deshacer");
      }
      document = { ...snapshot,
        assets: snapshot.assets.filter((item) => item.id !== asset.id),
        takes: snapshot.takes.filter((item) => item.id !== take.id),
        clips: snapshot.clips.filter((item) => item.id !== clip.id), updatedAt: command.at };
      inverse = { kind: "installBusResample", asset: structuredClone(asset),
        take: structuredClone(take), clip: structuredClone(clip),
        expectedSourceBus: structuredClone(command.expectedSourceBus),
        expectedDestinationTrack: structuredClone(command.expectedDestinationTrack),
        at: snapshot.updatedAt };
      break;
    }
    default: {
      const neverCommand: never = command;
      throw new RangeError(`Comando desconocido: ${String(neverCommand)}`);
    }
  }
  if (!focusedValidated) validateProjectDocument(document);
  return { document, inverse };
}
