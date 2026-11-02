/** The live instrument and its audio graph. */
import * as Tone from "tone";
import type { MidiEvent } from "../midi/message";
import type { ProjectAudioRecordingPlan, ProjectDocumentV1 } from "../project/model";
import type { TimelineResolver } from "../sequencer/timelineEvents";
import type { LoopRange } from "../sequencer/musicalClock";
import type { AudioClockSource } from "../sequencer/transportScheduler";
import { salamanderSamples } from "../services/audioService";
import { DrumKitEngine } from "../engine/DrumKitEngine";
import { createInstrumentChain, type InstrumentChain } from "../engine/instrumentChain";
import { loadWafDecodedBank } from "../engine/WebAudioFont";
import { DEFAULT_INSTRUMENT_ID, getInstrument } from "../instruments/catalog";
import { configureAudioTiming, liveNoteTime, type AudioLatencyMode } from "./liveAudioTiming";
import { CORE_PIANO_NOTES, getCorePianoBuffer, startCorePianoPreload } from "./corePianoPreload";
import { LiveVoiceController, type LiveOrigin, type LiveVoiceSnapshot } from "./liveVoiceController";
import { ProjectAudioSink, PROJECT_PIANO_INSTRUMENT } from "./projectAudioSink";
import { loadVerifiedSalamanderCore } from "./verifiedSalamanderCore";
import { ProjectPlayback, type ArrangementSwapResult, type ProjectLauncherSnapshot,
  type ProjectPlaybackSnapshot, type ProjectRecordingSchedule } from "./projectPlayback";
import type { UserSampleReader } from "./userSampleAsset";
import { AudioInputSession, type AudioCaptureStart, type AudioInputOptions } from "./audioInputSession";
import { DecodedPianoSampleBank, ToneSampleVoiceFactory } from "./toneSampleVoiceFactory";
import { LAYERED_SAMPLE_COUNT, loadSalamanderLayers, type LayerLoadProgress } from "./salamanderLayers";
import {
  audioLockState,
  LIVE_STUDIO_AUDIO_OWNER,
  releaseAudio,
  subscribeAudioYield,
  takeAudioOver,
  type AudioLockState,
} from "./studioAudioLock";

export interface StudioNoteOn extends LiveOrigin {
  /** The physical key, used to pair repeated Note On/Off events. */
  originalNote: number;
  /** The pitch after the caller's device/range/transpose mapping. */
  mappedMidi: number;
  rawVelocity: number;
  /** Already calibrated and curved, from 0 to 1. */
  amplitude: number;
  /** Browser performance clock, if supplied by Web MIDI. */
  eventTimestamp?: number;
}

export interface StudioNoteOff extends LiveOrigin {
  originalNote: number;
  eventTimestamp?: number;
}

export type StudioPedal = "sustain" | "sostenuto" | "unaCorda" | "half";

export interface StudioMetronomeOptions {
  enabled: boolean;
  bpm: number;
  volumeDb?: number;
}

export interface LiveStudioEngineOptions {
  latencyMode?: AudioLatencyMode;
  masterVolumeDb?: number;
  reverbDecay?: number;
  reverbSend?: number;
  chorusWet?: number;
  releaseSeconds?: number;
  pitchBendRange?: number;
  visibleRangeStart?: number;
  onDiagnostics?: (diagnostics: LiveStudioDiagnostics) => void;
}

export interface LiveStudioDiagnostics {
  phase: "idle" | "starting" | "loading-core" | "ready" | "partial" | "error" | "disposed";
  error: string | null;
  samples: {
    loaded: number;
    total: number;
    missingVisible: number;
    loading: boolean;
    failed: string[];
    decodedPcmBytes: number;
    /** All decoded banks still referenced by this Studio, including fallback and fading slots. */
    residentDecodedPcmBytes: number;
  };
  voices: LiveVoiceSnapshot | null;
  drumsLoaded: number;
  metronomeOn: boolean;
  audioLock: AudioLockState;
  audioContextState: AudioContextState | "uninitialized";
  instrument: {
    activeId: string;
    loadingId: string | null;
    loadingProgress: LayerLoadProgress | null;
    error: string | null;
  };
}

interface InstrumentSlot {
  id: string;
  bank: DecodedPianoSampleBank;
  bus: Tone.Gain;
  chain: InstrumentChain;
  voicing: Tone.EQ3 | null;
  factory: ToneSampleVoiceFactory;
  activeHandles: number;
  retired: boolean;
  disposed: boolean;
}

interface StudioGraph {
  limiter: Tone.Limiter;
  makeup: Tone.Gain;
  compressor: Tone.Compressor;
  reverb: Tone.Reverb;
  reverbHighpass: Tone.Filter;
  reverbSend: Tone.Gain;
  chorus: Tone.Chorus;
  master: Tone.Volume;
  activeSlot: InstrumentSlot;
  retiredSlots: Set<InstrumentSlot>;
  voices: LiveVoiceController;
  drums: DrumKitEngine;
  metronomeVolume: Tone.Volume;
  metronome: DrumKitEngine;
}

interface HeldNote extends LiveOrigin {
  originalNote: number;
  held: boolean;
  routed: boolean;
}

interface ChannelControls extends LiveOrigin {
  volume: number;
  expression: number;
  modulation: number;
  sustain: number;
  sostenuto: boolean;
  unaCorda: boolean;
  pressure: number;
  bend: number;
  polyPressure: Map<number, number>;
}

const PIANO_SAMPLE_COUNT = Object.keys(salamanderSamples).length;
const MAX_RESIDENT_PCM_BYTES = 432 * 1024 * 1024;
const CORE_SET = new Set<string>(CORE_PIANO_NOTES);
const REMOTE_SALAMANDER_URL = "https://tonejs.github.io/audio/salamander/";
const LOCAL_ANCHORS_URL = "/audio/salamander/anchors/";
const DEFAULT_VISIBLE_START = 48; // C3, through C6 on the 37-key display.
const VISIBLE_KEY_COUNT = 37;
const GM_MIX_NAMES: Record<number, string> = {
  0: "Acoustic Grand Piano", 1: "Bright Acoustic Piano",
  4: "Electric Piano 1", 5: "Electric Piano 2",
  11: "Vibraphone", 12: "Marimba", 21: "Accordion",
  24: "Acoustic Guitar Nylon", 25: "Acoustic Guitar Steel",
  27: "Electric Guitar Clean", 40: "Violin", 73: "Flute",
};

function bounded(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum;
}

function isCaptureContext(context: AudioContext | OfflineAudioContext): context is AudioContext {
  const online = context as AudioContext;
  return typeof online.createMediaStreamSource === "function" && !!online.audioWorklet;
}

function channelKey(origin: LiveOrigin): string {
  if (!origin.inputId || !Number.isInteger(origin.channel) || origin.channel < 0 || origin.channel > 15) {
    throw new RangeError("A live origin needs an inputId and MIDI channel 0..15");
  }
  return `${origin.inputId.length}:${origin.inputId}:${origin.channel}`;
}

