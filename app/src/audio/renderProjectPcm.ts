import realmUrl from "./offlineRenderRealm.ts?worker&url";
import type { ProjectAssetRef, ProjectDocumentV1, ProjectTrack } from "../project/model";
import type { TransportSnapshot } from "../sequencer/transportScheduler";
import { MusicalClock } from "../sequencer/musicalClock";
import type { UserSampleReader } from "./userSampleAsset";
import type { ProjectAudioDiagnostics } from "./projectAudioSink";

export interface RenderProjectOptions {
  readonly startTick: number;
  readonly endTick: number;
  readonly sampleRate: number;
  readonly tailSeconds: number;
  readonly seed?: string;
  /** One source track stem. Mutually exclusive with trackIds. */
  readonly trackId?: string;
  /** Group of source tracks for a bus stem; their routing buses remain intact. */
  readonly trackIds?: readonly string[];
  /** Capture this bus only after inserts/pan, excluding all parallel/master paths. */
  readonly tapBusTrackId?: string;
  /** Capture source outlets routed directly to master, without their send returns. */
  readonly tapDirectMaster?: boolean;
}

export interface RenderProgress {
  readonly phase: "assets" | "preparing" | "rendering" | "done";
  readonly completed: number;
  readonly total: number;
}

export interface RenderedProjectPcm {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRate: number;
  readonly report: {
    readonly transport: TransportSnapshot;
    readonly audio: ProjectAudioDiagnostics;
    readonly selectedTrackIds: readonly string[];
  };
}

interface RealmReply {
  readonly kind: "progress" | "done" | "error";
  readonly progress?: RenderProgress;
  readonly error?: string;
  readonly left?: Float32Array;
  readonly right?: Float32Array;
  readonly sampleRate?: number;
  readonly report?: RenderedProjectPcm["report"];
}

function checkOptions(document: ProjectDocumentV1, options: RenderProjectOptions): number {
  if (document.ppq !== 960 || !Number.isSafeInteger(options.startTick) ||
      !Number.isSafeInteger(options.endTick) || options.startTick < 0 ||
      options.endTick <= options.startTick ||
      !Number.isSafeInteger(options.sampleRate) || options.sampleRate < 8_000 ||
      options.sampleRate > 96_000 || !Number.isFinite(options.tailSeconds) ||
      options.tailSeconds < 0 || options.tailSeconds > 5 ||
      (options.seed !== undefined && (typeof options.seed !== "string" || options.seed.length > 128)) ||
      (options.trackId !== undefined && options.trackIds !== undefined) ||
      (options.tapBusTrackId !== undefined &&
        (options.trackId !== undefined || options.trackIds === undefined)) ||
      (options.tapDirectMaster !== undefined && typeof options.tapDirectMaster !== "boolean") ||
      (options.tapDirectMaster === true &&
        (options.tapBusTrackId !== undefined ||
          options.trackId !== undefined || options.trackIds === undefined))) {
    throw new RangeError("Opciones de render musical inválidas");
  }
  const micros = document.tempoMap;
  let duration = 0;
  let cursor = options.startTick;
  while (cursor < options.endTick) {
    const tempo = [...micros].reverse().find((entry) => entry.tick <= cursor);
    if (!tempo) throw new RangeError("Mapa de tempo sin origen");
    const next = micros.find((entry) => entry.tick > cursor)?.tick ?? options.endTick;
    const end = Math.min(next, options.endTick);
    duration += (end - cursor) * tempo.microsPerQuarter / 960_000_000;
    cursor = end;
  }
  duration += options.tailSeconds;
  if (duration > 300 || duration * options.sampleRate * 2 * 4 > 256 * 1024 * 1024) {
    throw new RangeError("Render excede cinco minutos o 256 MiB de PCM estéreo");
  }
  return duration;
}

