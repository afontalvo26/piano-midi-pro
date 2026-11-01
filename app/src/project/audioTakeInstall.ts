import { projectTakeFromCapture, type AudioCaptureTake } from "../audio/audioInputSession.ts";
import type { ProjectAssetRef, ProjectClip, ProjectTakeRef, ProjectTrack } from "./model.ts";
import type { ProjectRepository } from "./repository.ts";
import type { ProjectSession, ProjectSessionSnapshot } from "./session.ts";
import { prepareAudioTakePlacement } from "./audioTakePlacement.ts";

export interface AddRecordedAudioTakeOptions {
  readonly asset: ProjectAssetRef;
  readonly data: Blob;
  readonly take: ProjectTakeRef;
  readonly clip: Extract<ProjectClip, { kind: "audio" }>;
  /** Omit when recording into an existing audio track. */
  readonly track?: ProjectTrack;
  readonly at: number;
}

/** Stages immutable bytes before one reversible command adds the take, clip and optional track. */
export async function installRecordedAudioTake(repository: ProjectRepository, session: ProjectSession,
  options: AddRecordedAudioTakeOptions): Promise<ProjectSessionSnapshot> {
  await repository.stageAsset(options.asset, options.data);
  session.dispatch({ kind: "installRecordedAudioTake", asset: options.asset, take: options.take,
    clip: options.clip, ...(options.track === undefined ? {} : { track: options.track }), at: options.at });
  await session.save();
  return session.getSnapshot();
}

/** Compatibility entry point for an already-created audio track. */
export const addRecordedAudioTake = installRecordedAudioTake;

export interface InstallAudioCaptureOptions {
  readonly capture: AudioCaptureTake;
  readonly takeId: string;
  readonly clipId: string;
  readonly at: number;
  /** Legacy beat-anchored endpoint. Omit to create an absolute clip with frame latency applied once. */
  readonly endTick?: number;
  readonly track?: ProjectTrack;
  readonly fadeInFrames?: number;
  readonly fadeOutFrames?: number;
}

/** Connects an AudioInputSession take to PRJ without changing its WAV bytes. */
export function installAudioCapture(repository: ProjectRepository, session: ProjectSession,
  options: InstallAudioCaptureOptions): Promise<ProjectSessionSnapshot> {
  const { capture } = options;
  const rawTake = projectTakeFromCapture(capture, options.takeId, options.at);
  let clip: Extract<ProjectClip, { kind: "audio" }>;
  let take: ProjectTakeRef;
  if (options.endTick !== undefined) {
    if (!Number.isSafeInteger(options.endTick) || options.endTick <= capture.startTick) {
      throw new RangeError("Fin musical de la toma inválido");
    }
    clip = {
      id: options.clipId, kind: "audio", trackId: capture.trackId, sourceId: capture.ref.id,
      startTick: capture.startTick, lengthTicks: options.endTick - capture.startTick,
      sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut", transpose: 0,
      gainDb: 0, muted: false, sourceStartFrame: 0, sourceEndFrame: capture.frameCount,
      fadeInFrames: options.fadeInFrames ?? 0, fadeOutFrames: options.fadeOutFrames ?? 0,
    };
    take = rawTake;
  } else {
    const prepared = prepareAudioTakePlacement(session.getSnapshot().document, rawTake,
      capture.ref, { clipId: options.clipId, trackId: capture.trackId });
    clip = { ...prepared.clip,
      fadeInFrames: options.fadeInFrames ?? 0, fadeOutFrames: options.fadeOutFrames ?? 0 };
    take = prepared.take;
  }
  return installRecordedAudioTake(repository, session, {
    asset: capture.ref, data: capture.data,
    take, clip,
    ...(options.track === undefined ? {} : { track: options.track }), at: options.at,
  });
}
