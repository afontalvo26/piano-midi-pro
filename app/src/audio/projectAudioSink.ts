import * as Tone from "tone";
import { DrumKitEngine } from "../engine/DrumKitEngine";
import type { ProjectAssetRef, ProjectAutomationLane, ProjectDocumentV1,
  ProjectMixChannel, ProjectTrack } from "../project/model";
import type { OwnedVoiceHandle } from "./ownedVoiceRegistry";
import { LiveVoiceController } from "./liveVoiceController";
import { DecodedPianoSampleBank, ToneSampleVoiceFactory } from "./toneSampleVoiceFactory";
import { VIRTUOSITY_CORE_VERSION, VIRTUOSITY_CORE_NOTES } from "./virtuosityCore";
import { FREEPATS_HANDCLAP_NOTE, FREEPATS_HANDCLAP_VERSION } from "./freePatsHandClap";
import { UserSampleCache, type UserSampleReader } from "./userSampleAsset";
import { UserSampleEngine, defaultUserSampleRegion } from "./userSampleEngine";
import { MonoUserSampleEngine } from "./monoUserSampleEngine";
import { DrumRackEngine, type DrumRackPadStatus } from "./drumRackEngine";
import { AudioClipEngine } from "./audioClipEngine";
import { connectProjectEffects } from "./projectEffects.ts";
import { assertSafeAudioRouting } from "../project/mixRouting.ts";
import { SALAMANDER_CORE_PACKAGE_VERSION } from "./verifiedSalamanderCore";
import { TR808_FISCHER_VERSION, loadTr808FischerBass,
  tr808FischerBassRegion } from "./tr808FischerCore";
import type {
  ScheduledAudioClip, ScheduledAuthority, ScheduledAutomation, ScheduledControl,
  ScheduledMetronomeTick, ScheduledNoteOff,
  ScheduledNoteOn, SequencerSink,
} from "../sequencer/timelineEvents";

/** Exact local package references. A mismatched version never sounds as another bank. */
export { SALAMANDER_CORE_PACKAGE_VERSION };
export const PROJECT_PIANO_INSTRUMENT = {
  instrumentId: "salamander-grand", packageVersion: SALAMANDER_CORE_PACKAGE_VERSION, presetId: "natural",
} as const;
export const PROJECT_DRUM_INSTRUMENT = {
  instrumentId: "virtuosity-core", packageVersion: VIRTUOSITY_CORE_VERSION, presetId: "core",
} as const;
/** Separate opt-in bank: existing Virtuosity projects keep their exact preset. */
export const PROJECT_CLAP_INSTRUMENT = {
  instrumentId: "freepats-handclap", packageVersion: FREEPATS_HANDCLAP_VERSION, presetId: "core",
} as const;
export const PROJECT_808_INSTRUMENT = {
  instrumentId: "tr808-fischer-core", packageVersion: TR808_FISCHER_VERSION, presetId: "core",
} as const;
const MAX_PROJECT_PIANO_SOURCES = 64;
const MAX_PROJECT_DRUM_SOURCES = 48;
const MAX_PROJECT_SAMPLE_SOURCES = 32;
const MAX_PROJECT_AUDIO_CLIP_SOURCES = 24;
const SIDECHAIN_PROCESSOR_NAME = "pmp-sidechain-detector-v1";
const sidechainWorkletLoads = new WeakMap<BaseAudioContext, Promise<void>>();

async function loadSidechainWorklet(context: BaseAudioContext): Promise<void> {
  if (!context.audioWorklet) throw new Error("AudioWorklet no disponible para sidechain");
  let task = sidechainWorkletLoads.get(context);
  if (!task) {
    task = context.audioWorklet.addModule(new URL("./sidechainDetectorProcessor.js", import.meta.url).href);
    sidechainWorkletLoads.set(context, task);
  }
  try { await task; }
  catch (error) { sidechainWorkletLoads.delete(context); throw error; }
}

export interface ProjectTrackAudioStatus {
  readonly trackId: string;
  readonly kind: ProjectTrack["kind"];
  readonly status: "ready" | "error" | "loading";
  readonly error: string | null;
  readonly instrumentId: string | null;
  readonly packageVersion: string | null;
  readonly presetId: string | null;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly gainDb: number;
  readonly pan: number;
  readonly sidechainSourceTrackId: string | null;
  readonly sidechainReductionDb: number;
  readonly sidechainReductionPeakDb: number;
  readonly sidechainError: string | null;
  readonly effectComparisonMode: "off" | "original" | "processed";
  readonly effectComparisonOriginalDb: number;
  readonly effectComparisonProcessedDb: number;
  readonly meter: ProjectMeterSnapshot;
  readonly activeVoices: number;
  readonly allocatedVoices: number;
}

export interface ProjectMeterSnapshot {
  /** Linear PCM peak in the most recently observed analysis window. */
  readonly peak: number;
  readonly rms: number;
  readonly clipped: boolean;
  readonly clipEvents: number;
}

interface MeterState {
  lastAt: number;
  clippedLastRead: boolean;
  snapshot: ProjectMeterSnapshot;
}

export interface ProjectAudioDiagnostics {
  readonly projectId: string;
  readonly tracks: readonly ProjectTrackAudioStatus[];
  readonly metronome: { readonly ready: boolean; readonly error: string | null };
  readonly masterGainDb: number;
  readonly masterMeter: ProjectMeterSnapshot;
  readonly masterError: string | null;
  readonly unsupportedControls: number;
  readonly missingAttacks: number;
  readonly projectPianoSources: number;
  readonly projectPianoSourceLimit: number;
  readonly projectDrumSources: number;
  readonly projectDrumSourceLimit: number;
  readonly projectSampleSources: number;
  readonly projectSampleSourceLimit: number;
  readonly samplePcmBytes: number;
  readonly projectAudioClipSources: number;
  readonly projectAudioClipSourceLimit: number;
}

interface TrackSlot {
  readonly track: ProjectTrack;
  readonly volume: Tone.Volume;
  readonly panner: Tone.Panner;
  readonly muteGate: Tone.Gain;
  /** Post-fader main output can be isolated independently from auxiliary sends. */
  readonly mainGate: Tone.Gain;
  /** Audio-rate gain controlled by the sidechain detector; unity when sidechain is disabled. */
  readonly sidechainGate: Tone.Gain;
  readonly meter: Tone.Analyser;
  readonly meterState: MeterState;
  readonly originalEffectMeter: Tone.Analyser;
  readonly originalEffectMeterState: MeterState;
  readonly processedEffectMeter: Tone.Analyser;
  readonly processedEffectMeterState: MeterState;
  readonly originalEffectGain: Tone.Gain;
  readonly processedEffectGain: Tone.Gain;
  effectComparisonMode: "off" | "original" | "processed";
  effectComparisonOriginalDb: number;
  effectComparisonProcessedDb: number;
  readonly effects: Tone.ToneAudioNode[];
  /** Independent post-fader, post-insert sends to bus inputs. */
  readonly sends: Tone.Gain[];
  sidechainNode: AudioWorkletNode | null;
  sidechainSource: Tone.Analyser | null;
  sidechainReductionDb: number;
  sidechainReductionPeakDb: number;
  sidechainError: string | null;
  piano: LiveVoiceController | null;
  drums: DrumKitEngine | null;
  sampler: UserSampleEngine | MonoUserSampleEngine | null;
  rack: DrumRackEngine | null;
  audioClips: AudioClipEngine | null;
  sampleAsset: ProjectAssetRef | null;
  status: ProjectTrackAudioStatus["status"];
  error: string | null;
  muteOverride: boolean | null;
  soloOverride: boolean | null;
  gainOverride: number | null;
  panOverride: number | null;
  activePianoSources: number;
  readonly originsByEpoch: Map<number, Set<string>>;
  readonly drumControls: Map<string, { volume: number; expression: number }>;
  readonly sampleControls: Map<string, { volume: number; expression: number }>;
  retired: boolean;
  disposed: boolean;
}

function matchesRef(track: ProjectTrack, expected: typeof PROJECT_PIANO_INSTRUMENT |
  typeof PROJECT_DRUM_INSTRUMENT | typeof PROJECT_CLAP_INSTRUMENT |
  typeof PROJECT_808_INSTRUMENT): boolean {
  const ref = track.instrument;
  return ref?.instrumentId === expected.instrumentId &&
    ref.packageVersion === expected.packageVersion && ref.presetId === expected.presetId;
}

function originInputId(ownerId: string): string {
  // One MIDI origin per clip and epoch, without accumulating an origin per loop.
  return ownerId.replace(/\/iteration-\d+(?=\/epoch-\d+$)/, "");
}

function bounded(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
}

