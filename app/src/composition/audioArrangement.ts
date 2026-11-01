import type { ProjectAudioCrossfade, ProjectClip, ProjectDocumentV1 } from "../project/model.ts";
import type { ProjectCommand } from "../project/commands.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

type AudioClip = Extract<ProjectClip, { kind: "audio" }>;

export interface EditableAudioClipFields {
  readonly timeMode: "beat" | "absolute";
  readonly startTick: number;
  readonly lengthTicks: number;
  readonly absoluteStartUs?: number;
  readonly absoluteEndUs?: number;
  readonly sourceStartFrame: number;
  readonly sourceEndFrame: number;
  readonly fadeInFrames: number;
  readonly fadeOutFrames: number;
  readonly gainDb: number;
  readonly muted: boolean;
  readonly tailPolicy: "cut" | "continue";
}

function clockOf(document: ProjectDocumentV1): MusicalClock {
  return new MusicalClock(document.tempoMap, document.meterMap);
}

function audioClip(document: ProjectDocumentV1, clipId: string): AudioClip {
  const clip = document.clips.find((item) => item.id === clipId);
  if (!clip || clip.kind !== "audio") throw new RangeError("Clip de audio inexistente");
  return clip;
}

export function audioClipBoundsUs(document: ProjectDocumentV1, clip: AudioClip):
  { startUs: number; endUs: number } {
  if (clip.timeMode === "absolute") {
    if (clip.absoluteStartUs === undefined || clip.absoluteEndUs === undefined) {
      throw new RangeError("Clip absoluto sin anclas de tiempo");
    }
    return { startUs: clip.absoluteStartUs, endUs: clip.absoluteEndUs };
  }
  const clock = clockOf(document);
  return { startUs: Math.round(clock.tickToSeconds(clip.startTick) * 1_000_000),
    endUs: Math.round(clock.tickToSeconds(clip.startTick + clip.lengthTicks) * 1_000_000) };
}

function replaceAudio(document: ProjectDocumentV1, clips: readonly ProjectClip[],
  audioCrossfades: readonly ProjectAudioCrossfade[] | undefined, at: number): ProjectCommand {
  return { kind: "replaceAudioArrangement", expected: {
    clips: document.clips, audioCrossfades: document.audioCrossfades,
  }, clips, audioCrossfades, at };
}

export function editArrangementAudioClip(document: ProjectDocumentV1, clipId: string,
  fields: EditableAudioClipFields, at = Date.now()): ProjectCommand {
  const clip = audioClip(document, clipId);
  const clock = clockOf(document);
  const absolute = fields.timeMode === "absolute";
  if ((fields.timeMode !== "beat" && !absolute) ||
      !Number.isSafeInteger(fields.startTick) || fields.startTick < 0 ||
      !Number.isSafeInteger(fields.lengthTicks) || fields.lengthTicks < 1 ||
      (absolute && (!Number.isSafeInteger(fields.absoluteStartUs) ||
        !Number.isSafeInteger(fields.absoluteEndUs) || fields.absoluteStartUs! < 0 ||
        fields.absoluteEndUs! <= fields.absoluteStartUs!)) ||
      !Number.isSafeInteger(fields.sourceStartFrame) || fields.sourceStartFrame < 0 ||
      !Number.isSafeInteger(fields.sourceEndFrame) ||
      fields.sourceEndFrame <= fields.sourceStartFrame ||
      !Number.isSafeInteger(fields.fadeInFrames) || fields.fadeInFrames < 0 ||
      !Number.isSafeInteger(fields.fadeOutFrames) || fields.fadeOutFrames < 0 ||
      !Number.isFinite(fields.gainDb) || fields.gainDb < -120 || fields.gainDb > 24) {
    throw new RangeError("Posición, trim, fades o ganancia de audio inválidos");
  }
  const startTick = absolute ? clock.secondsToTick(fields.absoluteStartUs! / 1_000_000) : fields.startTick;
  const endTick = absolute ? clock.secondsToTick(fields.absoluteEndUs! / 1_000_000)
    : fields.startTick + fields.lengthTicks;
  if (!Number.isSafeInteger(endTick) || endTick <= startTick) {
    throw new RangeError("El rango absoluto debe ocupar al menos un tick proyectado");
  }
  const updated: AudioClip = { ...clip, startTick, lengthTicks: endTick - startTick,
    timeMode: fields.timeMode, sourceStartFrame: fields.sourceStartFrame,
    sourceEndFrame: fields.sourceEndFrame, fadeInFrames: fields.fadeInFrames,
    fadeOutFrames: fields.fadeOutFrames, gainDb: fields.gainDb,
    muted: fields.muted, tailPolicy: fields.tailPolicy,
    ...(absolute ? { absoluteStartUs: fields.absoluteStartUs!, absoluteEndUs: fields.absoluteEndUs! } : {}) };
  if (!absolute) {
    delete (updated as { absoluteStartUs?: number }).absoluteStartUs;
    delete (updated as { absoluteEndUs?: number }).absoluteEndUs;
  }
  return replaceAudio(document, document.clips.map((item) => item.id === clipId ? updated : item),
    document.audioCrossfades, at);
}

