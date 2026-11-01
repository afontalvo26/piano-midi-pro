import { renderProjectPcm, type RenderProgress, type RenderedProjectPcm } from "./renderProjectPcm.ts";
import type { UserSampleReader } from "./userSampleAsset.ts";
import type { ProjectAssetRef, ProjectAudioResample, ProjectDocumentV1 } from "../project/model.ts";
import type { ProjectRevision } from "../project/repository.ts";
import { findBusResampleRoutes } from "../project/busResampleRouting.ts";
import { encodeWavPcmAsync } from "../export/wavPcmClient.ts";

export interface RenderProjectBusOptions {
  readonly sourceBusTrackId: string;
  readonly destinationTrackId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly sampleRate: 44_100 | 48_000;
  readonly tailSeconds: number;
  readonly seed: string;
  readonly assetId: string;
}

export interface RenderedProjectBus {
  readonly asset: ProjectAssetRef;
  readonly data: Blob;
  readonly provenance: ProjectAudioResample;
  readonly render: RenderedProjectPcm["report"];
}

/** Render one bus after its inserts/gain/pan, before parent buses and master. */
export async function renderProjectBusPcm(revision: ProjectRevision,
  options: RenderProjectBusOptions, assetReader: UserSampleReader, signal?: AbortSignal,
  onProgress?: (progress: RenderProgress) => void): Promise<RenderedProjectBus> {
  const document: ProjectDocumentV1 = revision.document;
  if (revision.projectId !== document.id || !/^[a-f0-9]{64}$/.test(revision.hash) ||
      !options.assetId || !options.seed || options.seed.length > 128) {
    throw new RangeError("Revisión o identidad de resampling inválida");
  }
  const byId = new Map(document.tracks.map((track) => [track.id, track]));
  const bus = byId.get(options.sourceBusTrackId);
  const destination = byId.get(options.destinationTrackId);
  if (bus?.kind !== "bus" || destination?.kind !== "audio" || bus.id === destination.id) {
    throw new RangeError("Elige un bus fuente y una pista de audio destino distintos");
  }
  const routes = findBusResampleRoutes(document, bus.id, destination.id);
  const sourceTrackIds = routes.sourceTrackIds;
  if (!sourceTrackIds.length) throw new RangeError("El bus no tiene pistas fuente para resampling");
  if (routes.hasUnsupportedSends) {
    throw new RangeError("Resampling de bus con envíos aún no está disponible");
  }
  const includedEffectIds = routes.routedTracks.flatMap((track) =>
    track.mix.effects.filter((effect) => effect.enabled).map((effect) => effect.id));
  const rendered = await renderProjectPcm(document, {
    startTick: options.startTick, endTick: options.endTick,
    sampleRate: options.sampleRate, tailSeconds: options.tailSeconds,
    seed: options.seed, trackIds: sourceTrackIds, tapBusTrackId: bus.id,
  }, assetReader, signal, onProgress);
  const encoded = await encodeWavPcmAsync({ sampleRate: options.sampleRate,
    left: rendered.left, right: rendered.right }, { format: "pcm24", dither: false }, signal);
  const wavBytes = Uint8Array.from(encoded.bytes);
  const data = new Blob([wavBytes.buffer], { type: "audio/wav" });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", wavBytes.buffer));
  const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const asset: ProjectAssetRef = { id: options.assetId, sha256, byteLength: data.size,
    mimeType: "audio/wav", sourceKind: "recorded", license: "user-controlled",
    frameCount: encoded.report.frames, sampleRate: options.sampleRate, channelCount: 2 };
  const tailFrames = Math.round(options.tailSeconds * options.sampleRate);
  const provenance: ProjectAudioResample = {
    sourceBusTrackId: bus.id, destinationTrackId: destination.id,
    sourceRevision: revision.revision, sourceHash: revision.hash,
    startTick: options.startTick, endTick: options.endTick,
    tap: "post-bus-pre-master", sourceTrackIds, includedEffectIds,
    seed: options.seed, sampleRate: options.sampleRate, channelCount: 2,
    frameCount: encoded.report.frames, tailFrames,
    rendererVersion: "bus-resample-v1",
  };
  return { asset, data, provenance, render: rendered.report };
}
