import * as Tone from "tone";
import type { ProjectAssetRef, ProjectDrumPad, ProjectDrumRack } from "../project/model";
import { OwnedVoiceRegistry, type OwnedVoiceHandle, type OwnedVoiceSnapshot } from "./ownedVoiceRegistry";
import { FREEPATS_HANDCLAP_NOTE, FREEPATS_HANDCLAP_VERSION,
  decodeFreePatsHandClap, fetchFreePatsHandClapManifest } from "./freePatsHandClap";
import { VIRTUOSITY_CORE_VERSION, decodeVirtuosityPiece,
  fetchVirtuosityManifest, virtuosityArticulation } from "./virtuosityCore";
import { TR808_FISCHER_SOURCE_NOTES, TR808_FISCHER_VERSION,
  decodeTr808FischerPiece, fetchTr808FischerManifest } from "./tr808FischerCore";
import { UserSampleCache, type UserSampleReader } from "./userSampleAsset";
import { retainUntilOfflineRender } from "./offlineGraphRetention";

const MAX_PREPARED_PCM_BYTES = 64 * 1024 * 1024;
const MAX_ACTIVE_VOICES = 40;
const MAX_ALLOCATED_VOICES = 48;

export interface DrumRackPadStatus {
  readonly padId: string;
  readonly note: number;
  readonly channel: number;
  readonly label: string;
  readonly assetStatus: "ready" | "loading" | "error";
  readonly sourceLabel: string;
  readonly error: string | null;
  readonly muted: boolean;
}

interface PadRuntime {
  readonly definition: ProjectDrumPad;
  readonly volume: Tone.Volume;
  readonly panner: Tone.Panner;
  readonly layers: Map<number, AudioBuffer[]>;
  readonly handles: Set<OwnedVoiceHandle>;
  sourceLabel: string;
  status: "ready" | "loading" | "error";
  error: string | null;
  nextVariant: number;
  muteOverride: boolean | null;
  soloOverride: boolean | null;
}

interface ActiveVoice {
  readonly pad: PadRuntime;
  readonly source: Tone.ToneBufferSource;
}

function bounded(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
}

function sourceLabel(pad: ProjectDrumPad): string {
  if (!pad.source) return "Sin muestra asignada";
  if (pad.source.kind === "asset") return `Muestra propia · ${pad.source.assetId}`;
  if (pad.source.ref.instrumentId === "virtuosity-core") {
    return "Virtuosity Drums · Austin McMahon · CC0";
  }
  if (pad.source.ref.instrumentId === "freepats-handclap") {
    return "FreePats World Percussion · Roberto · CC0";
  }
  if (pad.source.ref.instrumentId === "tr808-fischer-core") {
    return "TR-808 real · Michael Fischer / Technopolis · CC0";
  }
  return `Fuente no aprobada · ${pad.source.ref.instrumentId}`;
}

function slicePadBuffer(buffer: AudioBuffer, pad: ProjectDrumPad,
  context: BaseAudioContext): AudioBuffer {
  const start = pad.startFrame;
  const end = pad.endFrame ?? buffer.length;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 ||
      end <= start || end > buffer.length) {
    throw new Error(`Pad ${pad.id}: región excede la grabación original`);
  }
  const frames = end - start;
  const output = context.createBuffer(buffer.numberOfChannels, frames, buffer.sampleRate);
  const finalFade = pad.playMode === "oneShot" && pad.decayMs > 0
    ? Math.min(frames, Math.round(pad.decayMs * buffer.sampleRate / 1000)) : 0;
  const safety = Math.min(64, Math.floor(frames / 2));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const target = output.getChannelData(channel);
    for (let frame = 0; frame < frames; frame++) {
      const value = source[start + frame]!;
      if (!Number.isFinite(value)) throw new Error(`Pad ${pad.id}: PCM no finito`);
      const fadeStart = Math.min(1, (frame + 1) / Math.max(1, safety));
      const fadeEnd = Math.min(1, (frames - frame) / Math.max(1, finalFade, safety));
      target[frame] = value * Math.min(fadeStart, fadeEnd);
    }
  }
  return output;
}