export function shiftArrangementAudioClip(document: ProjectDocumentV1, clipId: string,
  deltaTicks: number, at = Date.now()): ProjectCommand {
  const clip = audioClip(document, clipId);
  if (!Number.isSafeInteger(deltaTicks) || clip.startTick + deltaTicks < 0) {
    throw new RangeError("Movimiento de audio inválido");
  }
  const clock = clockOf(document);
  const bounds = audioClipBoundsUs(document, clip);
  const deltaUs = Math.round((clock.tickToSeconds(clip.startTick + deltaTicks) -
    clock.tickToSeconds(clip.startTick)) * 1_000_000);
  return editArrangementAudioClip(document, clipId, {
    timeMode: clip.timeMode ?? "beat", startTick: clip.startTick + deltaTicks,
    lengthTicks: clip.lengthTicks,
    ...(clip.timeMode === "absolute" ? { absoluteStartUs: bounds.startUs + deltaUs,
      absoluteEndUs: bounds.endUs + deltaUs } : {}),
    sourceStartFrame: clip.sourceStartFrame, sourceEndFrame: clip.sourceEndFrame,
    fadeInFrames: clip.fadeInFrames, fadeOutFrames: clip.fadeOutFrames,
    gainDb: clip.gainDb, muted: clip.muted, tailPolicy: clip.tailPolicy,
  }, at);
}

export function splitArrangementAudioClip(document: ProjectDocumentV1, clipId: string,
  playheadTick: number, at = Date.now(), newClipId = crypto.randomUUID()): ProjectCommand {
  const clip = audioClip(document, clipId);
  if (!Number.isSafeInteger(playheadTick) || playheadTick <= clip.startTick ||
      playheadTick >= clip.startTick + clip.lengthTicks) {
    throw new RangeError("El cabezal debe estar dentro del clip de audio");
  }
  if (document.audioCrossfades?.some((fade) => fade.outgoingClipId === clipId ||
      fade.incomingClipId === clipId)) {
    throw new RangeError("Retira el crossfade antes de cortar este clip");
  }
  const splitUs = Math.round(clockOf(document).tickToSeconds(playheadTick) * 1_000_000);
  const bounds = audioClipBoundsUs(document, clip);
  if (splitUs <= bounds.startUs || splitUs >= bounds.endUs) {
    throw new RangeError("El cabezal cae fuera del tiempo audible exacto");
  }
  return { kind: "splitAudioClip", clipId, newClipId,
    ...(clip.timeMode === "absolute" ? { splitUs } : { splitTick: playheadTick }), at };
}

