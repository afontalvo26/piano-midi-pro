import type { ProjectAssetRef, ProjectClip, ProjectDocumentV1, ProjectTakeRef } from "./model.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

export interface PreparedAudioTakePlacement {
  readonly take: ProjectTakeRef;
  readonly clip: Extract<ProjectClip, { kind: "audio" }>;
}

/** Places a new take once using its measured frame offset; later edits use setAudioTakeLatency. */
export function prepareAudioTakePlacement(document: ProjectDocumentV1, take: ProjectTakeRef,
  asset: ProjectAssetRef, options: { readonly clipId: string; readonly trackId: string }):
PreparedAudioTakePlacement {
  const capture = take.audioCapture;
  if (take.kind !== "audio" || !capture || take.assetId !== asset.id ||
      asset.sourceKind !== "recorded" || asset.frameCount !== capture.frameCount ||
      asset.sampleRate !== capture.sampleRate || asset.channelCount !== capture.channelCount ||
      !Number.isSafeInteger(capture.latencyOffsetFrames) ||
      Math.abs(capture.latencyOffsetFrames) > 2 * capture.sampleRate) {
    throw new RangeError("Toma de audio y activo no coinciden para posicionamiento");
  }
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const rawStartUs = capture.startProjectUs ??
    Math.round(clock.tickToSeconds(capture.startTick) * 1_000_000);
  if (!Number.isSafeInteger(rawStartUs) || rawStartUs < 0) {
    throw new RangeError("Ancla precisa de la toma inválida");
  }
  const absoluteStartUs = rawStartUs - Math.round(capture.latencyOffsetFrames *
    1_000_000 / capture.sampleRate);
  const absoluteEndUs = absoluteStartUs + Math.round(capture.frameCount *
    1_000_000 / capture.sampleRate);
  if (absoluteStartUs < 0 || !Number.isSafeInteger(absoluteEndUs)) {
    throw new RangeError("La compensación de entrada requiere pre-roll antes de tick cero");
  }
  const startTick = clock.secondsToTick(absoluteStartUs / 1_000_000);
  const endTick = clock.secondsToTick(absoluteEndUs / 1_000_000);
  if (endTick <= startTick) throw new RangeError("La toma capturada colapsa en ticks musicales");
  const preparedTake: ProjectTakeRef = { ...take, audioCapture: {
    ...capture, capturedLatencyOffsetFrames:
      capture.capturedLatencyOffsetFrames ?? capture.latencyOffsetFrames,
  } };
  const clip: Extract<ProjectClip, { kind: "audio" }> = {
    id: options.clipId, kind: "audio", trackId: options.trackId,
    sourceId: asset.id, sourceTakeId: take.id, timeMode: "absolute",
    absoluteStartUs, absoluteEndUs, startTick, lengthTicks: endTick - startTick,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "continue",
    transpose: 0, gainDb: 0, muted: false,
    sourceStartFrame: 0, sourceEndFrame: capture.frameCount,
    fadeInFrames: 0, fadeOutFrames: 0,
  };
  return { take: preparedTake, clip };
}
