import type { ProjectDocumentV1, ProjectTrack } from "../project/model.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";
import { projectEffectParameters } from "../project/effectParameters.ts";
import { createBaseAutomationResolver } from "../sequencer/automationResolver.ts";

export type AudioStemMode = "none" | "tracks" | "buses";

export interface AudioExportPlanOptions {
  readonly startTick?: number;
  readonly endTick?: number;
  readonly tailSeconds?: number;
  readonly sampleRate: 44_100 | 48_000;
  readonly stems: AudioStemMode;
}

export interface PlannedAudioStem {
  readonly kind: "track" | "bus" | "direct";
  readonly id: string;
  readonly name: string;
  readonly sourceTrackIds: readonly string[];
}

export interface AudioExportPlan {
  readonly startTick: number;
  readonly endTick: number;
  readonly durationSeconds: number;
  readonly tailSeconds: number;
  readonly sampleRate: 44_100 | 48_000;
  readonly stems: readonly PlannedAudioStem[];
  /** Empty, outside-range or muted source tracks do not produce silent WAVs. */
  readonly omittedSourceTrackIds: readonly string[];
  /** The common project limiter is nonlinear, so stems need not sum to master. */
  readonly stemsAdditive: boolean;
  readonly busStemsOverlap: boolean;
  readonly projectLimiterIncluded: true;
  /** These are piano-live effects, separate from the included project insert chains. */
  readonly excludedStudioChain: readonly ["piano-live-chorus", "piano-live-reverb",
    "piano-live-compressor", "piano-live-master-volume"];
}

function sourceTracks(document: ProjectDocumentV1): readonly ProjectTrack[] {
  const byId = new Map(document.tracks.map((track) => [track.id, track]));
  return document.trackOrder.map((id) => {
    const track = byId.get(id);
    if (!track) throw new RangeError(`Pista ${id} ausente del arreglo`);
    return track;
  }).filter((track) => track.kind !== "bus");
}

function routingChain(track: ProjectTrack, byId: ReadonlyMap<string, ProjectTrack>): readonly string[] {
  const path: string[] = [];
  let current = track.mix.outputBusTrackId;
  while (current) {
    if (path.includes(current)) throw new RangeError("Ciclo de buses en exportación de audio");
    path.push(current);
    current = byId.get(current)?.mix.outputBusTrackId;
  }
  return path;
}

