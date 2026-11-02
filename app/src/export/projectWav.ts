import { renderProjectPcm, type RenderProgress, type RenderedProjectPcm } from "../audio/renderProjectPcm.ts";
import type { UserSampleReader } from "../audio/userSampleAsset.ts";
import type { ProjectRevision } from "../project/repository.ts";
import { requiredOfficialPacks } from "../project/officialPacks.ts";
import { planProjectAudioExport, type AudioExportPlan, type AudioExportPlanOptions,
  type PlannedAudioStem } from "./audioPlan.ts";
import { encodeWavPcmAsync } from "./wavPcmClient.ts";
import { WavPcmError, type WavPcmFormat, type WavPcmReport } from "./wavPcm.ts";

const MAX_JOB_BYTES = 256 * 1024 * 1024;

export interface ProjectWavOptions extends AudioExportPlanOptions {
  readonly format: WavPcmFormat;
  /** Master only: normalizing each stem independently would change the mix. */
  readonly normalizePeakDbfs?: number;
  readonly dither?: boolean;
  readonly seed?: string;
}

export interface ProjectWavProgress {
  readonly phase: "render" | "encode" | "done";
  readonly fileIndex: number;
  readonly fileCount: number;
  readonly stemId: string;
  readonly render?: RenderProgress;
}

export interface ProjectWavFile {
  readonly name: string;
  readonly mimeType: "audio/wav";
  readonly kind: "master" | PlannedAudioStem["kind"];
  readonly id: string;
  readonly sourceTrackIds: readonly string[];
  readonly bytes: Uint8Array;
  readonly pcm: WavPcmReport;
  readonly render: RenderedProjectPcm["report"];
}

export interface ProjectWavResult {
  readonly projectId: string;
  readonly projectName: string;
  readonly revision: number;
  readonly revisionHash: string;
  readonly format: WavPcmFormat;
  readonly seed: string;
  readonly plan: AudioExportPlan;
  readonly files: readonly ProjectWavFile[];
  /** The project limiter is nonlinear; stems are aligned but not additive. */
  readonly stemsAdditive: boolean;
  readonly projectLimiterIncluded: true;
  /** True when the rendered graph contains post-fader send paths. */
  readonly sendsIncluded: boolean;
  readonly masterEffectsIncluded: false;
  readonly sidechainIncluded: false;
  readonly studioGlobalChainIncluded: false;
  /** A source can resolve to silence after probability, trim or a silent sample. */
  readonly omittedStemIds: readonly string[];
  readonly officialCredits: readonly { readonly instrumentId: string;
    readonly packageVersion: string; readonly presetId: string;
    readonly creator: string; readonly performer?: string;
    readonly license: string; readonly sourceUrl: string }[];
}

function filePart(value: string, fallback: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 48) || fallback;
}

function fileName(revision: ProjectRevision, target: { readonly id: string;
  readonly name: string; readonly kind: ProjectWavFile["kind"] }, index: number): string {
  const prefix = `${filePart(revision.document.name, "proyecto")}-${filePart(revision.projectId, "id")}`;
  const version = `r${revision.revision}-${revision.hash.slice(0, 12)}`;
  const stem = target.kind === "master" ? "master"
    : `${String(index).padStart(2, "0")}-${target.kind}-${filePart(target.name, "pista")}-${filePart(target.id, "id")}`;
  return `${prefix}-${version}-${stem}.wav`;
}

function emit(onProgress: ((progress: ProjectWavProgress) => void) | undefined,
  progress: ProjectWavProgress): void {
  try { onProgress?.(progress); } catch { /* UI progress cannot change audio. */ }
}

function assertSnapshot(revision: ProjectRevision): void {
  if (revision.projectId !== revision.document.id ||
      !Number.isSafeInteger(revision.revision) || revision.revision < 1 ||
      !/^[a-f0-9]{64}$/.test(revision.hash)) {
    throw new RangeError("Snapshot PRJ confirmado inválido para exportación WAV");
  }
}