/** Pad-scoped recorded sources; no fallback to an unrelated GM instrument. */
export class DrumRackEngine {
  private readonly pads: PadRuntime[];
  private readonly byTrigger = new Map<string, PadRuntime>();
  private readonly registry = new OwnedVoiceRegistry();
  private readonly voices = new Map<OwnedVoiceHandle, ActiveVoice>();
  private readonly assets: readonly ProjectAssetRef[];
  private readonly reader?: UserSampleReader;
  private readonly sampleCache: UserSampleCache;
  private readonly ownsCache: boolean;
  private readonly onVoiceEnd?: () => void;
  private preparedPcmBytes = 0;
  private dropped = 0;
  private disposed = false;

  constructor(rack: ProjectDrumRack, assets: readonly ProjectAssetRef[],
    destination: Tone.ToneAudioNode, options: {
      readonly reader?: UserSampleReader;
      readonly sampleCache?: UserSampleCache;
      readonly onVoiceEnd?: () => void;
    } = {}) {
    if (rack.pads.length !== 16) throw new RangeError("El rack necesita 16 pads");
    const triggers = new Set<string>();
    for (const definition of rack.pads) {
      const key = `${definition.channel}:${definition.midiNote}`;
      if (triggers.has(key)) throw new RangeError(`Dos pads usan ${key}`);
      triggers.add(key);
    }
    this.assets = assets;
    this.reader = options.reader;
    this.sampleCache = options.sampleCache ?? new UserSampleCache();
    this.ownsCache = !options.sampleCache;
    this.onVoiceEnd = options.onVoiceEnd;
    this.pads = rack.pads.map((definition) => {
      const key = `${definition.channel}:${definition.midiNote}`;
      const panner = new Tone.Panner(definition.pan).connect(destination);
      const volume = new Tone.Volume(definition.gainDb).connect(panner);
      const pad: PadRuntime = { definition, volume, panner, layers: new Map(),
        handles: new Set(), sourceLabel: sourceLabel(definition),
        status: definition.source ? "loading" : "error",
        error: definition.source ? null : "Pad sin muestra asignada",
        nextVariant: 0, muteOverride: null, soloOverride: null };
      this.byTrigger.set(key, pad);
      return pad;
    });
  }

  async prepare(): Promise<readonly DrumRackPadStatus[]> {
    await Promise.all(this.pads.map(async (pad) => {
      if (pad.status !== "loading") return;
      try {
        const rawLayers = await this.loadPad(pad.definition);
        if (this.disposed) return;
        const prepared = new Map<number, AudioBuffer[]>();
        let preparedBytes = 0;
        for (const [layer, buffers] of rawLayers) {
          const slices = buffers.map((buffer) => slicePadBuffer(buffer, pad.definition,
            Tone.getContext().rawContext));
          const bytes = slices.reduce((sum, buffer) =>
            sum + buffer.length * buffer.numberOfChannels * 4, 0);
          if (this.preparedPcmBytes + preparedBytes + bytes > MAX_PREPARED_PCM_BYTES) {
            throw new Error("El rack excede 64 MiB de regiones PCM preparadas");
          }
          preparedBytes += bytes;
          prepared.set(layer, slices);
        }
        if (prepared.size === 0) throw new Error("Fuente de pad sin grabaciones decodificadas");
        for (const [layer, buffers] of prepared) pad.layers.set(layer, buffers);
        this.preparedPcmBytes += preparedBytes;
        pad.status = "ready";
        pad.error = null;
      } catch (error) {
        pad.status = "error";
        pad.error = error instanceof Error ? error.message : String(error);
      }
    }));
    return this.padStatus();
  }