function selectTracks(document: ProjectDocumentV1, options: RenderProjectOptions): {
  readonly document: ProjectDocumentV1;
  readonly selectedTrackIds: readonly string[];
  readonly requiredAssets: readonly ProjectAssetRef[];
} {
  const byId = new Map(document.tracks.map((track) => [track.id, track]));
  const requested = options.trackId ? [options.trackId] : options.trackIds
    ? [...options.trackIds] : document.tracks.filter((track) => track.kind !== "bus")
      .map((track) => track.id);
  if (requested.length === 0 || new Set(requested).size !== requested.length) {
    throw new RangeError("Selección de pistas vacía o duplicada");
  }
  for (const id of requested) if (!byId.has(id)) throw new RangeError(`Pista ${id} inexistente`);
  if (options.trackId && byId.get(options.trackId)?.kind === "bus") {
    throw new RangeError("Un stem de bus necesita trackIds de sus pistas fuente");
  }
  const sourceIds = new Set(requested.filter((id) => byId.get(id)?.kind !== "bus"));
  if (sourceIds.size === 0) throw new RangeError("No hay pistas fuente para renderizar");
  const tapBus = options.tapBusTrackId ? byId.get(options.tapBusTrackId) : undefined;
  if (options.tapBusTrackId && tapBus?.kind !== "bus") {
    throw new RangeError("El punto de resampling debe ser una pista bus existente");
  }
  // A tapped bus receives both primary outputs and parallel sends. Include
  // only graph paths that can reach that bus; other paths are built as silent
  // placeholders and never reach the chosen offline output.
  const include = new Set(sourceIds);
  const reachesTap = (id: string, seen = new Set<string>()): boolean => {
    if (id === options.tapBusTrackId) return true;
    if (seen.has(id)) throw new RangeError("Ciclo de bus en render aislado");
    const track = byId.get(id);
    if (!track) throw new RangeError(`Ruta de audio ${id} inexistente`);
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const destinations = [track.mix.outputBusTrackId,
      ...track.mix.sends.map((send) => send.busTrackId)]
      .filter((next): next is string => next !== undefined);
    return destinations.some((next) => {
      const bus = byId.get(next);
      if (bus?.kind !== "bus") throw new RangeError(`Bus ${next} ausente`);
      return reachesTap(next, nextSeen);
    });
  };
  for (const id of sourceIds) {
    if (options.tapBusTrackId && !reachesTap(id)) {
      throw new RangeError(`Pista ${id} no llega al bus de resampling`);
    }
  }
  const pending = [...sourceIds];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const track = byId.get(id)!;
    const destinations = [track.mix.outputBusTrackId,
      ...track.mix.sends.map((send) => send.busTrackId)]
      .filter((next): next is string => next !== undefined);
    for (const next of destinations) {
      const bus = byId.get(next);
      if (bus?.kind !== "bus") throw new RangeError(`Bus ${next} ausente`);
      if (options.tapBusTrackId && !reachesTap(next)) continue;
      include.add(next);
      if (!visited.has(next)) pending.push(next);
    }
  }
  const routedTracks = document.tracks.filter((track) => include.has(track.id));
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const startUs = Math.round(clock.tickToSeconds(options.startTick) * 1_000_000);
  const endUs = Math.round(clock.tickToSeconds(options.endTick) * 1_000_000);
  const clips = document.clips.filter((clip) => {
    if (!sourceIds.has(clip.trackId) || clip.muted) return false;
    if (clip.kind === "audio" && clip.timeMode === "absolute") {
      return clip.absoluteStartUs! < endUs && clip.absoluteEndUs! > startUs;
    }
    return clip.startTick < options.endTick &&
      clip.startTick + clip.lengthTicks > options.startTick;
  });
  const assetIds = new Set<string>();
  for (const clip of clips) if (clip.kind === "audio") assetIds.add(clip.sourceId);
  for (const track of routedTracks) {
    if (track.instrument?.instrumentId === "user-sampler" &&
        track.instrument.presetId.startsWith("asset:")) {
      assetIds.add(track.instrument.presetId.slice(6));
    }
    for (const pad of track.drumRack?.pads ?? []) {
      if (pad.source?.kind === "asset") assetIds.add(pad.source.assetId);
    }
  }
  const requiredAssets = [...assetIds].map((id) => {
    const ref = document.assets.find((asset) => asset.id === id);
    if (!ref) throw new Error(`Activo ${id} ausente para exportación`);
    return ref;
  });
  // Keep outside sources as silent bus placeholders so global solo authority
  // remains identical to the full project without loading their instruments.
  const tracks: ProjectTrack[] = document.tracks.map((track) => include.has(track.id) ?
    track.id === options.tapBusTrackId
      ? { ...track, mix: { ...track.mix, outputBusTrackId: undefined } }
      : track : {
    id: track.id, name: track.name, kind: "bus", mix: { ...track.mix, sends: [], effects: [] },
  });
  const isTap = !!options.tapBusTrackId || !!options.tapDirectMaster;
  const automation = isTap ? document.automation.filter((lane) =>
    lane.target.scope === "track" && lane.target.ownerId !== undefined &&
    include.has(lane.target.ownerId)) : document.automation;
  return { document: { ...document, tracks, clips, automation,
    ...(isTap ? { mix: { masterGainDb: 0, masterEffects: [] } } : {}),
    assets: requiredAssets }, selectedTrackIds: [...sourceIds], requiredAssets };
}