/** A saved project revision is the fixed source for master and all aligned stems. */
export async function exportProjectWav(revision: ProjectRevision, assetReader: UserSampleReader,
  options: ProjectWavOptions, signal?: AbortSignal,
  onProgress?: (progress: ProjectWavProgress) => void): Promise<ProjectWavResult> {
  assertSnapshot(revision);
  if (signal?.aborted) throw new DOMException("Exportación cancelada", "AbortError");
  if (options.stems !== "none" && options.normalizePeakDbfs !== undefined) {
    throw new RangeError("Los stems no admiten normalización individual: alteraría su suma con el master");
  }
  if (options.format !== "pcm16" && options.format !== "pcm24") {
    throw new RangeError("Profundidad WAV no implementada");
  }
  const plan = planProjectAudioExport(revision.document, options);
  const officialCredits = requiredOfficialPacks(revision.document).map((pack) => ({
    instrumentId: pack.instrumentId, packageVersion: pack.packageVersion,
    presetId: pack.presetId, creator: pack.creator, performer: pack.performer,
    license: pack.license, sourceUrl: pack.sourceUrl,
  }));
  const targets: Array<PlannedAudioStem | { kind: "master"; id: "master"; name: "Master";
    sourceTrackIds: readonly string[] }> = [
      { kind: "master", id: "master", name: "Master", sourceTrackIds: [] }, ...plan.stems,
    ];
  const estimatedFrames = Math.ceil((plan.durationSeconds + plan.tailSeconds) * plan.sampleRate);
  const estimatedWavBytes = targets.length * (44 + estimatedFrames * 2 *
    (options.format === "pcm16" ? 2 : 3));
  if (!Number.isSafeInteger(estimatedWavBytes) || estimatedWavBytes > MAX_JOB_BYTES) {
    throw new RangeError("El conjunto WAV supera 256 MiB; exporta menos pistas o un rango más corto");
  }
  const seed = options.seed ?? revision.document.id;
  if (typeof seed !== "string" || seed.length > 128) throw new RangeError("Semilla WAV inválida");
  const files: ProjectWavFile[] = [];
  const omittedStemIds: string[] = [];
  const omittedTrackIds = new Set(plan.omittedSourceTrackIds);
  let expectedFrames = -1;
  let totalBytes = 0;
  for (const [index, target] of targets.entries()) {
    if (signal?.aborted) throw new DOMException("Exportación cancelada", "AbortError");
    emit(onProgress, { phase: "render", fileIndex: index, fileCount: targets.length,
      stemId: target.id });
    const selected = target.kind === "master" ? {}
      : target.kind === "track" ? { trackId: target.id }
      : target.kind === "bus"
        ? { trackIds: target.sourceTrackIds, tapBusTrackId: target.id }
        : { trackIds: target.sourceTrackIds, tapDirectMaster: true };
    const rendered = await renderProjectPcm(revision.document, {
      startTick: plan.startTick, endTick: plan.endTick, sampleRate: plan.sampleRate,
      tailSeconds: plan.tailSeconds, seed, ...selected,
    }, assetReader, signal, (render) => emit(onProgress, {
      phase: "render", fileIndex: index, fileCount: targets.length,
      stemId: target.id, render,
    }));
    const frames = rendered.left.length;
    if (rendered.sampleRate !== plan.sampleRate || frames !== rendered.right.length ||
        (expectedFrames >= 0 && frames !== expectedFrames)) {
      throw new Error(`Stem ${target.id}: origen temporal o duración PCM no alineados al master`);
    }
    expectedFrames = frames;
    emit(onProgress, { phase: "encode", fileIndex: index, fileCount: targets.length,
      stemId: target.id });
    let encoded;
    try {
      encoded = await encodeWavPcmAsync({ sampleRate: plan.sampleRate,
        left: rendered.left, right: rendered.right }, {
        format: options.format, normalizePeakDbfs: options.normalizePeakDbfs,
        dither: options.dither, seed: `${revision.hash.slice(0, 64)}:${index}`,
      }, signal);
    } catch (error) {
      if (error instanceof WavPcmError && error.code === "silent" && target.kind !== "master") {
        omittedStemIds.push(target.id);
        if (target.kind === "track") omittedTrackIds.add(target.id);
        continue;
      }
      if (error instanceof WavPcmError) {
        throw new WavPcmError(error.code, `${target.name} (${target.id}): ${error.message}`, error.count);
      }
      throw error;
    }
    if (encoded.report.frames !== expectedFrames) {
      throw new Error(`Stem ${target.id}: frames WAV no alineados al master`);
    }
    totalBytes += encoded.bytes.byteLength;
    if (totalBytes > MAX_JOB_BYTES) {
      throw new RangeError("El conjunto WAV excedió 256 MiB durante el render");
    }
    files.push({ name: fileName(revision, target, index), mimeType: "audio/wav",
      kind: target.kind, id: target.id, sourceTrackIds: target.kind === "master"
        ? rendered.report.selectedTrackIds : target.sourceTrackIds,
      bytes: encoded.bytes, pcm: encoded.report, render: rendered.report });
    emit(onProgress, { phase: "done", fileIndex: index + 1,
      fileCount: targets.length, stemId: target.id });
  }
  if (options.stems !== "none" && files.length < 2) {
    throw new RangeError("Todos los stems quedaron sin señal audible; exporta sólo el master o revisa las pistas");
  }
  const finalPlan: AudioExportPlan = { ...plan,
    stems: plan.stems.filter((stem) => !omittedStemIds.includes(stem.id)),
    omittedSourceTrackIds: [...omittedTrackIds],
  };
  return { projectId: revision.projectId, projectName: revision.document.name,
    revision: revision.revision,
    revisionHash: revision.hash, format: options.format, seed, plan: finalPlan, files,
    stemsAdditive: finalPlan.stemsAdditive, projectLimiterIncluded: true,
    sendsIncluded: revision.document.tracks.some((track) => track.mix.sends.length > 0),
    masterEffectsIncluded: false, sidechainIncluded: false,
    studioGlobalChainIncluded: false, omittedStemIds, officialCredits };
}