function noteKey(origin: LiveOrigin, note: number): string {
  if (!Number.isInteger(note) || note < 0 || note > 127) throw new RangeError("MIDI note must be 0..127");
  return `${channelKey(origin)}:${note}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isOgg(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  const magic = new Uint8Array(bytes, 0, 4);
  return magic[0] === 0x4f && magic[1] === 0x67 && magic[2] === 0x67 && magic[3] === 0x53;
}

/** Owns one Studio graph; the caller remains responsible for MIDI mapping and recording. */
export class LiveStudioEngine {
  private readonly bank = new DecodedPianoSampleBank();
  private activeInstrumentId = DEFAULT_INSTRUMENT_ID;
  private preparedBank: DecodedPianoSampleBank | null = null;
  private preparedGain = 1;
  private instrumentLoadingId: string | null = null;
  private instrumentLoadingProgress: LayerLoadProgress | null = null;
  private instrumentError: string | null = null;
  private instrumentRequest = 0;
  private instrumentAbort: AbortController | null = null;
  private readonly onDiagnostics?: (diagnostics: LiveStudioDiagnostics) => void;
  private readonly channelControls = new Map<string, ChannelControls>();
  private readonly globalPedals = new Map<string, Partial<Record<StudioPedal, number | boolean>>>();
  private readonly heldNotes = new Map<string, HeldNote[]>();
  private readonly sampleInFlight = new Map<string, Promise<boolean>>();
  private readonly failedSamples = new Set<string>();
  private graph: StudioGraph | null = null;
  private projectPlayback: ProjectPlayback | null = null;
  private readonly audioInputSessions = new Set<AudioInputSession>();
  private projectRequest = 0;
  private initializePromise: Promise<boolean> | null = null;
  private claimPromise: Promise<boolean> | null = null;
  private backgroundTask: Promise<void> | null = null;
  private sampleAbort: AbortController | null = null;
  private sampleQueue: Array<[string, string]> = [];
  private idleReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  private reverbTimer: ReturnType<typeof setTimeout> | null = null;
  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private metronomeNextTime = 0;
  private metronomeGeneration = 0;
  private generation = 0;
  private ownsAudio = false;
  private controlsNeedRestore = false;
  private disposed = false;
  private phase: LiveStudioDiagnostics["phase"] = "idle";
  private lastError: string | null = null;
  private latencyMode: AudioLatencyMode;
  private masterVolumeDb: number;
  private reverbDecay: number;
  private reverbSend: number;
  private chorusWet: number;
  private releaseSeconds: number;
  private pitchBendRange: number;
  private visibleRangeStart: number;
  private metronome: StudioMetronomeOptions = { enabled: false, bpm: 120, volumeDb: -6 };
  private unsubscribeYield: (() => void) | null = null;

  constructor(options: LiveStudioEngineOptions = {}) {
    this.latencyMode = options.latencyMode ?? "balanced";
    this.masterVolumeDb = bounded(options.masterVolumeDb ?? -10, -40, 0);
    this.reverbDecay = bounded(options.reverbDecay ?? 2.5, 0.1, 10);
    this.reverbSend = bounded(options.reverbSend ?? 0.18, 0, 1);
    this.chorusWet = bounded(options.chorusWet ?? 0, 0, 1);
    this.releaseSeconds = bounded(options.releaseSeconds ?? 1.2, 0.01, 10);
    this.pitchBendRange = bounded(options.pitchBendRange ?? 2, 0, 24);
    this.visibleRangeStart = bounded(options.visibleRangeStart ?? DEFAULT_VISIBLE_START, 0, 128 - VISIBLE_KEY_COUNT);
    this.onDiagnostics = options.onDiagnostics;
    // React StrictMode may call a useState initializer twice and discard one
    // instance. Listener registration must wait until the engine is used.
    this.preloadCore();
  }

  private ensureListeners(): void {
    if (this.unsubscribeYield || this.disposed) return;
    this.unsubscribeYield = subscribeAudioYield(async () => {
      this.generation++;
      this.releaseAllSounds("audio-lock-lost");
      this.ownsAudio = false;
      // The forced fade is 12 ms. Advertise release only after it is silent.
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Safe before any user gesture: decodes seven local OGGs in an offline context. */
  preloadCore(): void {
    startCorePianoPreload();
  }

  get currentInstrumentId(): string { return this.activeInstrumentId; }

  /** Prepares a candidate before swapping; an older request can never win. */
  async selectInstrument(id: string): Promise<boolean> {
    if (this.disposed) return false;
    const definition = getInstrument(id);
    if (!definition) {
      this.instrumentError = `Instrumento desconocido: ${id}`;
      this.publish();
      return false;
    }
    if (id === this.activeInstrumentId) {
      if (this.instrumentLoadingId) {
        this.instrumentAbort?.abort();
        this.instrumentRequest++;
        this.instrumentLoadingId = null;
        this.instrumentLoadingProgress = null;
        this.instrumentError = null;
        this.publish();
      }
      return true;
    }
    const layered = id === "salamander-layered";
    this.instrumentAbort?.abort();
    const request = ++this.instrumentRequest;
    const controller = new AbortController();
    this.instrumentAbort = controller;
    this.instrumentLoadingId = id;
    this.instrumentLoadingProgress = layered
      ? { loaded: 0, total: LAYERED_SAMPLE_COUNT, decodedPcmBytes: 0 } : null;
    this.instrumentError = null;
    // A new remote preset owns bandwidth and decode time while preparing.
    // Core Salamander samples remain available; non-core background work can
    // resume if the request fails and the piano stays active.
    if (definition.source.kind === "waf" || layered) {
      this.sampleAbort?.abort();
      this.sampleQueue = [];
    }
    this.publish();
    try {
      let bank = this.bank;
      let gain = 1;
      if (layered) {
        const referenceC4 = await getCorePianoBuffer("C4");
        if (!referenceC4) throw new Error("No está lista la muestra C4 del piano actual");
        const loaded = await loadSalamanderLayers(referenceC4, controller.signal, (progress) => {
          if (request !== this.instrumentRequest || controller.signal.aborted || this.disposed) return;
          this.instrumentLoadingProgress = progress;
          if (progress.loaded % 4 === 0 || progress.loaded === progress.total) this.publish();
        });
        bank = loaded.bank;
        gain = loaded.levelMatchGain;
        if (this.residentDecodedPcmBytes(bank) > MAX_RESIDENT_PCM_BYTES) {
          throw new Error("Las capas exceden la memoria disponible para audio; sigue activo el instrumento anterior");
        }
      } else if (definition.source.kind === "waf") {
        const decoded = await loadWafDecodedBank(definition.source.code, controller.signal);
        bank = new DecodedPianoSampleBank();
        decoded.samples.forEach((sample) => bank.add(sample));
        gain = decoded.gain;
      }
      if (controller.signal.aborted || request !== this.instrumentRequest || this.disposed) return false;
      if (definition.source.kind === "waf" || layered) {
        const { minMidi, maxMidi } = definition.suggestedRange;
        const missing = bank.coverage(minMidi, maxMidi, layered ? 2 : 6).missing;
        if (missing.length > 0) {
          throw new Error(`Faltan ${missing.length} notas del rango ${minMidi}–${maxMidi}`);
        }
      }
      const graph = this.graph;
      const slot = graph ? this.createInstrumentSlot(graph.master, id, bank, gain) : null;
      if (controller.signal.aborted || request !== this.instrumentRequest || this.disposed) {
        if (slot) this.disposeInstrumentSlot(slot);
        return false;
      }
      if (graph && slot) {
        const previous = graph.activeSlot;
        graph.activeSlot = slot;
        previous.retired = true;
        graph.retiredSlots.add(previous);
        this.maybeDisposeRetiredSlot(graph, previous);
      }
      this.preparedBank = bank === this.bank ? null : bank;
      this.preparedGain = gain;
      this.activeInstrumentId = id;
      this.instrumentError = null;
      if (definition.source.kind === "waf" || layered) {
        this.lastError = null;
        this.sampleAbort?.abort();
        this.sampleQueue = [];
        if (layered && this.graph && this.needsMonoFallback()) {
          this.queueMissingSamples();
          void this.startBackgroundLoad();
        }
      } else if (this.graph) {
        this.queueMissingSamples();
        void this.startBackgroundLoad();
      }
      if (layered) this.phase = this.missingVisibleCount() === 0 ? "ready" : "partial";
      return true;
    } catch (error) {
      if (request === this.instrumentRequest && !controller.signal.aborted) {
        this.instrumentError = `No cargó ${definition.label}: ${errorMessage(error)}`;
      }
      return false;
    } finally {
      if (request === this.instrumentRequest) {
        this.instrumentLoadingId = null;
        this.instrumentLoadingProgress = null;
        this.instrumentAbort = null;
        if (this.activeInstrumentId !== "salamander-layered"
          && getInstrument(this.activeInstrumentId)?.source.kind === "salamander" && this.graph) {
          this.queueMissingSamples();
          if (this.backgroundTask) {
            void this.backgroundTask.then(() => this.startBackgroundLoad());
          } else {
            void this.startBackgroundLoad();
          }
        }
        this.publish();
      }
    }
  }

  setVisibleRangeStart(start: number): void {
    if (!Number.isInteger(start) || start < 0 || start > 128 - VISIBLE_KEY_COUNT) {
      throw new RangeError("visible range must fit 37 MIDI keys");
    }
    this.visibleRangeStart = start;
    if (getInstrument(this.activeInstrumentId)?.source.kind === "salamander") {
      this.queueMissingSamples();
      if (this.activeInstrumentId === "salamander-layered" && this.needsMonoFallback()) {
        void this.startBackgroundLoad();
        this.phase = this.missingVisibleCount() === 0 ? "ready" : "partial";
      }
    }
    this.publish();
  }

  /** Tone.start() still needs a browser audio gesture under normal autoplay policy. */
  initialize(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.ensureListeners();
    if (this.graph) return Promise.resolve(this.graph.activeSlot.bank.size > 0);
    if (this.initializePromise) return this.initializePromise;
    const generation = this.generation;
    this.phase = "starting";
    this.lastError = null;
    this.publish();
    const task = this.initializeOnce(generation);
    this.initializePromise = task.finally(() => { this.initializePromise = null; });
    return this.initializePromise;
  }

  private async initializeOnce(generation: number): Promise<boolean> {
    try {
      configureAudioTiming(this.latencyMode);
      await Tone.start();
      if (this.disposed || generation !== this.generation) return false;
      this.graph = this.createGraph();
      this.restoreControls();
      this.phase = "loading-core";
      this.publish();
      await Promise.all(CORE_PIANO_NOTES.map((note) => this.loadSample(note, salamanderSamples[note], generation)));
      if (this.disposed || generation !== this.generation) return false;
      this.phase = getInstrument(this.activeInstrumentId)?.source.kind === "waf"
        || this.missingVisibleCount() === 0
        ? "ready" : "partial";
      if (this.graph.activeSlot.bank.size === 0) {
        this.lastError = "No cargó ninguna muestra del instrumento activo. Revisa la conexión y reintenta.";
      } else if (getInstrument(this.activeInstrumentId)?.source.kind === "waf") {
        this.lastError = null;
      }
      this.publish();
      if (getInstrument(this.activeInstrumentId)?.source.kind === "salamander"
        && (this.activeInstrumentId !== "salamander-layered" || this.needsMonoFallback())) {
        this.queueMissingSamples();
        void this.startBackgroundLoad();
      }
      // The graph is usable by pads and the metronome even if piano samples
      // failed. Piano attacks themselves remain silent until a retry succeeds.
      return true;
    } catch (error) {
      this.lastError = `No se pudo activar audio: ${errorMessage(error)}`;
      this.phase = "error";
      if (this.graph) this.disposeGraph(this.graph);
      this.graph = null;
      this.publish();
      return false;
    }
  }

  private createGraph(): StudioGraph {
    const created: Array<{ dispose(): void }> = [];
    try {
      const limiter = new Tone.Limiter(-2).toDestination(); created.push(limiter);
      const makeup = new Tone.Gain(1.12).connect(limiter); created.push(makeup);
      const compressor = new Tone.Compressor({
        threshold: -18, ratio: 5, attack: 0.003, release: 0.1, knee: 6,
      }).connect(makeup); created.push(compressor);
      const reverb = new Tone.Reverb({ decay: this.reverbDecay, wet: 1 }).connect(compressor); created.push(reverb);
      void reverb.ready.catch(() => {
        if (!this.disposed) {
          this.lastError = "La reverberación no cargó; el piano seco sigue disponible.";
          this.publish();
        }
      });
      const reverbHighpass = new Tone.Filter({ type: "highpass", frequency: 200, Q: 0.7 }).connect(reverb);
      created.push(reverbHighpass);
      const reverbSend = new Tone.Gain(this.reverbSend).connect(reverbHighpass); created.push(reverbSend);
      const chorus = new Tone.Chorus(4, 2.5, 0.5); created.push(chorus);
      chorus.wet.value = this.chorusWet;
      chorus.start();
      chorus.connect(compressor);
      chorus.connect(reverbSend);
      const master = new Tone.Volume(this.masterVolumeDb).connect(chorus); created.push(master);
      const activeSlot = this.createInstrumentSlot(
        master, this.activeInstrumentId, this.preparedBank ?? this.bank, this.preparedGain,
      );
      created.push({ dispose: () => this.disposeInstrumentSlot(activeSlot) });
      const retiredSlots = new Set<InstrumentSlot>();
      const voices = new LiveVoiceController({
        create: (attack, initial, onEnded) => {
          const graph = this.graph;
          const slot = graph?.activeSlot ?? activeSlot;
          slot.activeHandles++;
          try {
            const handle = slot.factory.create(attack, initial, () => {
              slot.activeHandles--;
              onEnded();
              if (graph) this.maybeDisposeRetiredSlot(graph, slot);
              this.scheduleIdleRelease();
              this.publish();
            });
            if (!handle) slot.activeHandles--;
            return handle;
          } catch (error) {
            slot.activeHandles--;
            throw error;
          }
        },
      }, this.releaseSeconds);
      const drums = new DrumKitEngine(master); created.push(drums);
      const metronomeVolume = new Tone.Volume(this.metronome.volumeDb ?? -6).connect(limiter);
      created.push(metronomeVolume);
      const metronome = new DrumKitEngine(metronomeVolume, { source: "virtuosity-core" });
      created.push(metronome);
      return {
        limiter, makeup, compressor, reverb, reverbHighpass, reverbSend,
        chorus, master, activeSlot, retiredSlots, voices, drums,
        metronomeVolume, metronome,
      };
    } catch (error) {
      created.reverse().forEach((node) => node.dispose());
      throw error;
    }
  }

  private createInstrumentSlot(
    master: Tone.ToneAudioNode,
    id: string,
    bank: DecodedPianoSampleBank,
    gain: number,
  ): InstrumentSlot {
    const definition = getInstrument(id);
    if (!definition) throw new Error(`Instrumento desconocido: ${id}`);
    const chain = createInstrumentChain(
      definition.source.kind === "salamander"
        ? "Acoustic Grand Piano"
        : GM_MIX_NAMES[definition.source.program] ?? "Instrument",
      master,
    );
    let voicing: Tone.EQ3 | null = null;
    let bus: Tone.Gain | null = null;
    try {
      // The natural Salamander path is unchanged. These mild alternatives
      // affect the bank's tone without duplicating its decoded PCM.
      if (definition.source.kind === "salamander"
        && (definition.source.voicing === "warm" || definition.source.voicing === "bright")) {
        voicing = new Tone.EQ3({
          low: definition.source.voicing === "warm" ? 0.6 : -0.3,
          mid: 0,
          high: definition.source.voicing === "warm" ? -1.8 : 1.5,
          lowFrequency: 220,
          highFrequency: 3000,
        }).connect(chain.input);
      }
      bus = new Tone.Gain(gain).connect(voicing ?? chain.input);
      return {
        id, bank, bus, chain, voicing,
        factory: new ToneSampleVoiceFactory(bank, bus, {
          maxShiftSemitones: id === "salamander-layered" ? 2 : 6,
          attackSeconds: definition.source.kind === "salamander" ? 0 : 0.003,
          velocityColor: definition.source.kind === "salamander",
          fallbackBank: id === "salamander-layered" ? this.bank : undefined,
          primaryRange: id === "salamander-layered" ? { minMidi: 48, maxMidi: 84 } : undefined,
        }),
        activeHandles: 0, retired: false, disposed: false,
      };
    } catch (error) {
      bus?.dispose();
      voicing?.dispose();
      chain.dispose();
      throw error;
    }
  }

  private disposeInstrumentSlot(slot: InstrumentSlot): void {
    if (slot.disposed) return;
    slot.disposed = true;
    slot.bus.dispose();
    slot.voicing?.dispose();
    slot.chain.dispose();
  }

  private maybeDisposeRetiredSlot(graph: StudioGraph, slot: InstrumentSlot): void {
    if (slot.retired && slot.activeHandles === 0) {
      graph.retiredSlots.delete(slot);
      this.disposeInstrumentSlot(slot);
    }
  }

  private disposeGraph(graph: StudioGraph): void {
    graph.voices.dispose(Tone.immediate());
    graph.drums.dispose();
    graph.metronome.dispose();
    graph.metronomeVolume.dispose();
    this.disposeInstrumentSlot(graph.activeSlot);
    for (const slot of graph.retiredSlots) this.disposeInstrumentSlot(slot);
    graph.retiredSlots.clear();
    graph.master.dispose();
    graph.chorus.dispose();
    graph.reverbSend.dispose();
    graph.reverbHighpass.dispose();
    graph.reverb.dispose();
    graph.compressor.dispose();
    graph.makeup.dispose();
    graph.limiter.dispose();
  }

  private async claimOutput(): Promise<boolean> {
    if (this.disposed) return false;
    this.ensureListeners();
    if (this.ownsAudio && audioLockState().owns) return true;
    if (this.claimPromise) return this.claimPromise;
    const generation = this.generation;
    const task = takeAudioOver(LIVE_STUDIO_AUDIO_OWNER).then((granted) => {
      if (this.disposed || generation !== this.generation) {
        if (granted) releaseAudio(LIVE_STUDIO_AUDIO_OWNER);
        return false;
      }
      this.ownsAudio = granted;
      if (granted && this.graph && this.controlsNeedRestore) this.restoreControls();
      this.publish();
      return granted;
    });
    this.claimPromise = task.finally(() => { this.claimPromise = null; });
    return this.claimPromise;
  }

  /** A short key released during lock/sample startup is cancelled, never played late. */
  async noteOn(input: StudioNoteOn): Promise<number | null> {
    if (this.disposed) return null;
    const key = noteKey(input, input.originalNote);
    if (!Number.isInteger(input.mappedMidi) || input.mappedMidi < 0 || input.mappedMidi > 127 ||
        !Number.isInteger(input.rawVelocity) || input.rawVelocity < 1 || input.rawVelocity > 127) {
      throw new RangeError("mappedMidi and rawVelocity must be MIDI 0..127 and 1..127");
    }
    const held: HeldNote = { inputId: input.inputId, channel: input.channel,
      originalNote: input.originalNote, held: true, routed: false };
    const queue = this.heldNotes.get(key) ?? [];
    queue.push(held);
    this.heldNotes.set(key, queue);
    const generation = this.generation;
    this.cancelIdleRelease();
    try {
      if (!(this.ownsAudio && audioLockState().owns)) {
        if (!(await this.claimOutput())) return null;
      }
      if (!this.graph && !(await this.initialize())) return null;
      if (this.disposed || generation !== this.generation || !held.held || !this.ownsAudio || !audioLockState().owns) return null;
      if (this.controlsNeedRestore) this.restoreControls();
      const attackId = this.graph!.voices.noteOn({
        inputId: input.inputId,
        channel: input.channel,
        originalNote: input.originalNote,
        mappedMidi: input.mappedMidi,
        rawVelocity: input.rawVelocity,
        amplitude: input.amplitude,
        audioTime: liveNoteTime(input.eventTimestamp),
      });
      held.routed = true; // Also pair a silent attack, preserving repeated-key FIFO.
      const poly = this.channelControls.get(channelKey(input))?.polyPressure.get(input.originalNote);
      if (attackId !== null && poly !== undefined) {
        this.graph!.voices.setPolyPressure(input, input.originalNote, poly, Tone.immediate());
      }
      this.publish();
      return attackId;
    } catch (error) {
      this.lastError = `No sonó la nota: ${errorMessage(error)}`;
      this.publish();
      return null;
    } finally {
      if (!held.held) this.scheduleIdleRelease();
    }
  }

  noteOff(input: StudioNoteOff): number | null {
    const key = noteKey(input, input.originalNote);
    const queue = this.heldNotes.get(key);
    const held = queue?.shift();
    if (queue?.length === 0) this.heldNotes.delete(key);
    if (!held) return null;
    held.held = false;
    this.channelControls.get(channelKey(input))?.polyPressure.delete(input.originalNote);
    const released = held.routed
      ? this.graph?.voices.noteOff({ ...input, audioTime: liveNoteTime(input.eventTimestamp) }) ?? null
      : null;
    this.scheduleIdleRelease();
    this.publish();
    return released;
  }

  /** Native musical expression only; hardware bindings and recording stay with the caller. */
  applyMidiExpression(event: MidiEvent): void {
    if (this.disposed || !("channel" in event)) return;
    if (!["cc", "pitchBend", "polyPressure", "channelPressure"].includes(event.kind)) return;
    const origin = { inputId: event.inputId, channel: event.channel };
    const state = this.controlsFor(origin);
    const voices = this.graph?.voices;
    const at = this.graph ? Tone.immediate() : 0;
    switch (event.kind) {
      case "cc": {
        const value = bounded(event.value, 0, 127);
        switch (event.controller) {
          case 1: state.modulation = value; voices?.setModulation(origin, value, at); break;
          case 7: state.volume = value; voices?.setVolume(origin, value, at); break;
          case 11: state.expression = value; voices?.setExpression(origin, value, at); break;
          case 64: state.sustain = value; voices?.setSustain(origin, value, at); if (value < 64) this.scheduleIdleRelease(); break;
          case 66: state.sostenuto = value >= 64; voices?.setSostenuto(origin, state.sostenuto, at);
            if (!state.sostenuto) this.scheduleIdleRelease(); break;
          case 67: state.unaCorda = value >= 64; voices?.setUnaCorda(origin, state.unaCorda, at); break;
          case 120: this.cancelOriginNotes(origin); voices?.allSoundOff(origin, at); this.scheduleIdleRelease(); break;
          case 123: this.cancelOriginNotes(origin); voices?.allNotesOff(origin, at); this.scheduleIdleRelease(); break;
          default: return;
        }
        break;
      }
      case "pitchBend":
        state.bend = bounded(event.normalized, -1, 1);
        voices?.setPitchBend(origin, state.bend, this.pitchBendRange, at);
        break;
      case "channelPressure":
        state.pressure = bounded(event.pressure, 0, 127);
        voices?.setChannelPressure(origin, state.pressure, at);
        break;
      case "polyPressure":
        state.polyPressure.set(event.note, bounded(event.pressure, 0, 127));
        voices?.setPolyPressure(origin, event.note, event.pressure, at);
        break;
    }
    this.publish();
  }

  setGlobalPedal(source: string, pedal: StudioPedal, value: number | boolean): void {
    if (this.disposed || !source) return;
    const pedals = this.globalPedals.get(source) ?? {};
    pedals[pedal] = value;
    this.globalPedals.set(source, pedals);
    const voices = this.graph?.voices;
    if (!voices) return;
    const at = Tone.immediate();
    switch (pedal) {
      case "sustain": voices.setGlobalSustain(source, typeof value === "boolean" ? (value ? 127 : 0) : value, at); break;
      case "sostenuto": voices.setGlobalSostenuto(source, Boolean(value), at); break;
      case "unaCorda": voices.setGlobalUnaCorda(source, Boolean(value), at); break;
      case "half": voices.setGlobalHalfPedal(source, typeof value === "boolean" ? Number(value) : value, at); break;
    }
    if (!value) this.scheduleIdleRelease();
    this.publish();
  }

  /** Real sampled channel-10/pad hit; a cold sample is never fired belatedly. */
  async triggerDrum(note: number, rawVelocity: number, eventTimestamp?: number): Promise<boolean> {
    if (this.disposed || !Number.isInteger(note) || note < 0 || note > 127 ||
        !Number.isInteger(rawVelocity) || rawVelocity < 1 || rawVelocity > 127) return false;
    const generation = this.generation;
    if (!(await this.claimOutput()) || !(await this.initialize())) return false;
    const drums = this.graph?.drums;
    if (!drums || generation !== this.generation || !this.ownsAudio || !audioLockState().owns) return false;
    try {
      if (!drums.has(note)) await drums.load(note);
      if (generation !== this.generation || !this.ownsAudio || !audioLockState().owns) return false;
      if (!drums.has(note)) {
        drums.noteSkipped(note);
        this.lastError = `No hay muestra de percusión para la nota ${note}.`;
        this.publish();
        return false;
      }
      if (eventTimestamp !== undefined && performance.now() - eventTimestamp > 150) return false;
      const played = drums.trigger(note, rawVelocity / 127, liveNoteTime(eventTimestamp));
      if (played) this.drumWasPlayed = true;
      this.publish();
      return played;
    } catch (error) {
      this.lastError = `No cargó el pad ${note}: ${errorMessage(error)}`;
      this.publish();
      return false;
    } finally {
      this.scheduleIdleRelease();
    }
  }

  /** A lookahead clock for the verified Virtuosity cowbell recording. */
  async setMetronome(options: StudioMetronomeOptions): Promise<boolean> {
    const request = ++this.metronomeGeneration;
    this.stopMetronome();
    this.metronome = {
      enabled: options.enabled,
      bpm: bounded(options.bpm, 20, 300),
      volumeDb: bounded(options.volumeDb ?? this.metronome.volumeDb ?? -6, -40, 0),
    };
    this.projectPlayback?.setMetronomeEnabled(options.enabled);
    if (this.projectPlayback?.scheduler.state === "playing") {
      this.publish();
      return !this.disposed;
    }
    if (!options.enabled || this.disposed) {
      this.scheduleIdleRelease();
      this.publish();
      return !this.disposed;
    }
    if (!(await this.claimOutput()) || !(await this.initialize()) || request !== this.metronomeGeneration ||
        !this.graph || !this.ownsAudio || !audioLockState().owns) {
      if (request === this.metronomeGeneration) this.metronome.enabled = false;
      this.scheduleIdleRelease();
      return false;
    }
    try { await this.graph.metronome.load(56); }
    catch (error) {
      if (request === this.metronomeGeneration) {
        this.metronome.enabled = false;
        this.lastError = `No cargó el click grabado: ${errorMessage(error)}`;
        this.publish();
      }
      return false;
    }
    if (request !== this.metronomeGeneration || !this.graph || !this.ownsAudio ||
        !audioLockState().owns || this.projectPlayback?.snapshot().transport.state === "playing") return false;
    this.graph.metronomeVolume.volume.rampTo(this.metronome.volumeDb ?? -6, 0.03);
    this.metronomeNextTime = Tone.immediate() + 0.025;
    const tick = () => {
      if (!this.graph || !this.metronome.enabled || this.disposed || !this.ownsAudio || !audioLockState().owns) return;
      const now = Tone.immediate();
      const period = 60 / this.metronome.bpm;
      if (this.metronomeNextTime < now - period) this.metronomeNextTime = now + 0.025;
      let count = 0;
      while (this.metronomeNextTime <= now + 0.1 && count++ < 4) {
        this.graph.metronome.triggerOwned(56, 0.6,
          `metronome/live/epoch-${request}`, request, this.metronomeNextTime, 0.25);
        this.metronomeNextTime += period;
      }
    };
    tick();
    this.metronomeTimer = setInterval(tick, 25);
    this.publish();
    return true;
  }

  setMasterVolumeDb(db: number): void {
    this.masterVolumeDb = bounded(db, -40, 0);
    this.graph?.master.volume.rampTo(this.masterVolumeDb, 0.05);
  }

  setReverbDecay(seconds: number): void {
    this.reverbDecay = bounded(seconds, 0.1, 10);
    if (this.reverbTimer) clearTimeout(this.reverbTimer);
    this.reverbTimer = setTimeout(() => {
      this.reverbTimer = null;
      if (this.graph && this.graph.reverb.decay !== this.reverbDecay) this.graph.reverb.decay = this.reverbDecay;
    }, 160);
  }

  setReverbSend(level: number): void {
    this.reverbSend = bounded(level, 0, 1);
    this.graph?.reverbSend.gain.rampTo(this.reverbSend, 0.03);
  }

  setChorusWet(level: number): void {
    this.chorusWet = bounded(level, 0, 1);
    this.graph?.chorus.wet.rampTo(this.chorusWet, 0.03);
  }

  setReleaseSeconds(seconds: number): void {
    this.releaseSeconds = bounded(seconds, 0.01, 10);
    this.graph?.voices.setReleaseSeconds(this.releaseSeconds);
  }

  setPitchBendRange(semitones: number): void {
    this.pitchBendRange = bounded(semitones, 0, 24);
    if (!this.graph) return;
    const at = Tone.immediate();
    for (const control of this.channelControls.values()) {
      this.graph.voices.setPitchBend(control, control.bend, this.pitchBendRange, at);
    }
  }

  releaseOrigin(inputId: string, channel?: number): void {
    if (!inputId || this.disposed) return;
    for (const [key, queue] of this.heldNotes) {
      if (queue[0]?.inputId === inputId && (channel === undefined || queue[0]?.channel === channel)) {
        queue.forEach((held) => { held.held = false; });
        this.heldNotes.delete(key);
      }
    }
    this.graph?.voices.releaseOrigin(inputId, Tone.immediate(), channel);
    for (const [key, control] of this.channelControls) {
      if (control.inputId === inputId && (channel === undefined || control.channel === channel)) this.channelControls.delete(key);
    }
    this.scheduleIdleRelease();
    this.publish();
  }

  releaseAll(): void {
    this.releaseAllSounds("panic");
    this.scheduleIdleRelease();
    this.publish();
  }

  private releaseAllSounds(reason = "studio-release"): void {
    this.metronomeGeneration++;
    this.projectPlayback?.stop();
    for (const session of this.audioInputSessions) session.interrupt(reason);
    for (const queue of this.heldNotes.values()) queue.forEach((held) => { held.held = false; });
    this.heldNotes.clear();
    if (this.graph) {
      this.graph.voices.releaseAll(Tone.immediate());
      this.graph.drums.releaseAll();
      this.controlsNeedRestore = true;
    }
    this.stopMetronome();
    this.metronome.enabled = false;
    this.drumWasPlayed = false;
  }

  /** Explicit retry, including samples that failed during initial/background load. */
  async retrySamples(): Promise<void> {
    if (this.disposed) return;
    if (getInstrument(this.activeInstrumentId)?.source.kind !== "salamander"
      || (this.activeInstrumentId === "salamander-layered" && !this.needsMonoFallback())) return;
    if (!this.graph && !(await this.initialize())) return;
    this.sampleAbort?.abort();
    await this.backgroundTask;
    this.failedSamples.clear();
    const generation = this.generation;
    await Promise.all(CORE_PIANO_NOTES
      .filter((note) => !this.bank.pitches().includes(Tone.Frequency(note).toMidi()))
      .map((note) => this.loadSample(note, salamanderSamples[note], generation)));
    this.queueMissingSamples();
    await this.startBackgroundLoad();
    this.lastError = this.bank.size > 0 ? null : "No cargó ninguna muestra del piano. Revisa la conexión y reintenta.";
    this.publish();
  }

  private needsMonoFallback(): boolean {
    return this.visibleRangeStart < 48 || this.visibleRangeStart + VISIBLE_KEY_COUNT - 1 > 84;
  }

  private residentDecodedPcmBytes(candidate?: DecodedPianoSampleBank): number {
    const banks = new Set<DecodedPianoSampleBank>([this.bank]);
    if (this.preparedBank) banks.add(this.preparedBank);
    if (this.graph) {
      banks.add(this.graph.activeSlot.bank);
      for (const slot of this.graph.retiredSlots) banks.add(slot.bank);
    }
    if (candidate) banks.add(candidate);
    let bytes = 0;
    for (const bank of banks) bytes += bank.decodedPcmBytes;
    return bytes;
  }

  private missingVisibleCount(): number {
    const activeBank = this.graph?.activeSlot.bank ?? this.preparedBank ?? this.bank;
    const end = this.visibleRangeStart + VISIBLE_KEY_COUNT - 1;
    if (this.activeInstrumentId !== "salamander-layered") {
      return activeBank.coverage(this.visibleRangeStart, end).missing.length;
    }
    let missing = 0;
    for (let midi = this.visibleRangeStart; midi <= end; midi++) {
      const layered = midi >= 48 && midi <= 84 && activeBank.closest(midi, 2, 64);
      if (!layered && !this.bank.closest(midi, 6)) missing++;
    }
    return missing;
  }

  diagnostics(): LiveStudioDiagnostics {
    const activeBank = this.graph?.activeSlot.bank ?? this.preparedBank ?? this.bank;
    const isSalamander = getInstrument(this.activeInstrumentId)?.source.kind === "salamander";
    const isLayered = this.activeInstrumentId === "salamander-layered";
    return {
      phase: this.phase,
      error: this.lastError,
      samples: {
        loaded: activeBank.size,
        total: isLayered ? LAYERED_SAMPLE_COUNT : isSalamander ? PIANO_SAMPLE_COUNT : activeBank.size,
        missingVisible: this.missingVisibleCount(),
        loading: this.instrumentLoadingId !== null || (isSalamander && (this.phase === "loading-core" || this.backgroundTask !== null)),
        failed: isSalamander && !isLayered ? [...this.failedSamples] : [],
        decodedPcmBytes: activeBank.decodedPcmBytes,
        residentDecodedPcmBytes: this.residentDecodedPcmBytes(),
      },
      voices: this.graph?.voices.snapshot() ?? null,
      drumsLoaded: this.graph?.drums.loadedCount() ?? 0,
      metronomeOn: this.projectPlayback?.scheduler.state === "playing"
        ? this.projectPlayback.scheduler.isMetronomeEnabled
        : this.metronome.enabled && this.metronomeTimer !== null,
      audioLock: audioLockState(),
      audioContextState: this.graph ? Tone.getContext().rawContext.state : "uninitialized",
      instrument: {
        activeId: this.activeInstrumentId,
        loadingId: this.instrumentLoadingId,
        loadingProgress: this.instrumentLoadingProgress,
        error: this.instrumentError,
      },
    };
  }

  /** Read-only clock seam for a future transport sink on this tab's graph. */
  /** Browser-reported output buffering, NOT measured key-to-speaker latency. */
  outputBufferLatencyEstimateMs(): number | null {
    if (!this.graph || this.disposed) return null;
    const context = Tone.getContext().rawContext as unknown as {
      baseLatency?: number; outputLatency?: number;
    };
    const base = context.baseLatency;
    if (typeof base !== "number" || !Number.isFinite(base) || base < 0) return null;
    const output = typeof context.outputLatency === "number" &&
      Number.isFinite(context.outputLatency) && context.outputLatency >= 0
      ? context.outputLatency : 0;
    return Math.round((base + output) * 1000);
  }

  audioClockSnapshot(): { currentTime: number; state: AudioContextState; ownsOutput: boolean } | null {
    if (!this.graph || this.disposed) return null;
    const context = Tone.getContext().rawContext;
    return { currentTime: context.currentTime, state: context.state,
      ownsOutput: this.ownsAudio && audioLockState().owns };
  }

  /** Prepares isolated project slots on the same audible graph as live Studio. */
  async prepareProjectPlayback(document: ProjectDocumentV1, resolver: TimelineResolver,
    loop?: LoopRange, assetReader?: UserSampleReader): Promise<ProjectPlayback | null> {
    if (this.disposed) return null;
    const request = ++this.projectRequest;
    if (!(await this.claimOutput())) return null;
    await this.initialize();
    const graph = this.graph;
    if (!graph || this.disposed || request !== this.projectRequest || !this.ownsAudio || !audioLockState().owns) return null;
    let projectBank: DecodedPianoSampleBank;
    try {
      const needsPiano = document.tracks.some((track) => track.kind === "instrument" &&
        track.instrument?.instrumentId === PROJECT_PIANO_INSTRUMENT.instrumentId);
      projectBank = needsPiano
        ? await loadVerifiedSalamanderCore(Tone.getContext().rawContext)
        : new DecodedPianoSampleBank();
    } catch (error) {
      this.lastError = `No se pudo verificar el piano de proyecto: ${errorMessage(error)}`;
      this.publish();
      return null;
    }
    if (this.disposed || request !== this.projectRequest || !this.ownsAudio || !audioLockState().owns || this.graph !== graph) return null;
    // Project mix is a clean bus into the shared final limiter. Studio's
    // live-only chorus/reverb/compressor must not color the project export.
    const sink = new ProjectAudioSink(document, graph.limiter, projectBank,
      () => this.ownsAudio && audioLockState().owns && this.graph === graph && !this.disposed,
      assetReader);
    try {
      const status = await sink.prepare();
      if (this.disposed || request !== this.projectRequest || !this.ownsAudio || !audioLockState().owns || this.graph !== graph) {
        sink.dispose();
        return null;
      }
      const audio: AudioClockSource = {
        get currentTime() { return Tone.getContext().rawContext.currentTime; },
        get state() {
          const state = Tone.getContext().rawContext.state;
          return state === "interrupted" ? "suspended" : state;
        },
      };
      const playback = new ProjectPlayback(document, sink, audio, resolver, loop);
      const prior = this.projectPlayback;
      this.projectPlayback = playback;
      prior?.dispose();
      playback.setMetronomeEnabled(this.metronome.enabled);
      this.lastError = status.masterError ?? status.tracks.find((track) => track.error)?.error ?? null;
      this.cancelIdleRelease();
      this.publish();
      return playback;
    } catch (error) {
      sink.dispose();
      this.lastError = `No se pudo preparar el proyecto: ${errorMessage(error)}`;
      this.publish();
      return null;
    }
  }

  async playProjectPlayback(tick?: number): Promise<boolean> {
    if (!this.projectPlayback || this.disposed || !(await this.claimOutput())) return false;
    this.cancelIdleRelease();
    this.metronomeGeneration++;
    this.stopMetronome();
    this.projectPlayback.setMetronomeEnabled(this.metronome.enabled);
    const played = this.projectPlayback.play(tick);
    if (!played) this.restoreLiveMetronomeAfterTransport();
    this.publish();
    return played;
  }

  projectPlaybackSnapshot(): ProjectPlaybackSnapshot | null {
    return this.projectPlayback?.snapshot() ?? null;
  }
  projectTransportTick(): number | null {
    return this.projectPlayback?.scheduler.snapshot().tick ?? null;
  }
  projectAutomationSnapshot(): ReturnType<ProjectPlayback["automationSnapshot"]> {
    return this.projectPlayback?.automationSnapshot() ?? [];
  }
  queueProjectScene(sceneId: string, requestedTick?: number): number | null {
    if (!this.projectPlayback || this.disposed) return null;
    const tick = this.projectPlayback.queueScene(sceneId, requestedTick);
    this.publish();
    return tick;
  }
  stopProjectScene(requestedTick?: number): number | null {
    if (!this.projectPlayback || this.disposed) return null;
    const tick = this.projectPlayback.stopScene(requestedTick);
    this.publish();
    return tick;
  }
  projectLauncherSnapshot(): ProjectLauncherSnapshot | null {
    return this.projectPlayback?.launchSnapshot() ?? null;
  }
  clearProjectPerformedSceneSegments(): void {
    this.projectPlayback?.clearPerformedSceneSegments();
    this.publish();
  }
  hotSwapProjectArrangement(document: ProjectDocumentV1): ArrangementSwapResult | null {
    if (!this.projectPlayback || this.disposed) return null;
    const result = this.projectPlayback.replaceArrangementRevision(document);
    this.publish();
    return result;
  }
  hotSwapProjectAutomation(document: ProjectDocumentV1): number | null {
    if (!this.projectPlayback || this.disposed) return null;
    const effectiveTick = this.projectPlayback.replaceAutomationRevision(document);
    this.publish();
    return effectiveTick;
  }
  syncProjectMixRevision(document: ProjectDocumentV1): number | null {
    if (!this.projectPlayback || this.disposed) return null;
    const effectiveTick = this.projectPlayback.syncLiveMixRevision(document);
    this.publish();
    return effectiveTick;
  }
  projectPositionAtAudioTime(audioTime: number): ReturnType<ProjectPlayback["positionAtAudioTime"]> | null {
    return this.projectPlayback?.positionAtAudioTime(audioTime) ?? null;
  }
  projectAudioNow(): number | null {
    if (!this.projectPlayback || !this.graph || this.disposed || !this.ownsAudio ||
        !audioLockState().owns) return null;
    return Tone.getContext().rawContext.currentTime;
  }

  /** Schedule a recorded count-in and optional punch on this tab's existing AudioContext. */
  async scheduleProjectAudioRecording(session: AudioInputSession, plan: ProjectAudioRecordingPlan,
    capture: Omit<AudioCaptureStart, "startTick" | "startProjectUs" | "audioTime" | "punch">):
    Promise<ProjectRecordingSchedule> {
    if (!this.audioInputSessions.has(session) || !this.projectPlayback || this.disposed ||
        !(await this.claimOutput()) || !this.ownsAudio || !audioLockState().owns) {
      throw new Error("Studio no posee la captura y el transporte del proyecto");
    }
    const context = Tone.getContext().rawContext;
    if (context.state !== "running") throw new Error("AudioContext suspendido para grabación");
    this.metronomeGeneration++;
    this.stopMetronome();
    this.projectPlayback.setMetronomeEnabled(this.metronome.enabled);
    const schedule = this.projectPlayback.scheduleRecording(session, plan, capture, context.sampleRate);
    this.cancelIdleRelease();
    this.publish();
    return schedule;
  }

  stopProjectPlayback(): void {
    this.projectPlayback?.stop();
    this.restoreLiveMetronomeAfterTransport();
    this.scheduleIdleRelease();
    this.publish();
  }
  pauseProjectPlayback(): void {
    this.projectPlayback?.pause();
    this.restoreLiveMetronomeAfterTransport();
    this.scheduleIdleRelease();
    this.publish();
  }
  private restoreLiveMetronomeAfterTransport(): void {
    if (this.metronome.enabled && this.ownsAudio && audioLockState().owns && this.graph && !this.disposed) {
      void this.setMetronome(this.metronome);
    }
  }
  setProjectLoopRange(range: LoopRange | null): void {
    this.projectPlayback?.setLoopRange(range);
    this.publish();
  }
  seekProjectPlayback(tick: number): void { this.projectPlayback?.seek(tick); this.publish(); }
  setProjectTrackMute(trackId: string, muted: boolean): void {
    this.projectPlayback?.setTrackMute(trackId, muted);
    this.publish();
  }
  setProjectTrackSolo(trackId: string, solo: boolean): void {
    this.projectPlayback?.setTrackSolo(trackId, solo);
    this.publish();
  }
  setProjectTrackMix(trackId: string, patch: {
    gainDb?: number; pan?: number; mute?: boolean; solo?: boolean;
  }): void {
    this.projectPlayback?.setTrackMix(trackId, patch);
    this.publish();
  }
  setProjectMasterGainDb(gainDb: number): void {
    this.projectPlayback?.setMasterGainDb(gainDb);
    this.publish();
  }
  setProjectTrackEffectComparison(trackId: string, mode: "off" | "original" | "processed"):
    ReturnType<ProjectAudioSink["setTrackEffectComparison"]> | null {
    if (!this.projectPlayback || this.disposed) return null;
    const result = this.projectPlayback.sink.setTrackEffectComparison(trackId, mode);
    this.publish();
    return result;
  }
  setProjectRackPadMute(trackId: string, padId: string, muted: boolean): void {
    this.projectPlayback?.setRackPadMute(trackId, padId, muted);
    this.publish();
  }
  setProjectRackPadSolo(trackId: string, padId: string, solo: boolean): void {
    this.projectPlayback?.setRackPadSolo(trackId, padId, solo);
    this.publish();
  }
  projectPadStatus(trackId: string): ReturnType<ProjectAudioSink["padStatus"]> {
    return this.projectPlayback?.sink.padStatus(trackId) ?? [];
  }
  async previewProjectPad(trackId: string, note: number, velocity: number, ownerId: string): Promise<boolean> {
    if (!this.projectPlayback || this.disposed || !(await this.claimOutput())) return false;
    return this.projectPlayback.sink.previewPad(trackId, note, velocity, ownerId) !== null;
  }
  async previewProjectNote(trackId: string, pitch: number, velocity: number,
    ownerId: string): Promise<boolean> {
    if (!this.projectPlayback || this.disposed || !(await this.claimOutput())) return false;
    return this.projectPlayback.sink.previewNote(trackId, pitch, velocity, ownerId) !== null;
  }
  async previewProjectRackPad(trackId: string, padId: string, velocity: number,
    ownerId: string): Promise<boolean> {
    if (!this.projectPlayback || this.disposed || !(await this.claimOutput())) return false;
    return this.projectPlayback.sink.previewRackPad(trackId, padId, velocity, ownerId) !== null;
  }
  async previewProjectSample(trackId: string, note: number, velocity: number, ownerId: string): Promise<boolean> {
    if (!this.projectPlayback || this.disposed || !(await this.claimOutput())) return false;
    return this.projectPlayback.sink.previewSample(trackId, note, velocity, ownerId) !== null;
  }
  releaseProjectPreview(ownerId: string): number {
    return this.projectPlayback?.sink.releasePreview(ownerId) ?? 0;
  }

  /** The capture shares this tab's AudioContext and must be armed by a user action. */
  async createAudioInputSession(options: Omit<AudioInputOptions, "context" | "ownsAudio"> = {}):
    Promise<AudioInputSession> {
    if (this.disposed || !(await this.claimOutput()) || !(await this.initialize()) ||
        !this.ownsAudio || !audioLockState().owns) {
      throw new Error("Studio no posee la salida de audio para capturar");
    }
    const context = Tone.getContext().rawContext;
    const graph = this.graph;
    if (!graph) throw new Error("Grafo de Studio no disponible para capturar");
    if (!isCaptureContext(context)) {
      throw new Error("AudioContext de captura no disponible");
    }
    const session = new AudioInputSession({ ...options, context,
      createWorkletNode: (name, workletOptions) => Tone.getContext().createAudioWorkletNode(name, workletOptions),
      ...(this.projectPlayback ? { projectPositionAtAudioTime: (audioTime: number) => {
        const position = this.projectPlayback?.positionAtAudioTime(audioTime);
        return position ? { projectUs: position.projectUs,
          projectTick: position.projectTick } : null;
      } } : {}),
      ownsAudio: () => !this.disposed && this.ownsAudio && audioLockState().owns && this.graph === graph });
    this.audioInputSessions.add(session);
    return session;
  }

  releaseAudioInputSession(session: AudioInputSession): void {
    if (!this.audioInputSessions.delete(session)) return;
    this.projectPlayback?.cancelRecording("input-disarmed", session);
    session.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.instrumentAbort?.abort();
    this.instrumentRequest++;
    this.projectRequest++;
    this.generation++;
    this.metronomeGeneration++;
    this.phase = "disposed";
    this.sampleAbort?.abort();
    this.cancelIdleRelease();
    if (this.reverbTimer) clearTimeout(this.reverbTimer);
    this.reverbTimer = null;
    this.releaseAllSounds("session-disposed");
    this.projectPlayback?.dispose();
    this.projectPlayback = null;
    this.unsubscribeYield?.();
    this.unsubscribeYield = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.ownsAudio = false;
    releaseAudio(LIVE_STUDIO_AUDIO_OWNER);
    const graph = this.graph;
    this.graph = null;
    // Let the forced 12 ms fade reach silence before disposing the source bus.
    if (graph) setTimeout(() => this.disposeGraph(graph), 75);
    this.publish();
  }

  private publish(): void {
    try { this.onDiagnostics?.(this.diagnostics()); } catch { /* UI observers cannot break audio. */ }
  }

  private controlsFor(origin: LiveOrigin): ChannelControls {
    const key = channelKey(origin);
    let state = this.channelControls.get(key);
    if (!state) {
      state = { ...origin, volume: 127, expression: 127, modulation: 0, sustain: 0,
        sostenuto: false, unaCorda: false, pressure: 0, bend: 0, polyPressure: new Map() };
      this.channelControls.set(key, state);
    }
    return state;
  }

  private restoreControls(): void {
    const voices = this.graph!.voices;
    const at = Tone.immediate();
    for (const state of this.channelControls.values()) {
      voices.setVolume(state, state.volume, at);
      voices.setExpression(state, state.expression, at);
      voices.setModulation(state, state.modulation, at);
      voices.setSustain(state, state.sustain, at);
      voices.setSostenuto(state, state.sostenuto, at);
      voices.setUnaCorda(state, state.unaCorda, at);
      voices.setChannelPressure(state, state.pressure, at);
      voices.setPitchBend(state, state.bend, this.pitchBendRange, at);
    }
    for (const [source, pedals] of this.globalPedals) {
      for (const [pedal, value] of Object.entries(pedals)) {
        this.setGlobalPedal(source, pedal as StudioPedal, value);
      }
    }
    this.controlsNeedRestore = false;
  }

  private cancelOriginNotes(origin: LiveOrigin): void {
    for (const [key, queue] of this.heldNotes) {
      if (queue[0]?.inputId === origin.inputId && queue[0]?.channel === origin.channel) {
        queue.forEach((held) => { held.held = false; });
        this.heldNotes.delete(key);
      }
    }
  }

  private async loadSample(note: string, file: string, generation: number, signal?: AbortSignal): Promise<boolean> {
    const midi = Tone.Frequency(note).toMidi();
    if (this.bank.pitches().includes(midi)) return true;
    const existing = this.sampleInFlight.get(note);
    if (existing) return existing;
    const task = (async () => {
      try {
        let buffer = CORE_SET.has(note) ? await getCorePianoBuffer(note) : null;
        if (!buffer) {
          const sources = CORE_SET.has(note)
            ? [`/audio/salamander/core/${file}`, `${REMOTE_SALAMANDER_URL}${file}`]
            : [`${LOCAL_ANCHORS_URL}${file}`, `${REMOTE_SALAMANDER_URL}${file}`];
          let lastError: unknown;
          for (const url of sources) {
            try {
              const response = await fetch(url, { signal });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const bytes = await response.arrayBuffer();
              if (!isOgg(bytes)) throw new Error("la respuesta no es OGG");
              buffer = await Tone.getContext().rawContext.decodeAudioData(bytes);
              break;
            } catch (error) {
              if (signal?.aborted) throw error;
              lastError = error;
            }
          }
          if (!buffer) throw lastError ?? new Error(`No se encontró ${file}`);
        }
        if (this.disposed || generation !== this.generation || signal?.aborted) return false;
        const nextPcmBytes = buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
        if (this.residentDecodedPcmBytes() + nextPcmBytes > MAX_RESIDENT_PCM_BYTES) {
          throw new Error("El banco mono adicional excede el límite de memoria decodificada");
        }
        this.bank.add({ midi, buffer });
        this.failedSamples.delete(note);
        this.publish();
        return true;
      } catch (error) {
        if (!signal?.aborted && !this.disposed) {
          this.failedSamples.add(note);
          if (getInstrument(this.activeInstrumentId)?.source.kind === "salamander") {
            this.lastError = `No cargó ${note}: ${errorMessage(error)}`;
          }
          this.publish();
        }
        return false;
      }
    })();
    this.sampleInFlight.set(note, task);
    try { return await task; } finally { this.sampleInFlight.delete(note); }
  }

  private queueMissingSamples(): void {
    const loaded = new Set(this.bank.pitches());
    this.sampleQueue = Object.entries(salamanderSamples)
      .filter(([note]) => !CORE_SET.has(note) && !loaded.has(Tone.Frequency(note).toMidi()))
      .sort(([a], [b]) => {
        const distance = (note: string) => {
          const midi = Tone.Frequency(note).toMidi();
          const end = this.visibleRangeStart + VISIBLE_KEY_COUNT - 1;
          return midi < this.visibleRangeStart ? this.visibleRangeStart - midi : midi > end ? midi - end : 0;
        };
        return distance(a) - distance(b);
      });
  }

  private startBackgroundLoad(): Promise<void> {
    if (this.disposed || !this.graph || getInstrument(this.activeInstrumentId)?.source.kind !== "salamander"
      || (this.activeInstrumentId === "salamander-layered" && !this.needsMonoFallback())
      || (typeof document !== "undefined" && document.hidden)) return Promise.resolve();
    // An older mono worker may still be unwinding after we cancelled it to
    // prepare the layered bank. Start the newly prioritised queue afterwards.
    if (this.backgroundTask) return this.backgroundTask.then(() => this.startBackgroundLoad());
    if (this.sampleQueue.length === 0) return Promise.resolve();
    const controller = new AbortController();
    this.sampleAbort = controller;
    const generation = this.generation;
    const worker = async () => {
      while (!controller.signal.aborted && generation === this.generation) {
        const entry = this.sampleQueue.shift();
        if (!entry) break;
        const loaded = await this.loadSample(entry[0], entry[1], generation, controller.signal);
        if (controller.signal.aborted && !loaded) this.sampleQueue.unshift(entry);
      }
    };
    const task = Promise.all([worker(), worker(), worker()]).then(() => undefined).finally(() => {
      if (this.sampleAbort === controller) this.sampleAbort = null;
      if (this.backgroundTask === task) this.backgroundTask = null;
      if (!this.disposed && generation === this.generation) {
        this.phase = getInstrument(this.activeInstrumentId)?.source.kind === "waf"
          || this.missingVisibleCount() === 0
          ? "ready" : "partial";
        this.publish();
      }
    });
    this.backgroundTask = task;
    this.publish();
    return task;
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.instrumentAbort?.abort();
      this.instrumentRequest++;
      this.instrumentLoadingId = null;
      this.instrumentLoadingProgress = null;
      this.sampleAbort?.abort();
      this.generation++;
      this.releaseAllSounds("page-hidden");
      this.ownsAudio = false;
      releaseAudio(LIVE_STUDIO_AUDIO_OWNER);
      this.publish();
    } else {
      void this.retrySamples();
    }
  };

  private stopMetronome(): void {
    if (this.metronomeTimer) clearInterval(this.metronomeTimer);
    this.metronomeTimer = null;
    this.graph?.metronome.releaseOwner("metronome/live", Tone.immediate(), true);
  }

  private cancelIdleRelease(): void {
    if (this.idleReleaseTimer) clearTimeout(this.idleReleaseTimer);
    this.idleReleaseTimer = null;
  }

  private scheduleIdleRelease(): void {
    if (!this.ownsAudio || this.metronome.enabled || this.disposed ||
        this.projectPlayback?.scheduler.state === "playing") return;
    this.cancelIdleRelease();
    this.idleReleaseTimer = setTimeout(() => {
      this.idleReleaseTimer = null;
      if (this.metronome.enabled || this.projectPlayback?.scheduler.state === "playing" ||
          this.heldNotes.size > 0 || this.graph?.voices.snapshot().activeVoiceCount) return;
      // DrumKit does not expose its active source count. Keep ownership after a
      // pad hit until another tab requests it; the yield handler stops drums.
      if (this.graph?.drums.loadedCount() && this.drumWasPlayed) return;
      this.ownsAudio = false;
      releaseAudio(LIVE_STUDIO_AUDIO_OWNER);
      this.publish();
    }, Math.max(3000, this.releaseSeconds * 1000 + 200));
  }

  private drumWasPlayed = false;
}