function readMeter(analyser: Tone.Analyser, state: MeterState): ProjectMeterSnapshot {
  const now = Tone.immediate();
  if (now - state.lastAt < 1 / 30) return state.snapshot;
  state.lastAt = now;
  const value = analyser.getValue();
  const channels = Array.isArray(value) ? value : [value];
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index++) {
      const sample = channel[index]!;
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
      count++;
    }
  }
  const clipped = peak >= 0.999;
  state.snapshot = { peak, rms: count ? Math.sqrt(sumSquares / count) : 0,
    clipped, clipEvents: state.snapshot.clipEvents + (clipped && !state.clippedLastRead ? 1 : 0) };
  state.clippedLastRead = clipped;
  return state.snapshot;
}

function validMixNumber(value: number, low: number, high: number, name: string): void {
  if (!Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`${name} fuera de rango`);
  }
}

/** One project bus connected to the existing Studio graph, with isolated slots per track. */
export class ProjectAudioSink implements SequencerSink {
  readonly projectId: string;
  readonly rootOwnerId: string;
  private readonly master: Tone.Volume;
  private readonly masterMeter: Tone.Analyser;
  private readonly masterEffects: Tone.ToneAudioNode[] = [];
  private readonly masterMeterState: MeterState = {
    lastAt: -Infinity, clippedLastRead: false,
    snapshot: { peak: 0, rms: 0, clipped: false, clipEvents: 0 },
  };
  private masterGainOverride: number | null = null;
  private readonly masterError: string | null;
  private readonly slots = new Map<string, TrackSlot>();
  private readonly effectiveMute = new Map<string, boolean>();
  private readonly handles = new Map<OwnedVoiceHandle, TrackSlot>();
  private readonly automatedParameters = new Set<string>();
  /** Parameters temporarily owned by a physical/Touch control; timeline events must not overwrite them. */
  private readonly liveAutomationOverrides = new Map<string, number>();
  /** First read event after a physical release must crossfade back instead of snapping. */
  private readonly physicalAutomationReturns = new Set<string>();
  private automationReplanAt: number | null = null;
  private readonly pendingAutomationReturn = new Set<string>();
  private readonly replannedAutomation = new Set<string>();
  private readonly ownsAudio: () => boolean;
  private readonly document: ProjectDocumentV1;
  private readonly pianoBank: DecodedPianoSampleBank;
  private readonly retired = new Set<TrackSlot>();
  private unsupportedControls = 0;
  private missingAttacks = 0;
  private projectPianoSources = 0;
  private projectDrumSources = 0;
  private projectSampleSources = 0;
  private projectAudioClipSources = 0;
  private readonly sampleCache = new UserSampleCache();
  private readonly assetReader?: UserSampleReader;
  private readonly metronomeDrums: DrumKitEngine;
  private metronomeError: string | null = null;
  private disposed = false;
  private masterDisposed = false;

