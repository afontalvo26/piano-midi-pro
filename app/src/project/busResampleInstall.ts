import type { ProjectAssetRef, ProjectAudioResample, ProjectClip, ProjectDocumentV1,
  ProjectTakeRef } from "./model.ts";
import { applyCommand, type ProjectCommand } from "./commands.ts";
import type { ProjectRepository } from "./repository.ts";
import type { ProjectSession, ProjectSessionSnapshot } from "./session.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";

export interface BusResampleInstallOptions {
  readonly asset: ProjectAssetRef;
  readonly data: Blob;
  readonly provenance: ProjectAudioResample;
  readonly takeId: string;
  readonly clipId: string;
  readonly at: number;
}

/** Builds historical provenance and one absolute clip from the exact rendered PCM frame count. */
export function prepareBusResampleInstall(document: ProjectDocumentV1, asset: ProjectAssetRef,
  provenance: ProjectAudioResample, ids: { readonly takeId: string; readonly clipId: string;
    readonly at: number }): { readonly take: ProjectTakeRef;
      readonly clip: Extract<ProjectClip, { kind: "audio" }> } {
  if (asset.sourceKind !== "recorded" || asset.mimeType !== "audio/wav" ||
      asset.frameCount !== provenance.frameCount || asset.sampleRate !== provenance.sampleRate ||
      asset.channelCount !== provenance.channelCount || provenance.rendererVersion !== "bus-resample-v1" ||
      provenance.tap !== "post-bus-pre-master") {
    throw new RangeError("WAV y reporte de resampling no coinciden");
  }
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const absoluteStartUs = Math.round(clock.tickToSeconds(provenance.startTick) * 1_000_000);
  const absoluteEndUs = absoluteStartUs + Math.round(provenance.frameCount *
    1_000_000 / provenance.sampleRate);
  const startTick = clock.secondsToTick(absoluteStartUs / 1_000_000);
  const endTick = clock.secondsToTick(absoluteEndUs / 1_000_000);
  if (startTick !== provenance.startTick || endTick <= startTick ||
      !Number.isSafeInteger(absoluteEndUs)) {
    throw new RangeError("Resampling no cabe en la línea de tiempo musical");
  }
  const take: ProjectTakeRef = { id: ids.takeId, kind: "audio", assetId: asset.id,
    createdAt: ids.at, audioResample: structuredClone(provenance) };
  const clip: Extract<ProjectClip, { kind: "audio" }> = {
    id: ids.clipId, kind: "audio", trackId: provenance.destinationTrackId,
    sourceId: asset.id, sourceTakeId: ids.takeId, timeMode: "absolute",
    absoluteStartUs, absoluteEndUs, startTick, lengthTicks: endTick - startTick,
    sourceOffsetTick: 0, loopMode: "none", tailPolicy: "continue", transpose: 0,
    gainDb: 0, muted: false, sourceStartFrame: 0,
    sourceEndFrame: provenance.frameCount, fadeInFrames: 0, fadeOutFrames: 0,
  };
  return { take, clip };
}

/** Stages exact WAV bytes, then commits asset + take + clip in one reversible CAS command. */
export async function installBusResample(repository: ProjectRepository, session: ProjectSession,
  options: BusResampleInstallOptions): Promise<ProjectSessionSnapshot> {
  const initial = session.getSnapshot();
  const { provenance } = options;
  if (initial.status !== "clean" || initial.revision !== provenance.sourceRevision ||
      initial.hash !== provenance.sourceHash) {
    throw new RangeError("Resampling exige la revisión confirmada que se renderizó");
  }
  const sourceBus = initial.document.tracks.find((track) => track.id === provenance.sourceBusTrackId);
  const destination = initial.document.tracks.find((track) => track.id === provenance.destinationTrackId);
  if (!sourceBus || !destination) throw new RangeError("Bus o pista destino ya no existen");
  const { take, clip } = prepareBusResampleInstall(initial.document, options.asset,
    provenance, options);
  const command: ProjectCommand = { kind: "installBusResample", asset: options.asset,
    take, clip, expectedSourceBus: sourceBus, expectedDestinationTrack: destination,
    at: options.at };
  // Reject an invalid graph before staging bytes. Another tab can still win CAS during render.
  applyCommand(initial.document, command);
  await repository.stageAsset(options.asset, options.data);
  const current = session.getSnapshot();
  if (current.document !== initial.document || current.status !== "clean" ||
      current.revision !== initial.revision || current.hash !== initial.hash) {
    throw new RangeError("El proyecto cambió durante el staging del resampling");
  }
  session.dispatch(command);
  await session.save();
  return session.getSnapshot();
}