  private async loadPad(pad: ProjectDrumPad): Promise<Map<number, AudioBuffer[]>> {
    const source = pad.source;
    if (!source) throw new Error(`Pad ${pad.id} sin fuente`);
    if (source.kind === "asset") {
      const ref = this.assets.find((asset) => asset.id === source.assetId);
      if (!ref || ref.sha256 !== source.sha256 ||
          (ref.sourceKind !== "user" && ref.sourceKind !== "recorded") || !this.reader) {
        throw new Error(`Pad ${pad.id}: muestra propia ausente o hash no coincide`);
      }
      const sample = await this.sampleCache.load(ref, this.reader, Tone.getContext().rawContext);
      return new Map([[127, [sample.buffer]]]);
    }
    const { ref, sourceNote } = source;
    if (ref.instrumentId === "virtuosity-core" &&
        ref.packageVersion === VIRTUOSITY_CORE_VERSION && ref.presetId === "core") {
      const articulation = virtuosityArticulation(sourceNote);
      if (!articulation) throw new Error(`Pad ${pad.id}: Virtuosity no contiene nota ${sourceNote}`);
      return decodeVirtuosityPiece(await fetchVirtuosityManifest(), articulation,
        Tone.getContext().rawContext);
    }
    if (ref.instrumentId === "freepats-handclap" &&
        ref.packageVersion === FREEPATS_HANDCLAP_VERSION && ref.presetId === "core" &&
        sourceNote === FREEPATS_HANDCLAP_NOTE) {
      const buffers = await decodeFreePatsHandClap(await fetchFreePatsHandClapManifest(),
        Tone.getContext().rawContext);
      return new Map([[127, buffers]]);
    }
    if (ref.instrumentId === "tr808-fischer-core" &&
        ref.packageVersion === TR808_FISCHER_VERSION && ref.presetId === "core" &&
        Object.hasOwn(TR808_FISCHER_SOURCE_NOTES, sourceNote)) {
      return decodeTr808FischerPiece(await fetchTr808FischerManifest(), sourceNote,
        Tone.getContext().rawContext);
    }
    throw new Error(`Pad ${pad.id}: banco, versión, preset o nota de fuente no aprobados`);
  }

  private muted(pad: PadRuntime): boolean {
    if (pad.muteOverride ?? pad.definition.mute) return true;
    const anySolo = this.pads.some((candidate) => candidate.soloOverride ?? candidate.definition.solo);
    return anySolo && !(pad.soloOverride ?? pad.definition.solo);
  }

  trigger(note: number, channel: number, velocity: number,
    ownerId: string, epoch: number, audioTime: number, outGain = 1): OwnedVoiceHandle | null {
    if (this.disposed) return null;
    const pad = this.byTrigger.get(`${channel}:${note}`);
    if (!pad || pad.status !== "ready" || this.muted(pad)) return null;
    if (!Number.isSafeInteger(velocity) || velocity < 1 || velocity > 127 ||
        !ownerId || !Number.isSafeInteger(epoch) || epoch < 0 ||
        !Number.isFinite(audioTime) || audioTime < 0 ||
        !Number.isFinite(outGain) || outGain < 0) throw new RangeError("Golpe de pad inválido");
    if (pad.definition.chokeGroup) {
      for (const [handle, voice] of this.voices) {
        if (voice.pad.definition.chokeGroup === pad.definition.chokeGroup &&
            !this.registry.isReleasing(handle)) {
          const fade = bounded(voice.pad.definition.decayMs / 1000, 0.005, 2);
          this.registry.releaseHandle(handle, audioTime, fade);
        }
      }
    }
    if (this.registry.activeCount >= MAX_ACTIVE_VOICES) {
      const oldest = [...this.voices.keys()].find((handle) => !this.registry.isReleasing(handle));
      if (oldest) this.registry.releaseHandle(oldest, audioTime, 0.008);
    }
    if (this.voices.size >= MAX_ALLOCATED_VOICES) { this.dropped++; return null; }
    const sensitivity = bounded(pad.definition.velocitySensitivity ?? 1, 0, 2);
    const normalizedVelocity = velocity / 127;
    const shapedVelocity = bounded(0.75 + (normalizedVelocity - 0.75) * sensitivity, 0.01, 1);
    const layers = [...pad.layers.keys()].sort((a, b) => a - b);
    const layer = layers[Math.max(0, Math.ceil(shapedVelocity * layers.length) - 1)]!;
    const variants = pad.layers.get(layer)!;
    const buffer = variants[pad.nextVariant++ % variants.length]!;
    const rate = 2 ** (pad.definition.pitchSemitones / 12);
    const level = Math.min(16, shapedVelocity ** 1.35 * outGain);
    const fade = bounded(pad.definition.decayMs / 1000, 0.005, 2);
    let handle: OwnedVoiceHandle | null = null;
    let finished = false;
    const source = new Tone.ToneBufferSource({ url: buffer,
      playbackRate: rate, fadeIn: bounded(pad.definition.attackMs / 1000, 0.002, 2),
      fadeOut: fade, onended: () => finish(true) }).connect(pad.volume);
    const finish = (naturallyEnded = false): void => {
      if (finished) return;
      finished = true;
      if (handle) {
        this.voices.delete(handle);
        pad.handles.delete(handle);
        this.registry.finish(handle);
      }
      const dispose = (): void => { source.dispose(); };
      if (!naturallyEnded || !retainUntilOfflineRender(source.context, dispose)) dispose();
      this.onVoiceEnd?.();
    };
    handle = this.registry.register({ ownerId, epoch,
      release: (at, fadeSeconds) => {
        if (at < audioTime - 0.001) { finish(); return; }
        source.fadeOut = Math.max(0.005, fadeSeconds);
        source.stop(Math.max(audioTime, at));
      } });
    this.voices.set(handle, { pad, source });
    pad.handles.add(handle);
    try { source.start(audioTime, 0, undefined, level); }
    catch (error) { finish(); throw error; }
    return handle;
  }