  constructor(document: ProjectDocumentV1, destination: Tone.ToneAudioNode,
    pianoBank: DecodedPianoSampleBank, ownsAudio: () => boolean,
    assetReader?: UserSampleReader,
    /** Offline-only graph hints: isolated taps plus detector-only tracks for sidechain stems. */
    renderTap?: { readonly busTrackId?: string; readonly directMaster?: boolean;
      readonly silentTrackIds?: readonly string[] }) {
    if (document.ppq !== 960) throw new RangeError("project audio requires 960 PPQ");
    assertSafeAudioRouting(document);
    const tappedBusId = renderTap?.busTrackId;
    const silentTrackIds = new Set(renderTap?.silentTrackIds ?? []);
    if ([...silentTrackIds].some((id) => !document.tracks.some((track) =>
      track.id === id && track.kind !== "bus"))) {
      throw new RangeError("Pista silenciosa de detector inválida");
    }
    if ((tappedBusId && renderTap?.directMaster) ||
        (tappedBusId && !document.tracks.some((track) =>
          track.id === tappedBusId && track.kind === "bus"))) {
      throw new RangeError("Punto de captura de audio inválido");
    }
    this.projectId = document.id;
    this.document = document;
    this.rootOwnerId = `transport/${document.id}`;
    this.pianoBank = pianoBank;
    this.ownsAudio = ownsAudio;
    this.assetReader = assetReader;
    this.master = new Tone.Volume(document.mix.masterGainDb);
    this.masterMeter = new Tone.Analyser({ type: "waveform", size: 2048, channels: 2 });
    // In a tapped offline render the master graph is deliberately silent.
    // Connecting a chosen bus's post-fader meter straight to the destination
    // excludes all other parallel paths, parent buses and master processing.
    if (!renderTap?.busTrackId && !renderTap?.directMaster) {
      this.masterMeter.connect(destination);
    }
    let masterError: string | null = null;
    try {
      this.masterEffects.push(...connectProjectEffects(document.mix.masterEffects,
        this.master, this.masterMeter));
    } catch (error) {
      masterError = error instanceof Error ? error.message : String(error);
    }
    this.masterError = masterError;
    this.metronomeDrums = new DrumKitEngine(this.master, { source: "virtuosity-core",
      onVoiceEnd: () => this.maybeDisposeMaster() });
    try {
      for (const track of document.tracks) this.slots.set(track.id, this.createSlot(track));
      for (const slot of this.slots.values()) {
        const target = slot.track.mix.outputBusTrackId
          ? this.slots.get(slot.track.mix.outputBusTrackId)
          : null;
        if (slot.track.mix.outputBusTrackId && (!target || target.track.kind !== "bus")) {
          throw new Error(`Pista ${slot.track.id}: bus de salida inexistente`);
        }
        slot.panner.connect(slot.sidechainGate);
        slot.sidechainGate.connect(slot.meter);
        slot.meter.connect(slot.mainGate);
        const detectorOnly = silentTrackIds.has(slot.track.id);
        if (!detectorOnly) slot.mainGate.connect(target?.volume ?? this.master);
        if (!detectorOnly && (renderTap?.busTrackId === slot.track.id ||
            (renderTap?.directMaster && slot.track.kind !== "bus" &&
              !slot.track.mix.outputBusTrackId))) {
          // Direct stem must hear only the actual main outlet, not the sends.
          (renderTap?.directMaster ? slot.mainGate : slot.meter).connect(destination);
        }
        for (const send of slot.track.mix.sends) {
          const bus = this.slots.get(send.busTrackId);
          if (!bus || bus.track.kind !== "bus" || bus === slot) {
            throw new Error(`Envío ${send.id}: bus destino inválido`);
          }
          const sendGain = new Tone.Gain(10 ** (send.gainDb / 20));
          slot.sends.push(sendGain);
          slot.meter.connect(sendGain);
          if (!detectorOnly) sendGain.connect(bus.volume);
        }
      }
      this.refreshMute();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private createSlot(track: ProjectTrack): TrackSlot {
    const panner = new Tone.Panner(track.mix.pan);
    const muteGate = new Tone.Gain(1).connect(panner);
    const mainGate = new Tone.Gain(1);
    const sidechainGate = new Tone.Gain(1);
    const volume = new Tone.Volume(track.mix.gainDb);
    const meter = new Tone.Analyser({ type: "waveform", size: 2048, channels: 2 });
    const meterState: MeterState = { lastAt: -Infinity, clippedLastRead: false,
      snapshot: { peak: 0, rms: 0, clipped: false, clipEvents: 0 } };
    const originalEffectMeter = new Tone.Analyser({ type: "waveform", size: 2048, channels: 2 });
    const processedEffectMeter = new Tone.Analyser({ type: "waveform", size: 2048, channels: 2 });
    const originalEffectMeterState: MeterState = { lastAt: -Infinity, clippedLastRead: false,
      snapshot: { peak: 0, rms: 0, clipped: false, clipEvents: 0 } };
    const processedEffectMeterState: MeterState = { lastAt: -Infinity, clippedLastRead: false,
      snapshot: { peak: 0, rms: 0, clipped: false, clipEvents: 0 } };
    const originalEffectGain = new Tone.Gain(0).connect(muteGate);
    const processedEffectGain = new Tone.Gain(1).connect(muteGate);
    originalEffectMeter.connect(originalEffectGain);
    processedEffectMeter.connect(processedEffectGain);
    const slot: TrackSlot = { track, volume, panner, muteGate, mainGate, sidechainGate, meter, meterState,
      originalEffectMeter, originalEffectMeterState, processedEffectMeter, processedEffectMeterState,
      originalEffectGain, processedEffectGain, effectComparisonMode: "off",
      effectComparisonOriginalDb: 0, effectComparisonProcessedDb: 0, effects: [],
      sends: [], sidechainNode: null, sidechainSource: null, sidechainReductionDb: 0,
      sidechainReductionPeakDb: 0, sidechainError: null, piano: null, drums: null,
      sampler: null, rack: null, audioClips: null, sampleAsset: null,
      status: "loading", error: null, muteOverride: null, soloOverride: null,
      gainOverride: null, panOverride: null,
      activePianoSources: 0, originsByEpoch: new Map(), drumControls: new Map(),
      sampleControls: new Map(),
      retired: false, disposed: false };
    if (track.kind === "bus") {
      slot.status = "ready";
    } else if (track.kind === "instrument") {
      if (track.instrument?.instrumentId === "user-sampler") {
        const preset = track.instrument.presetId;
        const asset = preset.startsWith("asset:")
          ? this.document.assets.find((candidate) => candidate.id === preset.slice(6))
          : undefined;
        if (!asset || (asset.sourceKind !== "user" && asset.sourceKind !== "recorded") ||
            track.instrument.packageVersion !== `sha256:${asset.sha256}`) {
          slot.status = "error";
          slot.error = "Sampler: referencia de activo o versión no aprobada";
        } else if (!this.assetReader) {
          slot.status = "error";
          slot.error = `Sampler: no hay lector de activo para ${asset.id}`;
        } else {
          slot.sampleAsset = asset;
        }
      } else if (matchesRef(track, PROJECT_808_INSTRUMENT)) {
        // The exact local long-kick recording is prepared after the graph is
        // connected, just like user samples, but it never enters project CAS.
      } else if (!matchesRef(track, PROJECT_PIANO_INSTRUMENT)) {
        slot.status = "error";
        slot.error = `Banco no instalado o versión/preset no aprobados: ${track.instrument?.instrumentId ?? "sin instrumento"}`;
      } else if (this.pianoBank.coverage(48, 84, 6).missing.length > 0) {
        slot.status = "error";
        slot.error = "Faltan muestras Salamander núcleo para C3–C6";
      } else {
        const factory = new ToneSampleVoiceFactory(this.pianoBank, volume, {
          maxShiftSemitones: 6, attackSeconds: 0, velocityColor: true,
          primaryRange: { minMidi: 48, maxMidi: 84 },
        });
        slot.piano = new LiveVoiceController({ create: (attack, initial, onEnded) => {
          // Project polyphony is bounded across tracks; the separate live
          // controller keeps its 37 physical keys independent of beat density.
          if (this.projectPianoSources >= MAX_PROJECT_PIANO_SOURCES) return null;
          this.projectPianoSources++;
          slot.activePianoSources++;
          try {
            const voice = factory.create(attack, initial, () => {
              this.projectPianoSources--;
              slot.activePianoSources--;
              onEnded();
              this.maybeDisposeRetired(slot);
            });
            if (!voice) { this.projectPianoSources--; slot.activePianoSources--; }
            return voice;
          } catch (error) {
            this.projectPianoSources--;
            slot.activePianoSources--;
            throw error;
          }
        } });
        slot.status = "ready";
      }
    } else if (track.kind === "drum") {
      if (track.drumRack) {
        slot.rack = new DrumRackEngine(track.drumRack, this.document.assets, volume, {
          reader: this.assetReader, sampleCache: this.sampleCache,
          onVoiceEnd: () => {
            this.projectDrumSources = Math.max(0, this.projectDrumSources - 1);
            this.maybeDisposeRetired(slot);
          },
        });
      } else if (!matchesRef(track, PROJECT_DRUM_INSTRUMENT) && !matchesRef(track, PROJECT_CLAP_INSTRUMENT)) {
        slot.status = "error";
        slot.error = `Kit no instalado o versión/preset no aprobados: ${track.instrument?.instrumentId ?? "sin kit"}`;
      } else {
        slot.drums = new DrumKitEngine(volume, { source: matchesRef(track, PROJECT_CLAP_INSTRUMENT)
          ? "freepats-clap" : "virtuosity-core",
          onVoiceEnd: () => {
            this.projectDrumSources = Math.max(0, this.projectDrumSources - 1);
            this.maybeDisposeRetired(slot);
          } });
      }
    } else {
      slot.audioClips = new AudioClipEngine(track.id, this.document.clips, this.document.assets,
        volume, this.sampleCache, this.assetReader, () => {
          this.projectAudioClipSources = Math.max(0, this.projectAudioClipSources - 1);
          this.maybeDisposeRetired(slot);
        }, this.document.audioCrossfades ?? []);
      if (!slot.audioClips.hasClips) slot.status = "ready";
    }
    if (slot.status !== "error") {
      try {
        volume.connect(originalEffectMeter);
        slot.effects.push(...connectProjectEffects(track.mix.effects, volume, processedEffectMeter));
      } catch (error) {
        slot.status = "error";
        slot.error = error instanceof Error ? error.message : String(error);
      }
    }
    return slot;
  }

  /** Prepare every approved kit piece before the scheduler can make a hit. */
  async prepare(options: { readonly metronome?: boolean } = {}): Promise<ProjectAudioDiagnostics> {
    await Promise.all([...this.slots.values()].map(async (slot) => {
      if (matchesRef(slot.track, PROJECT_808_INSTRUMENT) && slot.status === "loading") {
        try {
          const sample = await loadTr808FischerBass(Tone.getContext().rawContext);
          if (this.disposed) return;
          const onVoiceEnd = (): void => {
            this.projectSampleSources = Math.max(0, this.projectSampleSources - 1);
            this.maybeDisposeRetired(slot);
          };
          slot.sampler = new MonoUserSampleEngine(sample, tr808FischerBassRegion(sample.buffer), {
            mode: "mono", retrigger: "always", glideMs: 80, attackMs: 2, releaseMs: 60,
          }, slot.volume, onVoiceEnd);
          slot.status = "ready";
        } catch (error) {
          slot.status = "error";
          slot.error = error instanceof Error ? error.message : String(error);
        }
        return;
      }
      if (slot.sampleAsset && slot.status === "loading") {
        try {
          const sample = await this.sampleCache.load(slot.sampleAsset, this.assetReader!,
            Tone.getContext().rawContext);
          if (this.disposed) return;
          const region = slot.track.instrument?.sampleRegion ?? defaultUserSampleRegion(sample.buffer);
          const voice = slot.track.instrument?.sampleVoice;
          const onVoiceEnd = (): void => {
              this.projectSampleSources = Math.max(0, this.projectSampleSources - 1);
              this.maybeDisposeRetired(slot);
            };
          slot.sampler = voice?.mode === "mono"
            ? new MonoUserSampleEngine(sample, region, { ...voice, mode: "mono" },
              slot.volume, onVoiceEnd)
            : new UserSampleEngine(sample, region, slot.volume, onVoiceEnd, voice);
          slot.status = "ready";
        } catch (error) {
          slot.status = "error";
          slot.error = error instanceof Error ? error.message : String(error);
        }
        return;
      }
      if (slot.rack && slot.status === "loading") {
        await slot.rack.prepare();
        if (!this.disposed) slot.status = "ready";
        return;
      }
      if (slot.audioClips && slot.status === "loading") {
        try {
          await slot.audioClips.prepare();
          if (!this.disposed) slot.status = "ready";
        } catch (error) {
          slot.status = "error";
          slot.error = error instanceof Error ? error.message : String(error);
        }
        return;
      }
      if (!slot.drums || slot.status !== "loading") return;
      try {
        const notes = slot.drums.source === "freepats-clap" ? [FREEPATS_HANDCLAP_NOTE]
          : Object.keys(VIRTUOSITY_CORE_NOTES).map(Number);
        await Promise.all(notes.map((note) => slot.drums!.load(note)));
        if (!this.disposed) slot.status = "ready";
      } catch (error) {
        slot.status = "error";
        slot.error = error instanceof Error ? error.message : String(error);
      }
    }));
    await this.prepareSidechains();
    if (options.metronome !== false) {
      try {
        await this.metronomeDrums.load(56);
        this.metronomeError = null;
      } catch (error) {
        this.metronomeError = error instanceof Error ? error.message : String(error);
      }
    }
    return this.diagnostics();
  }

  private async prepareSidechains(): Promise<void> {
    const targets = [...this.slots.values()].filter((slot) => slot.track.mix.sidechain);
    if (!targets.length || this.disposed) return;
    const raw = Tone.getContext().rawContext as BaseAudioContext;
    try {
      await loadSidechainWorklet(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      for (const slot of targets) {
        slot.sidechainError = reason;
        slot.error = slot.error ?? `Sidechain: ${reason}`;
      }
      return;
    }
    for (const slot of targets) {
      if (this.disposed || slot.sidechainNode) continue;
      const config = slot.track.mix.sidechain!;
      const source = this.slots.get(config.sourceTrackId);
      if (!source || source === slot || source.track.kind === "bus") {
        slot.sidechainError = "Fuente sidechain no disponible";
        slot.error = slot.error ?? `Sidechain: ${slot.sidechainError}`;
        continue;
      }
      if (source.status === "error") {
        slot.sidechainError = `Fuente sidechain con error: ${source.error ?? source.track.name}`;
        slot.error = slot.error ?? `Sidechain: ${slot.sidechainError}`;
        continue;
      }
      try {
        const node = new AudioWorkletNode(raw, SIDECHAIN_PROCESSOR_NAME, {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          channelCount: 2, channelCountMode: "max",
          processorOptions: { thresholdDb: config.thresholdDb, ratio: config.ratio,
            attackMs: config.attackMs, releaseMs: config.releaseMs,
            maxReductionDb: config.maxReductionDb },
        });
        node.port.onmessage = (event: MessageEvent<{ reductionDb?: number; peakReductionDb?: number }>) => {
          const reduction = event.data?.reductionDb;
          const peak = event.data?.peakReductionDb;
          if (typeof reduction === "number" && Number.isFinite(reduction)) {
            slot.sidechainReductionDb = bounded(reduction, 0, config.maxReductionDb);
          }
          if (typeof peak === "number" && Number.isFinite(peak)) {
            slot.sidechainReductionPeakDb = bounded(peak, 0, config.maxReductionDb);
          }
        };
        source.meter.connect(node);
        // AudioNode -> AudioParam is additive in Web Audio. Zero the intrinsic
        // value so the detector's 0..1 signal becomes the complete gain law.
        slot.sidechainGate.gain.value = 0;
        Tone.connect(node, slot.sidechainGate.gain);
        slot.sidechainNode = node;
        slot.sidechainSource = source.meter;
        slot.sidechainError = null;
      } catch (error) {
        slot.sidechainError = error instanceof Error ? error.message : String(error);
        slot.error = slot.error ?? `Sidechain: ${slot.sidechainError}`;
      }
    }
  }

  /** Temporary, non-persistent A/B monitor. Both branches are level-matched by RMS using attenuation only. */
  setTrackEffectComparison(trackId: string, mode: "off" | "original" | "processed"):
    { readonly mode: "off" | "original" | "processed";
      readonly originalCompensationDb: number; readonly processedCompensationDb: number } {
    const slot = this.slots.get(trackId);
    if (!slot || slot.disposed) throw new RangeError(`Pista inexistente: ${trackId}`);
    if (mode !== "off" && !slot.track.mix.effects.some((effect) => effect.enabled)) {
      throw new Error("La pista no tiene efectos activos para comparar");
    }
    const ramp = (gain: Tone.Gain, value: number) => {
      const now = Tone.immediate();
      gain.gain.cancelAndHoldAtTime(now);
      gain.gain.linearRampToValueAtTime(value, now + 0.015);
    };
    if (mode === "off") {
      slot.effectComparisonMode = "off";
      slot.effectComparisonOriginalDb = 0;
      slot.effectComparisonProcessedDb = 0;
      ramp(slot.originalEffectGain, 0);
      ramp(slot.processedEffectGain, 1);
      return { mode, originalCompensationDb: 0, processedCompensationDb: 0 };
    }
    if (slot.effectComparisonMode === "off") {
      const original = readMeter(slot.originalEffectMeter, slot.originalEffectMeterState).rms;
      const processed = readMeter(slot.processedEffectMeter, slot.processedEffectMeterState).rms;
      const floor = 1e-5;
      if (original > floor && processed > floor) {
        const target = Math.min(original, processed);
        slot.effectComparisonOriginalDb = bounded(20 * Math.log10(target / original), -18, 0);
        slot.effectComparisonProcessedDb = bounded(20 * Math.log10(target / processed), -18, 0);
      } else {
        slot.effectComparisonOriginalDb = 0;
        slot.effectComparisonProcessedDb = 0;
      }
    }
    slot.effectComparisonMode = mode;
    const originalGain = 10 ** (slot.effectComparisonOriginalDb / 20);
    const processedGain = 10 ** (slot.effectComparisonProcessedDb / 20);
    ramp(slot.originalEffectGain, mode === "original" ? originalGain : 0);
    ramp(slot.processedEffectGain, mode === "processed" ? processedGain : 0);
    return { mode, originalCompensationDb: slot.effectComparisonOriginalDb,
      processedCompensationDb: slot.effectComparisonProcessedDb };
  }

  hasAudioOwnership(): boolean { return !this.disposed && !this.masterError && this.ownsAudio(); }

  noteOn(event: ScheduledNoteOn): OwnedVoiceHandle | null {
    if (this.disposed || !this.hasAudioOwnership() || !event.ownerId.startsWith(`${this.rootOwnerId}/`)) return null;
    const slot = event.trackId ? this.slots.get(event.trackId) : null;
    if (!slot || slot.status !== "ready" || this.isMuted(slot)) { this.missingAttacks++; return null; }
    let handle: OwnedVoiceHandle | null = null;
    const clipGain = 10 ** (bounded(event.gainDb ?? 0, -96, 24) / 20);
    if (slot.piano) {
      const inputId = originInputId(event.ownerId);
      this.rememberOrigin(slot, event.epoch, inputId);
      handle = slot.piano.noteOnOwned({ inputId, channel: event.channel,
        originalNote: event.sourcePitch ?? event.pitch, mappedMidi: event.pitch,
        rawVelocity: event.velocity, amplitude: bounded(event.velocity / 127 * clipGain, 0, 16),
        audioTime: event.audioTime }, event.ownerId, event.epoch);
    } else if (slot.rack) {
      if (this.projectDrumSources >= MAX_PROJECT_DRUM_SOURCES) {
        this.missingAttacks++;
        return null;
      }
      const control = slot.drumControls.get(`${originInputId(event.ownerId)}:${event.channel}`);
      const gain = (control ? control.volume * control.expression / (127 * 127) : 1) * clipGain;
      handle = slot.rack.trigger(event.pitch, event.channel, event.velocity,
        event.ownerId, event.epoch, event.audioTime, gain);
      if (handle) this.projectDrumSources++;
    } else if (slot.drums) {
      if (this.projectDrumSources >= MAX_PROJECT_DRUM_SOURCES) {
        this.missingAttacks++;
        return null;
      }
      const control = slot.drumControls.get(`${originInputId(event.ownerId)}:${event.channel}`);
      const gain = (control ? control.volume * control.expression / (127 * 127) : 1) * clipGain;
      handle = slot.drums.triggerOwned(event.pitch, event.velocity / 127,
        event.ownerId, event.epoch, event.audioTime, gain);
      if (handle) this.projectDrumSources++;
    } else if (slot.sampler) {
      if (this.projectSampleSources >= MAX_PROJECT_SAMPLE_SOURCES) {
        this.missingAttacks++;
        return null;
      }
      const control = slot.sampleControls.get(`${originInputId(event.ownerId)}:${event.channel}`);
      const gain = (control ? control.volume * control.expression / (127 * 127) : 1) * clipGain;
      handle = slot.sampler.trigger({ note: event.pitch, velocity: event.velocity,
        ownerId: event.ownerId, epoch: event.epoch, audioTime: event.audioTime, gain });
      if (handle) this.projectSampleSources++;
    }
    if (handle) this.handles.set(handle, slot);
    else this.missingAttacks++;
    return handle;
  }

  noteOff(handle: OwnedVoiceHandle, event: ScheduledNoteOff): void {
    const slot = this.handles.get(handle);
    if (!slot) return;
    this.handles.delete(handle);
    if (slot.piano) slot.piano.noteOffHandle(handle, event.audioTime);
    else if (slot.rack) slot.rack.noteOffHandle(handle, event.audioTime);
    else if (slot.drums) slot.drums.releaseHandle(handle, event.audioTime);
    else slot.sampler?.noteOffHandle(handle, event.audioTime);
  }

  control(event: ScheduledControl): void {
    if (this.disposed || !event.ownerId.startsWith(`${this.rootOwnerId}/`)) return;
    const slot = event.trackId ? this.slots.get(event.trackId) : null;
    if (!slot || slot.status !== "ready" || this.isMuted(slot)) return;
    const inputId = originInputId(event.ownerId);
    const origin = { inputId, channel: event.channel };
    const at = event.audioTime;
    if (slot.piano) {
      this.rememberOrigin(slot, event.epoch, inputId);
      switch (event.kind) {
        case "cc":
          switch (event.controller) {
            case 1: slot.piano.setModulation(origin, event.value, at); break;
            case 7: slot.piano.setVolume(origin, event.value, at); break;
            case 11: slot.piano.setExpression(origin, event.value, at); break;
            case 64: slot.piano.setSustain(origin, event.value, at); break;
            case 66: slot.piano.setSostenuto(origin, event.value >= 64, at); break;
            case 67: slot.piano.setUnaCorda(origin, event.value >= 64, at); break;
            case 120: slot.piano.allSoundOff(origin, at); break;
            case 123: slot.piano.allNotesOff(origin, at); break;
            default: this.unsupportedControls++;
          }
          break;
        case "pitchBend": slot.piano.setPitchBend(origin, (event.value14 - 8192) / 8192, 2, at); break;
        case "polyPressure": slot.piano.setPolyPressure(origin, event.pitch, event.pressure, at); break;
        case "channelPressure": slot.piano.setChannelPressure(origin, event.pressure, at); break;
        case "programChange": this.unsupportedControls++; break;
      }
    } else if (slot.drums || slot.rack || slot.sampler) {
      if (event.kind !== "cc" || (event.controller !== 7 && event.controller !== 11)) {
        this.unsupportedControls++;
        return;
      }
      const key = `${inputId}:${event.channel}`;
      const controls = slot.drums || slot.rack ? slot.drumControls : slot.sampleControls;
      const control = controls.get(key) ?? { volume: 127, expression: 127 };
      if (event.controller === 7) control.volume = event.value;
      else control.expression = event.value;
      controls.set(key, control);
    }
  }

  audioClip(event: ScheduledAudioClip): OwnedVoiceHandle | null {
    if (this.disposed || !this.hasAudioOwnership() ||
        !event.ownerId.startsWith(`${this.rootOwnerId}/`)) return null;
    const slot = event.trackId ? this.slots.get(event.trackId) : null;
    if (!slot?.audioClips || slot.status !== "ready" || this.isMuted(slot) ||
        this.projectAudioClipSources >= MAX_PROJECT_AUDIO_CLIP_SOURCES) return null;
    const handle = slot.audioClips.play(event);
    if (handle) this.projectAudioClipSources++;
    else if (slot.audioClips.error) {
      slot.status = "error";
      slot.error = slot.audioClips.error;
    }
    return handle;
  }

  authorityChange(event: ScheduledAuthority): void {
    if (this.disposed || !event.ownerId.startsWith(`${this.rootOwnerId}/`)) return;
    for (const trackId of event.trackIds) {
      const slot = this.slots.get(trackId);
      if (!slot) continue;
      slot.piano?.releaseEpoch(this.rootOwnerId, event.epoch, event.audioTime, true);
      slot.drums?.releaseEpoch(this.rootOwnerId, event.epoch, event.audioTime, true);
      slot.rack?.releaseEpoch(this.rootOwnerId, event.epoch, event.audioTime, true);
      slot.sampler?.releaseEpoch(this.rootOwnerId, event.epoch, event.audioTime, true);
      slot.audioClips?.releaseEpoch(this.rootOwnerId, event.epoch, event.audioTime, true);
      for (const inputId of slot.originsByEpoch.get(event.epoch) ?? []) {
        slot.piano?.releaseOrigin(inputId, event.audioTime);
      }
      slot.originsByEpoch.delete(event.epoch);
      slot.drumControls.clear();
      slot.sampleControls.clear();
      for (const [handle, handleSlot] of this.handles) {
        if (handleSlot === slot) this.handles.delete(handle);
      }
    }
  }

  cancelEpoch(rootOwnerId: string, epoch: number, audioTime: number): void {
    if (rootOwnerId !== this.rootOwnerId) return;
    this.cancelAutomationEpoch(rootOwnerId, epoch, audioTime);
    this.cancelMetronome();
    for (const slot of this.slots.values()) {
      slot.piano?.releaseEpoch(rootOwnerId, epoch, audioTime, true);
      slot.drums?.releaseEpoch(rootOwnerId, epoch, audioTime, true);
      slot.rack?.releaseEpoch(rootOwnerId, epoch, audioTime, true);
      slot.sampler?.releaseEpoch(rootOwnerId, epoch, audioTime, true);
      slot.audioClips?.releaseEpoch(rootOwnerId, epoch, audioTime, true);
      for (const inputId of slot.originsByEpoch.get(epoch) ?? []) {
        slot.piano?.releaseOrigin(inputId, audioTime);
        for (const key of slot.drumControls.keys()) {
          if (key.startsWith(`${inputId}:`)) slot.drumControls.delete(key);
        }
        for (const key of slot.sampleControls.keys()) {
          if (key.startsWith(`${inputId}:`)) slot.sampleControls.delete(key);
        }
      }
      slot.originsByEpoch.delete(epoch);
    }
    for (const [handle] of this.handles) {
      // The voice registry retains its own handles until the real source ends.
      // This lookup map is only for future Note Off, now invalidated.
      this.handles.delete(handle);
    }
  }

  private automationTargetParameter(target: ProjectAutomationLane["target"]):
    Tone.Param<"decibels"> | Tone.Param<"audioRange"> {
    if (target.scope === "master") {
      if (target.parameterId !== "masterGainDb" || target.effectId !== undefined) {
        throw new RangeError("Parámetro master no automatizable");
      }
      return this.master.volume;
    }
    if (target.scope !== "track" || !target.ownerId || target.effectId !== undefined) {
      throw new RangeError("Parámetro no automatizable en vivo");
    }
    const slot = this.slots.get(target.ownerId);
    if (!slot) throw new RangeError(`Pista ${target.ownerId} inexistente`);
    if (target.parameterId === "gainDb") return slot.volume.volume;
    if (target.parameterId === "pan") return slot.panner.pan;
    throw new RangeError("Parámetro de pista no automatizable");
  }

  private automationTargetKey(target: ProjectAutomationLane["target"]): string {
    if (target.scope === "master" && target.parameterId === "masterGainDb" &&
        target.effectId === undefined) return "master:masterGainDb";
    if (target.scope === "track" && target.ownerId && target.effectId === undefined &&
        (target.parameterId === "gainDb" || target.parameterId === "pan")) {
      return `${target.ownerId}:${target.parameterId}`;
    }
    throw new RangeError("Parámetro no automatizable en vivo");
  }

  private automationParameter(event: ScheduledAutomation):
    Tone.Param<"decibels"> | Tone.Param<"audioRange"> {
    return this.automationTargetParameter(event.target);
  }

  private automationKey(event: ScheduledAutomation): string {
    return this.automationTargetKey(event.target);
  }

  /** Physical/Touch ownership cancels future timeline writes until explicitly released. */
  setAutomationLiveOverride(target: ProjectAutomationLane["target"], value: number,
    audioTime = Tone.immediate()): void {
    const key = this.automationTargetKey(target);
    this.physicalAutomationReturns.delete(key);
    const isPan = target.parameterId === "pan";
    validMixNumber(value, isPan ? -1 : -120, isPan ? 1 : 24, "Control físico");
    const param = this.automationTargetParameter(target);
    if (!this.liveAutomationOverrides.has(key)) {
      param.cancelAndHoldAtTime(audioTime);
      this.automatedParameters.delete(key);
      this.pendingAutomationReturn.delete(key);
      this.replannedAutomation.delete(key);
    }
    this.liveAutomationOverrides.set(key, value);
    if (isPan) {
      (param as Tone.Param<"audioRange">).linearRampToValueAtTime(value, audioTime + 0.015);
    } else {
      (param as Tone.Param<"decibels">).exponentialRampToValueAtTime(value, audioTime + 0.015);
    }
  }

  /** Release physical ownership and return smoothly to the resolved read/base value. */
  releaseAutomationLiveOverride(target: ProjectAutomationLane["target"], returnValue: number,
    audioTime = Tone.immediate()): void {
    const key = this.automationTargetKey(target);
    if (!this.liveAutomationOverrides.delete(key)) return;
    const isPan = target.parameterId === "pan";
    validMixNumber(returnValue, isPan ? -1 : -120, isPan ? 1 : 24, "Retorno de automatización");
    this.automationTargetParameter(target).cancelAndHoldAtTime(audioTime);
    this.physicalAutomationReturns.add(key);
  }

  isAutomationLiveOverride(target: ProjectAutomationLane["target"]): boolean {
    return this.liveAutomationOverrides.has(this.automationTargetKey(target));
  }

  automationLiveOverrideValue(target: ProjectAutomationLane["target"]): number | null {
    return this.liveAutomationOverrides.get(this.automationTargetKey(target)) ?? null;
  }

  automation(event: ScheduledAutomation): void {
    if (this.disposed || !this.hasAudioOwnership()) return;
    const isDb = event.target.parameterId !== "pan";
    validMixNumber(event.startValue, isDb ? -120 : -1, isDb ? 24 : 1, "Automatización");
    validMixNumber(event.endValue, isDb ? -120 : -1, isDb ? 24 : 1, "Automatización");
    const param = this.automationParameter(event);
    const key = this.automationKey(event);
    if (this.liveAutomationOverrides.has(key)) return;
    const now = Math.max(Tone.immediate(), this.automationReplanAt ?? 0);
    const start = Math.max(now, event.audioTime);
    const duration = event.endAudioTime - event.audioTime;
    const fraction = duration > 0 ? bounded((start - event.audioTime) / duration, 0, 1) : 1;
    const startValue = event.shape === "linear"
      ? event.startValue + (event.endValue - event.startValue) * fraction : event.startValue;
    const firstAfterReplan = this.automationReplanAt !== null &&
      !this.replannedAutomation.has(key);
    const physicalReturn = firstAfterReplan && this.physicalAutomationReturns.has(key);
    if (firstAfterReplan) {
      if (!this.pendingAutomationReturn.has(key)) param.cancelAndHoldAtTime(now);
      this.pendingAutomationReturn.delete(key);
      this.replannedAutomation.add(key);
    }
    const reentryAt = physicalReturn ? Math.max(start, now + 0.015) : start;
    if (event.target.parameterId === "pan") {
      const pan = param as Tone.Param<"audioRange">;
      if (physicalReturn || (firstAfterReplan && start > now)) {
        pan.linearRampToValueAtTime(startValue, reentryAt);
      } else pan.setValueAtTime(startValue, start);
      if (event.shape === "linear" && event.endAudioTime > reentryAt) {
        pan.linearRampToValueAtTime(event.endValue, event.endAudioTime);
      }
    } else {
      const gain = param as Tone.Param<"decibels">;
      if (physicalReturn || (firstAfterReplan && start > now)) {
        gain.exponentialRampToValueAtTime(startValue, reentryAt);
      } else gain.setValueAtTime(startValue, start);
      if (event.shape === "linear" && event.endAudioTime > reentryAt) {
        // Exponential linear-gain ramp is linear in dB, the persisted parameter unit.
        gain.exponentialRampToValueAtTime(event.endValue, event.endAudioTime);
      }
    }
    if (physicalReturn) this.physicalAutomationReturns.delete(key);
    this.automatedParameters.add(key);
  }

  private restoreAutomationParameter(key: string, audioTime: number,
    smooth: boolean): void {
    if (key === "master:masterGainDb") {
      const base = this.masterGainOverride ?? this.document.mix.masterGainDb;
      if (smooth) this.master.volume.exponentialRampToValueAtTime(base, audioTime + 0.015);
      else this.master.volume.setValueAtTime(base, audioTime);
      return;
    }
    const separator = key.lastIndexOf(":");
    const slot = this.slots.get(key.slice(0, separator));
    if (!slot) return;
    if (key.slice(separator + 1) === "gainDb") {
      const base = slot.gainOverride ?? slot.track.mix.gainDb;
      if (smooth) slot.volume.volume.exponentialRampToValueAtTime(base, audioTime + 0.015);
      else slot.volume.volume.setValueAtTime(base, audioTime);
    } else {
      const base = slot.panOverride ?? slot.track.mix.pan;
      if (smooth) slot.panner.pan.linearRampToValueAtTime(base, audioTime + 0.015);
      else slot.panner.pan.setValueAtTime(base, audioTime);
    }
  }

  cancelAutomationEpoch(rootOwnerId: string, _epoch: number, audioTime: number,
    restoreBase = true): void {
    if (rootOwnerId !== this.rootOwnerId || this.disposed) return;
    this.pendingAutomationReturn.clear();
    this.replannedAutomation.clear();
    for (const key of this.automatedParameters) {
      if (key === "master:masterGainDb") {
        this.master.volume.cancelAndHoldAtTime(audioTime);
      } else {
        const separator = key.lastIndexOf(":");
        const slot = this.slots.get(key.slice(0, separator));
        if (!slot) continue;
        if (key.slice(separator + 1) === "gainDb") slot.volume.volume.cancelAndHoldAtTime(audioTime);
        else slot.panner.pan.cancelAndHoldAtTime(audioTime);
      }
      if (restoreBase) this.restoreAutomationParameter(key, audioTime, false);
      else this.pendingAutomationReturn.add(key);
    }
    this.automatedParameters.clear();
    this.automationReplanAt = restoreBase ? null : audioTime;
  }

  finishAutomationReplan(rootOwnerId: string, _epoch: number, audioTime: number): void {
    if (rootOwnerId !== this.rootOwnerId || this.automationReplanAt === null) return;
    for (const key of this.pendingAutomationReturn) {
      this.restoreAutomationParameter(key, audioTime, true);
    }
    this.pendingAutomationReturn.clear();
    this.replannedAutomation.clear();
    this.automationReplanAt = null;
  }

  metronome(event: ScheduledMetronomeTick): void {
    if (this.disposed || !this.hasAudioOwnership()) return;
    // A real Austin McMahon cowbell recording, not a generated synth click.
    this.metronomeDrums.triggerOwned(56, event.accent ? 0.85 : 0.5,
      `metronome/${this.projectId}/epoch-${event.epoch}`, event.epoch, event.audioTime, 0.25);
  }

  /** Recorded count-in click with a separate owner from transport and live voices. */
  countInClick(audioTime: number, accent: boolean, ownerId: string): boolean {
    if (!ownerId.startsWith(`count-in/${this.projectId}/`) || this.disposed ||
        !this.hasAudioOwnership() || !this.metronomeDrums.has(56)) return false;
    return this.metronomeDrums.triggerOwned(56, accent ? 0.85 : 0.5,
      ownerId, 0, audioTime, 0.25) !== null;
  }

  cancelCountIn(ownerId: string): void {
    if (!ownerId.startsWith(`count-in/${this.projectId}/`)) return;
    this.metronomeDrums.releaseOwner(ownerId, Tone.immediate(), true);
  }

  cancelMetronome(): void {
    this.metronomeDrums.releaseOwner(`metronome/${this.projectId}`, Tone.immediate(), true);
  }

  private rememberOrigin(slot: TrackSlot, epoch: number, inputId: string): void {
    const origins = slot.originsByEpoch.get(epoch) ?? new Set<string>();
    origins.add(inputId);
    slot.originsByEpoch.set(epoch, origins);
  }

  private isMuted(slot: TrackSlot): boolean {
    return this.effectiveMute.get(slot.track.id) ?? this.computeMuted(slot);
  }

  /** A muted primary bus does not silence an independent auxiliary send. */
  private hasUnmutedPath(slot: TrackSlot): boolean {
    const active = new Set<string>();
    const reachable = (id: string): boolean => {
      if (active.has(id)) return false;
      const candidate = this.slots.get(id);
      if (!candidate || (candidate.muteOverride ?? candidate.track.mix.mute)) {
        return false;
      }
      active.add(id);
      const main = candidate.track.mix.outputBusTrackId;
      // No destination means the main output connects to master.
      const heard = (!main || reachable(main)) ||
        candidate.track.mix.sends.some((send) => reachable(send.busTrackId));
      active.delete(id);
      return heard;
    };
    return reachable(slot.track.id);
  }

  private computeMuted(slot: TrackSlot): boolean {
    if (!this.hasUnmutedPath(slot)) return true;
    const soloed = [...this.slots.values()].some((candidate) =>
      candidate.soloOverride ?? candidate.track.mix.solo);
    const solo = slot.soloOverride ?? slot.track.mix.solo;
    if (!soloed || solo) return false;
    if ([...this.slots.values()].some((candidate) => candidate.track.kind === "bus" &&
        (candidate.soloOverride ?? candidate.track.mix.solo) &&
        this.routesThrough(slot, candidate.track.id))) return false;
    return slot.track.kind !== "bus" || ![...this.slots.values()].some((candidate) =>
      (candidate.soloOverride ?? candidate.track.mix.solo) &&
      this.routesThrough(candidate, slot.track.id));
  }

  /** Follow output and parallel send edges for solo/route diagnostics. */
  private routesThrough(slot: TrackSlot, busTrackId: string): boolean {
    const pending = [slot.track.id];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const track = this.slots.get(id)?.track;
      if (!track) continue;
      const destinations = [track.mix.outputBusTrackId,
        ...track.mix.sends.map((send) => send.busTrackId)];
      for (const next of destinations) {
        if (next === busTrackId) return true;
        if (next && !visited.has(next)) pending.push(next);
      }
    }
    return false;
  }

  /** Route-aware solo gating: source mute is not enough when the same signal
   * reaches master directly AND a soloed auxiliary bus in parallel. */
  private soloAllowsOutlet(slot: TrackSlot, destinationBusId: string | null,
    soloBusIds: readonly string[], soloSourceIds: readonly string[]): boolean {
    if (!soloBusIds.length && !soloSourceIds.length) return true;
    if (slot.soloOverride ?? slot.track.mix.solo) return true;
    // A bus carrying a soloed instrument must pass its mixed input downstream.
    if (soloSourceIds.some((id)=>{
      const source = this.slots.get(id);
      return !!source && this.routesThrough(source,slot.track.id);
    })) return true;
    if (!destinationBusId) return false;
    const target = this.slots.get(destinationBusId);
    return soloBusIds.some((id)=>destinationBusId === id ||
      (!!target && this.routesThrough(target,id)));
  }

  private refreshMute(audioTime = Tone.immediate()): void {
    this.effectiveMute.clear();
    const soloSlots = [...this.slots.values()].filter((slot)=>
      slot.soloOverride ?? slot.track.mix.solo);
    const soloBusIds = soloSlots.filter((slot)=>slot.track.kind==="bus").map((slot)=>slot.track.id);
    const soloSourceIds = soloSlots.filter((slot)=>slot.track.kind!=="bus").map((slot)=>slot.track.id);
    for (const slot of this.slots.values()) {
      const muted = this.computeMuted(slot);
      this.effectiveMute.set(slot.track.id, muted);
      slot.muteGate.gain.rampTo(muted ? 0 : 1, 0.008, audioTime);
      slot.mainGate.gain.rampTo(!muted && this.soloAllowsOutlet(slot,
        slot.track.mix.outputBusTrackId ?? null,soloBusIds,soloSourceIds) ? 1 : 0,
      0.008,audioTime);
      for (let index=0;index<slot.track.mix.sends.length;index++){
        const send = slot.track.mix.sends[index]!;
        const sendGain=slot.sends[index];
        if (!sendGain) continue;
        const active = !muted && this.soloAllowsOutlet(slot,send.busTrackId,
          soloBusIds,soloSourceIds);
        sendGain.gain.rampTo(active ? 10 ** (send.gainDb / 20) : 0,0.008,audioTime);
      }
    }
  }

  setTrackMute(trackId: string, muted: boolean, audioTime = Tone.immediate()): void {
    const slot = this.slots.get(trackId);
    if (!slot) throw new RangeError(`unknown track ${trackId}`);
    slot.muteOverride = muted;
    this.refreshMute(audioTime);
    if (muted) {
      for (const candidate of this.slots.values()) {
        if (candidate === slot ||
            (this.routesThrough(candidate, trackId) && this.isMuted(candidate))) {
          // Do not kill the source when its independent send still reaches an
          // audible bus. Only voices actually losing every route are retired.
          candidate.piano?.releaseOwner(this.rootOwnerId, audioTime, true);
          candidate.drums?.releaseOwner(this.rootOwnerId, audioTime, true);
          candidate.rack?.releaseOwner(this.rootOwnerId, audioTime, true);
          candidate.sampler?.releaseOwner(this.rootOwnerId, audioTime, true);
          candidate.audioClips?.releaseOwner(this.rootOwnerId, audioTime, true);
        }
      }
    }
  }

  setTrackSolo(trackId: string, solo: boolean, audioTime = Tone.immediate()): void {
    const slot = this.slots.get(trackId);
    if (!slot) throw new RangeError(`unknown track ${trackId}`);
    slot.soloOverride = solo;
    this.refreshMute(audioTime);
    for (const candidate of this.slots.values()) {
      if (this.isMuted(candidate)) {
        candidate.piano?.releaseOwner(this.rootOwnerId, audioTime, true);
        candidate.drums?.releaseOwner(this.rootOwnerId, audioTime, true);
        candidate.rack?.releaseOwner(this.rootOwnerId, audioTime, true);
        candidate.sampler?.releaseOwner(this.rootOwnerId, audioTime, true);
        candidate.audioClips?.releaseOwner(this.rootOwnerId, audioTime, true);
      }
    }
  }

  setTrackMix(trackId: string,
    patch: Partial<Pick<ProjectMixChannel, "gainDb" | "pan" | "mute" | "solo">>,
    audioTime = Tone.immediate()): void {
    const slot = this.slots.get(trackId);
    if (!slot) throw new RangeError(`unknown track ${trackId}`);
    if (patch.gainDb !== undefined) validMixNumber(patch.gainDb, -120, 24, "Ganancia de pista");
    if (patch.pan !== undefined) validMixNumber(patch.pan, -1, 1, "Pan de pista");
    if (patch.mute !== undefined && typeof patch.mute !== "boolean") throw new TypeError("Mute inválido");
    if (patch.solo !== undefined && typeof patch.solo !== "boolean") throw new TypeError("Solo inválido");
    if (patch.gainDb !== undefined) {
      slot.gainOverride = patch.gainDb;
      slot.volume.volume.rampTo(patch.gainDb, 0.015, audioTime);
    }
    if (patch.pan !== undefined) {
      slot.panOverride = patch.pan;
      slot.panner.pan.rampTo(patch.pan, 0.015, audioTime);
    }
    if (patch.mute !== undefined) this.setTrackMute(trackId, patch.mute, audioTime);
    if (patch.solo !== undefined) this.setTrackSolo(trackId, patch.solo, audioTime);
  }

  setMasterGainDb(gainDb: number, audioTime = Tone.immediate()): void {
    validMixNumber(gainDb, -120, 24, "Ganancia master");
    this.masterGainOverride = gainDb;
    this.master.volume.rampTo(gainDb, 0.015, audioTime);
  }

  previewPad(trackId: string, note: number, velocity: number, ownerId: string,
    audioTime = Tone.immediate()): OwnedVoiceHandle | null {
    if (!ownerId.startsWith("preview/") || this.disposed || !this.hasAudioOwnership()) return null;
    const slot = this.slots.get(trackId);
    if (!slot?.drums || slot.status !== "ready") return null;
    if (this.projectDrumSources >= MAX_PROJECT_DRUM_SOURCES) return null;
    const handle = slot.drums.triggerOwned(note, bounded(velocity, 0, 1), ownerId, 0, audioTime);
    if (handle) this.projectDrumSources++;
    return handle;
  }

  previewNote(trackId: string, pitch: number, velocity: number, ownerId: string,
    audioTime = Tone.immediate()): OwnedVoiceHandle | null {
    if (!ownerId.startsWith("preview/") || this.disposed || !this.hasAudioOwnership()) return null;
    const slot = this.slots.get(trackId);
    if (!slot?.piano || slot.status !== "ready" ||
        !Number.isInteger(pitch) || pitch < 0 || pitch > 127) return null;
    return slot.piano.noteOnOwned({ inputId: ownerId, channel: 0,
      originalNote: pitch, mappedMidi: pitch,
      rawVelocity: Math.max(1, Math.round(bounded(velocity, 0, 1) * 127)),
      amplitude: bounded(velocity, 0, 1), audioTime }, ownerId, 0);
  }

  previewRackPad(trackId: string, padId: string, velocity: number, ownerId: string,
    audioTime = Tone.immediate()): OwnedVoiceHandle | null {
    if (!ownerId.startsWith("preview/") || this.disposed || !this.hasAudioOwnership()) return null;
    const slot = this.slots.get(trackId);
    const pad = slot?.track.drumRack?.pads.find((candidate) => candidate.id === padId);
    if (!slot?.rack || !pad || slot.status !== "ready" ||
        this.projectDrumSources >= MAX_PROJECT_DRUM_SOURCES) return null;
    const handle = slot.rack.trigger(pad.midiNote, pad.channel,
      Math.max(1, Math.round(bounded(velocity, 0, 1) * 127)), ownerId, 0, audioTime);
    if (handle) this.projectDrumSources++;
    return handle;
  }

  setRackPadMute(trackId: string, padId: string, muted: boolean): void {
    const rack = this.slots.get(trackId)?.rack;
    if (!rack) throw new RangeError(`Pista ${trackId} sin rack`);
    rack.setPadMute(padId, muted);
  }

  setRackPadSolo(trackId: string, padId: string, solo: boolean): void {
    const rack = this.slots.get(trackId)?.rack;
    if (!rack) throw new RangeError(`Pista ${trackId} sin rack`);
    rack.setPadSolo(padId, solo);
  }

  previewSample(trackId: string, note: number, velocity: number, ownerId: string,
    audioTime = Tone.immediate()): OwnedVoiceHandle | null {
    if (!ownerId.startsWith("preview/") || this.disposed || !this.hasAudioOwnership()) return null;
    const slot = this.slots.get(trackId);
    if (!slot?.sampler || slot.status !== "ready") return null;
    if (this.projectSampleSources >= MAX_PROJECT_SAMPLE_SOURCES) return null;
    const handle = slot.sampler.trigger({ note, velocity, ownerId, epoch: 0, audioTime });
    if (handle) this.projectSampleSources++;
    return handle;
  }

  releasePreview(ownerId: string, audioTime = Tone.immediate()): number {
    if (!ownerId.startsWith("preview/")) return 0;
    let released = 0;
    for (const slot of this.slots.values()) released += slot.piano?.releaseOwner(ownerId, audioTime, true) ?? 0;
    for (const slot of this.slots.values()) released += slot.drums?.releaseOwner(ownerId, audioTime, true) ?? 0;
    for (const slot of this.slots.values()) released += slot.rack?.releaseOwner(ownerId, audioTime, true) ?? 0;
    for (const slot of this.slots.values()) released += slot.sampler?.releaseOwner(ownerId, audioTime, true) ?? 0;
    return released;
  }

  padStatus(trackId: string): DrumRackPadStatus[] {
    const slot = this.slots.get(trackId);
    if (slot?.rack) return [...slot.rack.padStatus()];
    if (!slot?.drums) return [];
    if (slot.drums.source === "freepats-clap") {
      const error = slot.drums.loadError(FREEPATS_HANDCLAP_NOTE) ?? slot.error;
      return [{ padId: "legacy-clap", note: FREEPATS_HANDCLAP_NOTE, channel: 9, muted: false, label: "Clap",
        assetStatus: error ? "error" : slot.drums.has(FREEPATS_HANDCLAP_NOTE) ? "ready" : "loading",
        sourceLabel: "FreePats World Percussion · Roberto · CC0", error }];
    }
    const labels: Record<number, string> = { 36: "Kick", 38: "Snare", 42: "Hi-hat cerrado",
      46: "Hi-hat abierto", 56: "Cowbell" };
    return Object.keys(VIRTUOSITY_CORE_NOTES).map((value) => {
      const note = Number(value);
      const error = slot.drums!.loadError(note) ?? slot.error;
      return { padId: `legacy-${note}`, note, channel: 9, muted: false,
        label: labels[note]!, assetStatus: error ? "error" : slot.drums!.has(note) ? "ready" : "loading",
        sourceLabel: "Virtuosity Drums · Austin McMahon · CC0", error };
    });
  }

  diagnostics(): ProjectAudioDiagnostics {
    return { projectId: this.projectId, unsupportedControls: this.unsupportedControls,
      missingAttacks: this.missingAttacks,
      projectPianoSources: this.projectPianoSources,
      projectPianoSourceLimit: MAX_PROJECT_PIANO_SOURCES,
      projectDrumSources: this.projectDrumSources,
      projectDrumSourceLimit: MAX_PROJECT_DRUM_SOURCES,
      projectSampleSources: this.projectSampleSources,
      projectSampleSourceLimit: MAX_PROJECT_SAMPLE_SOURCES,
      projectAudioClipSources: this.projectAudioClipSources,
      projectAudioClipSourceLimit: MAX_PROJECT_AUDIO_CLIP_SOURCES,
      masterGainDb: this.masterGainOverride ?? this.document.mix.masterGainDb,
      masterMeter: this.masterDisposed ? this.masterMeterState.snapshot
        : readMeter(this.masterMeter, this.masterMeterState),
      masterError: this.masterError,
      samplePcmBytes: this.sampleCache.pcmBytes,
      metronome: { ready: this.metronomeDrums.has(56), error: this.metronomeError },
      tracks: [...this.slots.values()].map((slot) => {
        const piano = slot.piano?.ownedVoiceSnapshot();
        const drums = slot.drums?.voiceSnapshot();
        const sample = slot.sampler?.snapshot();
        const rack = slot.rack?.voiceSnapshot();
        const audio = slot.audioClips?.snapshot();
        return { trackId: slot.track.id, kind: slot.track.kind, status: slot.status,
          error: slot.error, instrumentId: slot.track.instrument?.instrumentId ?? null,
          packageVersion: slot.track.instrument?.packageVersion ?? null,
          presetId: slot.track.instrument?.presetId ?? null, muted: this.isMuted(slot),
          solo: slot.soloOverride ?? slot.track.mix.solo,
          gainDb: slot.gainOverride ?? slot.track.mix.gainDb,
          pan: slot.panOverride ?? slot.track.mix.pan,
          sidechainSourceTrackId: slot.track.mix.sidechain?.sourceTrackId ?? null,
          sidechainReductionDb: slot.sidechainReductionDb,
          sidechainReductionPeakDb: slot.sidechainReductionPeakDb,
          sidechainError: slot.sidechainError,
          effectComparisonMode: slot.effectComparisonMode,
          effectComparisonOriginalDb: slot.effectComparisonOriginalDb,
          effectComparisonProcessedDb: slot.effectComparisonProcessedDb,
          meter: slot.disposed ? slot.meterState.snapshot : readMeter(slot.meter, slot.meterState),
          activeVoices: (piano?.active ?? 0) + (drums?.active ?? 0) + (sample?.active ?? 0) +
            (rack?.active ?? 0) + (audio?.active ?? 0),
          allocatedVoices: (piano?.allocated ?? 0) + (drums?.allocated ?? 0) + (sample?.allocated ?? 0) +
            (rack?.allocated ?? 0) + (audio?.allocated ?? 0) };
      }) };
  }

  /** Keep old nodes alive until their owned sources have ended. */
  retire(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelMetronome();
    for (const slot of this.slots.values()) {
      slot.retired = true;
      this.retired.add(slot);
      slot.piano?.releaseAll(Tone.immediate());
      slot.drums?.releaseAll();
      slot.rack?.releaseOwner(this.rootOwnerId, Tone.immediate(), true);
      slot.sampler?.releaseOwner(this.rootOwnerId, Tone.immediate(), true);
      slot.audioClips?.releaseOwner(this.rootOwnerId, Tone.immediate(), true);
      this.maybeDisposeRetired(slot);
    }
    setTimeout(() => {
      for (const slot of [...this.retired]) this.disposeSlot(slot);
      this.metronomeDrums.dispose();
      this.sampleCache.clear();
      this.disposeMaster();
    }, 50);
  }

  dispose(): void { this.retire(); }

  private maybeDisposeRetired(slot: TrackSlot): void {
    if (!slot.retired || slot.disposed) return;
    if (slot.activePianoSources > 0 || (slot.drums?.voiceSnapshot().allocated ?? 0) > 0 ||
        (slot.sampler?.snapshot().allocated ?? 0) > 0 ||
        (slot.rack?.voiceSnapshot().allocated ?? 0) > 0 ||
        (slot.audioClips?.snapshot().allocated ?? 0) > 0) return;
    this.disposeSlot(slot);
    this.maybeDisposeMaster();
  }

  private maybeDisposeMaster(): void {
    if (this.disposed && this.retired.size === 0 && this.metronomeDrums.voiceSnapshot().allocated === 0) {
      this.metronomeDrums.dispose();
      this.sampleCache.clear();
      this.disposeMaster();
    }
  }

  private disposeMaster(): void {
    if (this.masterDisposed) return;
    this.masterDisposed = true;
    this.masterMeter.dispose();
    for (const effect of this.masterEffects) effect.dispose();
    this.master.dispose();
  }

  private disposeSlot(slot: TrackSlot): void {
    if (slot.disposed) return;
    slot.disposed = true;
    slot.piano?.dispose(Tone.immediate());
    slot.drums?.dispose();
    slot.rack?.dispose();
    slot.sampler?.dispose();
    slot.audioClips?.dispose();
    for (const effect of slot.effects) effect.dispose();
    for (const send of slot.sends) send.dispose();
    if (slot.sidechainNode) {
      try { slot.sidechainSource?.disconnect(slot.sidechainNode); } catch { /* already disconnected */ }
      try { Tone.disconnect(slot.sidechainNode, slot.sidechainGate.gain); } catch { /* already disconnected */ }
      slot.sidechainNode.port.onmessage = null;
      slot.sidechainNode.port.close();
      slot.sidechainNode.disconnect();
      slot.sidechainNode = null;
      slot.sidechainSource = null;
    }
    slot.volume.dispose();
    slot.originalEffectMeter.dispose();
    slot.processedEffectMeter.dispose();
    slot.originalEffectGain.dispose();
    slot.processedEffectGain.dispose();
    slot.muteGate.dispose();
    slot.mainGate.dispose();
    slot.sidechainGate.dispose();
    slot.panner.dispose();
    slot.meter.dispose();
    this.retired.delete(slot);
  }
}