export function duplicateArrangementAudioClip(document: ProjectDocumentV1, clipId: string,
  at = Date.now(), newClipId = crypto.randomUUID()): ProjectCommand {
  const clip = audioClip(document, clipId);
  const bounds = audioClipBoundsUs(document, clip);
  const absolute = clip.timeMode === "absolute";
  const startUs = bounds.endUs;
  const endUs = startUs + bounds.endUs - bounds.startUs;
  const clock = clockOf(document);
  const startTick = absolute ? clock.secondsToTick(startUs / 1_000_000)
    : clip.startTick + clip.lengthTicks;
  const endTick = absolute ? clock.secondsToTick(endUs / 1_000_000)
    : startTick + clip.lengthTicks;
  if (!Number.isSafeInteger(endUs) || !Number.isSafeInteger(endTick) || endTick <= startTick) {
    throw new RangeError("La copia de audio excede el tiempo válido");
  }
  const lanes = document.automation.filter((lane) => lane.target.scope === "clip" &&
    lane.target.ownerId === clipId);
  if (lanes.length) return { kind: "duplicateClipWithAutomation", clipId,
    expectedClip: clip, expectedLanes: lanes, newClipId, startTick,
    ...(absolute ? { absoluteStartUs: startUs } : {}),
    newLaneIds: lanes.map(() => crypto.randomUUID()),
    newPointIds: lanes.map((lane) => lane.points.map(() => crypto.randomUUID())), at };
  const copy: AudioClip = { ...clip, id: newClipId, startTick,
    lengthTicks: endTick - startTick,
    ...(absolute ? { absoluteStartUs: startUs, absoluteEndUs: endUs } : {}) };
  const index = document.clips.findIndex((item) => item.id === clipId);
  return replaceAudio(document, [...document.clips.slice(0, index + 1), copy,
    ...document.clips.slice(index + 1)], document.audioCrossfades, at);
}

export function removeArrangementAudioClip(document: ProjectDocumentV1, clipId: string,
  at = Date.now()): ProjectCommand {
  audioClip(document, clipId);
  return replaceAudio(document, document.clips.filter((item) => item.id !== clipId),
    document.audioCrossfades?.filter((fade) => fade.outgoingClipId !== clipId &&
      fade.incomingClipId !== clipId), at);
}

export function audioCrossfadeCandidates(document: ProjectDocumentV1,
  outgoingClipId: string): readonly AudioClip[] {
  const outgoing = audioClip(document, outgoingClipId);
  const left = audioClipBoundsUs(document, outgoing);
  const existing = new Set((document.audioCrossfades ?? []).map((fade) =>
    JSON.stringify([fade.outgoingClipId, fade.incomingClipId])));
  return document.clips.filter((item): item is AudioClip => {
    if (item.kind !== "audio" || item.id === outgoing.id || item.trackId !== outgoing.trackId ||
        item.muted || existing.has(JSON.stringify([outgoing.id, item.id]))) return false;
    const right = audioClipBoundsUs(document, item);
    return left.startUs < right.startUs && right.startUs < left.endUs && left.endUs < right.endUs;
  });
}

export function audioCrossfadePredecessors(document: ProjectDocumentV1,
  incomingClipId: string): readonly AudioClip[] {
  const incoming = audioClip(document, incomingClipId);
  const right = audioClipBoundsUs(document, incoming);
  const existing = new Set((document.audioCrossfades ?? []).map((fade) =>
    JSON.stringify([fade.outgoingClipId, fade.incomingClipId])));
  return document.clips.filter((item): item is AudioClip => {
    if (item.kind !== "audio" || item.id === incoming.id || item.trackId !== incoming.trackId ||
        item.muted || existing.has(JSON.stringify([item.id, incoming.id]))) return false;
    const left = audioClipBoundsUs(document, item);
    return left.startUs < right.startUs && right.startUs < left.endUs && left.endUs < right.endUs;
  });
}

export function addArrangementAudioCrossfade(document: ProjectDocumentV1,
  outgoingClipId: string, incomingClipId: string, curve: ProjectAudioCrossfade["curve"],
  at = Date.now(), id = crypto.randomUUID()): ProjectCommand {
  if (!audioCrossfadeCandidates(document, outgoingClipId).some((clip) => clip.id === incomingClipId) ||
      (curve !== "linear" && curve !== "equalPower")) {
    throw new RangeError("Clips o curva de crossfade incompatibles");
  }
  const fade: ProjectAudioCrossfade = { id, outgoingClipId, incomingClipId, curve };
  return replaceAudio(document, document.clips, [...(document.audioCrossfades ?? []), fade], at);
}

export function removeArrangementAudioCrossfade(document: ProjectDocumentV1,
  fadeId: string, at = Date.now()): ProjectCommand {
  if (!document.audioCrossfades?.some((fade) => fade.id === fadeId)) {
    throw new RangeError("Crossfade inexistente");
  }
  return replaceAudio(document, document.clips,
    document.audioCrossfades.filter((fade) => fade.id !== fadeId), at);
}