  noteOffHandle(handle: OwnedVoiceHandle, audioTime: number): boolean {
    const pad = this.voices.get(handle)?.pad;
    if (!pad) return false;
    if (pad.definition.playMode === "oneShot") return this.registry.markReleasing(handle);
    return this.registry.releaseHandle(handle, audioTime,
      bounded(pad.definition.decayMs / 1000, 0.005, 2));
  }

  releaseOwner(ownerId: string, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseOwner(ownerId, audioTime, 0.008, includeDescendants);
  }

  releaseEpoch(ownerId: string, epoch: number, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseEpoch(ownerId, epoch, audioTime, 0.008, includeDescendants);
  }

  setPadMute(padId: string, muted: boolean, audioTime = Tone.immediate()): void {
    const pad = this.pads.find((candidate) => candidate.definition.id === padId);
    if (!pad) throw new RangeError(`Pad desconocido ${padId}`);
    pad.muteOverride = muted;
    if (muted) for (const handle of pad.handles) this.registry.releaseHandle(handle, audioTime, 0.008);
  }

  setPadSolo(padId: string, solo: boolean, audioTime = Tone.immediate()): void {
    const pad = this.pads.find((candidate) => candidate.definition.id === padId);
    if (!pad) throw new RangeError(`Pad desconocido ${padId}`);
    pad.soloOverride = solo;
    for (const candidate of this.pads) {
      if (this.muted(candidate)) {
        for (const handle of candidate.handles) this.registry.releaseHandle(handle, audioTime, 0.008);
      }
    }
  }

  padStatus(): readonly DrumRackPadStatus[] {
    return this.pads.map((pad) => ({ padId: pad.definition.id,
      note: pad.definition.midiNote, channel: pad.definition.channel,
      label: pad.definition.name, assetStatus: pad.status,
      sourceLabel: pad.sourceLabel, error: pad.error, muted: this.muted(pad) }));
  }

  voiceSnapshot(): OwnedVoiceSnapshot & { readonly dropped: number;
    readonly preparedPcmBytes: number } {
    return { ...this.registry.snapshot(), dropped: this.dropped,
      preparedPcmBytes: this.preparedPcmBytes };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.registry.panic(Tone.immediate(), 0.008);
    for (const [handle, voice] of this.voices) {
      voice.source.dispose();
      this.registry.finish(handle);
    }
    this.voices.clear();
    for (const pad of this.pads) {
      pad.handles.clear();
      pad.layers.clear();
      pad.volume.dispose();
      pad.panner.dispose();
    }
    if (this.ownsCache) this.sampleCache.clear();
    this.preparedPcmBytes = 0;
  }
}
