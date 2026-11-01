import type { ProjectAssetRef, ProjectClip, ProjectInstrumentRef, ProjectPattern, ProjectTrack } from "./model.ts";
import type { ProjectRepository } from "./repository.ts";
import type { ProjectSession, ProjectSessionSnapshot } from "./session.ts";

export interface InstallUserSampleOptions {
  readonly asset: ProjectAssetRef;
  readonly data: Blob;
  readonly trackId: string;
  readonly patternId: string;
  readonly clipId: string;
  readonly at: number;
  readonly trackName?: string;
  readonly patternName?: string;
  readonly startTick?: number;
  readonly lengthTicks?: number;
  readonly sampleRegion?: NonNullable<ProjectInstrumentRef["sampleRegion"]>;
}

/** Stage verified bytes first; one reversible command then installs all document references. */
export async function installUserSample(repository: ProjectRepository, session: ProjectSession,
  options: InstallUserSampleOptions): Promise<ProjectSessionSnapshot> {
  const { asset } = options;
  if ((asset.sourceKind !== "user" && asset.sourceKind !== "recorded") || !asset.frameCount) {
    throw new RangeError("La muestra requiere procedencia propia y número de frames decodificados");
  }
  const region = options.sampleRegion ?? {
    startFrame: 0, endFrame: asset.frameCount, fadeInFrames: 0, fadeOutFrames: 0,
    rootMidi: 60, cents: 0, reverse: false, loopMode: "none", playMode: "oneShot",
  };
  const pattern: ProjectPattern = { id: options.patternId, name: options.patternName ?? "Patrón de muestra",
    version: 1, lengthTicks: options.lengthTicks ?? 3840, notes: [], expression: [] };
  const track: ProjectTrack = { id: options.trackId, name: options.trackName ?? "Muestra propia",
    kind: "instrument", instrument: { instrumentId: "user-sampler",
      packageVersion: `sha256:${asset.sha256.toLowerCase()}`, presetId: `asset:${asset.id}`,
      sampleRegion: region },
    mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
  const clip: ProjectClip = { id: options.clipId, kind: "pattern", trackId: track.id,
    sourceId: pattern.id, sourceVersion: 1, startTick: options.startTick ?? 0,
    lengthTicks: pattern.lengthTicks, sourceOffsetTick: 0, loopMode: "none", tailPolicy: "cut",
    transpose: 0, gainDb: 0, muted: false };
  await repository.stageAsset(asset, options.data);
  session.dispatch({ kind: "installUserSample", asset, track, pattern, clip, at: options.at });
  await session.save();
  return session.getSnapshot();
}