/** Read-only preflight; unsupported DSP never disappears silently in a WAV. */
export function planProjectAudioExport(document: ProjectDocumentV1,
  options: AudioExportPlanOptions): AudioExportPlan {
  // Full mixes and per-track stems can render parallel sends through the
  // same WebAudio graph as Studio. A bus-specific stem still needs a separate
  // tapped graph: rendering all source paths would leak their direct/master
  // signal into the bus file. Reject that mode rather than mislabel a WAV.
  if (options.stems === "buses" &&
      document.tracks.some((track) => track.mix.sends.length > 0)) {
    throw new RangeError("Stems por bus con envíos requieren aislamiento de rutas; usa mezcla completa o stems por pista");
  }
  // The offline renderer consumes the same resolver as project playback. This
  // preflight rejects effect/clip/bezier lanes instead of silently omitting them.
  createBaseAutomationResolver(document,
    new MusicalClock(document.tempoMap, document.meterMap));
  const unsupportedEffect = [...document.mix.masterEffects,
    ...document.tracks.flatMap((track) => track.mix.effects)].find((effect) =>
    effect.enabled && !projectEffectParameters(effect.kind));
  if (unsupportedEffect) {
    throw new RangeError(`Efecto ${unsupportedEffect.id} (${unsupportedEffect.kind}) no disponible para WAV`);
  }
  if (options.sampleRate !== 44_100 && options.sampleRate !== 48_000) {
    throw new RangeError("Sample rate WAV no implementado");
  }
  if (options.stems !== "none" && options.stems !== "tracks" && options.stems !== "buses") {
    throw new RangeError("Modo de stems no implementado");
  }
  const maxEnd = document.clips.reduce((max, clip) => Math.max(max, clip.startTick + clip.lengthTicks), 0);
  const startTick = options.startTick ?? 0;
  const endTick = options.endTick ?? maxEnd;
  const tailSeconds = options.tailSeconds ?? 2;
  if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick) ||
      startTick < 0 || endTick <= startTick ||
      !Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 5) {
    throw new RangeError("Rango o cola de exportación de audio inválidos");
  }
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const durationSeconds = clock.secondsBetween(startTick, endTick);
  if (!Number.isFinite(durationSeconds) || durationSeconds + tailSeconds > 5 * 60 ||
      (durationSeconds + tailSeconds) * options.sampleRate * 2 * Float32Array.BYTES_PER_ELEMENT > 256 * 1024 * 1024) {
    throw new RangeError("Render excede 5 minutos o 256 MiB de PCM móvil");
  }
  const byId = new Map(document.tracks.map((track) => [track.id, track]));
  const allSources = sourceTracks(document);
  const soundingPatterns = new Set(document.patterns.filter((pattern) =>
    pattern.notes.some((note) => !note.muted && (note.probability ?? 1) > 0)).map((pattern) => pattern.id));
  const clipTrackIds = new Set(document.clips.filter((clip) => !clip.muted &&
    clip.startTick < endTick && clip.startTick + clip.lengthTicks > startTick &&
    (clip.kind === "audio" || soundingPatterns.has(clip.sourceId)))
    .map((clip) => clip.trackId));
  const hasSolo = document.tracks.some((track) => track.mix.solo);
  const sources = allSources.filter((track) => {
    if (!clipTrackIds.has(track.id) || track.mix.mute) return false;
    const chain = routingChain(track, byId);
    if (chain.some((id) => byId.get(id)?.mix.mute)) return false;
    return !hasSolo || track.mix.solo || chain.some((id) => byId.get(id)?.mix.solo);
  });
  const activeIds = new Set(sources.map((track) => track.id));
  const omittedSourceTrackIds = allSources.filter((track) => !activeIds.has(track.id))
    .map((track) => track.id);
  if (!sources.length) {
    throw new RangeError("El arreglo no tiene clips fuente audibles en este rango para WAV");
  }
  let stems: PlannedAudioStem[] = [];
  let busStemsOverlap = false;
  if (options.stems === "tracks") {
    stems = sources.map((track): PlannedAudioStem => ({ kind: "track", id: track.id, name: track.name,
      sourceTrackIds: [track.id] }));
  } else if (options.stems === "buses") {
    const chains = new Map(sources.map((track) => [track.id, routingChain(track, byId)]));
    const buses = document.trackOrder.map((id) => byId.get(id)!).filter((track) => track.kind === "bus");
    stems = buses.map((bus): PlannedAudioStem => ({ kind: "bus", id: bus.id, name: bus.name,
      sourceTrackIds: sources.filter((track) => chains.get(track.id)!.includes(bus.id))
        .map((track) => track.id) }))
      .filter((stem) => stem.sourceTrackIds.length > 0);
    const direct = sources.filter((track) => chains.get(track.id)!.length === 0).map((track) => track.id);
    if (direct.length > 0) stems.push({ kind: "direct", id: "master-direct",
      name: "Directo al master", sourceTrackIds: direct });
    busStemsOverlap = stems.some((stem) => stem.kind === "bus" &&
      byId.get(stem.id)?.mix.outputBusTrackId !== undefined);
  }
  return { startTick, endTick, durationSeconds, tailSeconds,
    sampleRate: options.sampleRate, stems, omittedSourceTrackIds,
    stemsAdditive: false, busStemsOverlap,
    projectLimiterIncluded: true,
    excludedStudioChain: ["piano-live-chorus", "piano-live-reverb",
      "piano-live-compressor", "piano-live-master-volume"] };
}