/** Render in a separate same-origin realm so Tone's offline context never replaces live Studio. */
export async function renderProjectPcm(document: ProjectDocumentV1, options: RenderProjectOptions,
  assetReader: UserSampleReader, signal?: AbortSignal,
  onProgress?: (progress: RenderProgress) => void): Promise<RenderedProjectPcm> {
  checkOptions(document, options);
  const selected = selectTracks(document, options);
  if (signal?.aborted) throw new DOMException("Exportación cancelada", "AbortError");
  const assets: Array<{ ref: ProjectAssetRef; blob: Blob }> = [];
  for (const ref of selected.requiredAssets) {
    if (signal?.aborted) throw new DOMException("Exportación cancelada", "AbortError");
    const blob = await assetReader.readAsset(ref);
    if (!blob) throw new Error(`Activo ${ref.id}: bytes ausentes para exportación`);
    assets.push({ ref, blob });
    try { onProgress?.({ phase: "assets", completed: assets.length,
      total: selected.requiredAssets.length }); }
    catch { /* Progress observers cannot break an export. */ }
  }
  if (signal?.aborted) throw new DOMException("Exportación cancelada", "AbortError");
  return new Promise<RenderedProjectPcm>((resolve, reject) => {
    const frame = documentGlobal().createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;pointer-events:none";
    const channel = new MessageChannel();
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(readyTimer);
      clearTimeout(renderTimer);
      window.removeEventListener("message", onReady);
      signal?.removeEventListener("abort", onAbort);
      channel.port1.close();
      frame.remove();
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      channel.port1.postMessage({ kind: "cancel" });
      fail(new DOMException("Exportación cancelada", "AbortError"));
    };
    const onReady = (event: MessageEvent<{ kind?: string }>): void => {
      if (event.source !== frame.contentWindow || event.origin !== location.origin ||
          event.data?.kind !== "pmp-offline-realm-ready") return;
      clearTimeout(readyTimer);
      channel.port1.onmessage = (reply: MessageEvent<RealmReply>) => {
        const data = reply.data;
        if (data.kind === "progress" && data.progress) {
          try { onProgress?.(data.progress); } catch { /* UI progress cannot stop render. */ }
        } else if (data.kind === "error") fail(new Error(data.error ?? "Falló el render aislado"));
        else if (data.kind === "done") {
          if (!(data.left instanceof Float32Array) || !(data.right instanceof Float32Array) ||
              data.left.length !== data.right.length || data.left.length === 0 ||
              data.sampleRate !== options.sampleRate || !data.report) {
            fail(new Error("El render aislado devolvió PCM inválido"));
            return;
          }
          settled = true;
          cleanup();
          resolve({ left: data.left, right: data.right,
            sampleRate: data.sampleRate, report: data.report });
        }
      };
      frame.contentWindow?.postMessage({ kind: "render-project-pcm",
        document: selected.document, options, selectedTrackIds: selected.selectedTrackIds,
        assets }, location.origin, [channel.port2]);
    };
    const readyTimer = setTimeout(() => fail(new Error("Contexto de exportación no inició")), 30_000);
    const renderTimer = setTimeout(() => fail(new Error("Render excedió 600 segundos")), 600_000);
    window.addEventListener("message", onReady);
    signal?.addEventListener("abort", onAbort, { once: true });
    frame.addEventListener("load", () => {
      const script = frame.contentDocument?.createElement("script");
      if (!script || !frame.contentDocument?.body) {
        fail(new Error("No se pudo abrir contexto aislado de exportación"));
        return;
      }
      script.type = "module";
      script.src = realmUrl;
      frame.contentDocument.body.append(script);
    }, { once: true });
    documentGlobal().body.append(frame);
  });
}

function documentGlobal(): Document {
  if (typeof window === "undefined" || !window.document?.body) {
    throw new Error("Render PCM requiere un navegador con DOM");
  }
  return window.document;
}
