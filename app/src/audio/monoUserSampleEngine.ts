import * as Tone from "tone";
import type { ProjectInstrumentRef } from "../project/model";
import { OwnedVoiceRegistry, type OwnedVoiceHandle, type OwnedVoiceSnapshot } from "./ownedVoiceRegistry";
import type { DecodedUserSample } from "./userSampleAsset";
import { renderUserSampleRegion, type UserSampleVoiceOptions } from "./userSampleEngine";
import { retainUntilOfflineRender } from "./offlineGraphRetention";

type SampleRegion = NonNullable<ProjectInstrumentRef["sampleRegion"]>;

/** Project refs persist these settings; no generated waveform is used. */
export interface MonoSampleVoiceSettings {
  readonly mode: "mono";
  readonly retrigger: "always" | "legato";
  readonly glideMs: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  readonly saturation?: number;
  readonly subGainDb?: number;
}

interface MonoSource {
  readonly source: Tone.ToneBufferSource;
  readonly gain: Tone.Gain;
  readonly startedAt: number;
  readonly handles: Set<OwnedVoiceHandle>;
  targetRate: number;
  finished: boolean;
}

interface HeldNote {
  readonly handle: OwnedVoiceHandle;
  readonly note: number;
  readonly rate: number;
  readonly level: number;
  readonly voice: MonoSource;
}

const SAFETY_FADE_SECONDS = 0.005;
const RETRIGGER_FADE_SECONDS = 0.008;
const MAX_MONO_SOURCES = 16;
const MAX_HELD_NOTES = 32;

function validateSettings(settings: MonoSampleVoiceSettings, region: SampleRegion): void {
  if (settings.mode !== "mono" ||
      (settings.retrigger !== "always" && settings.retrigger !== "legato") ||
      !Number.isFinite(settings.glideMs) || settings.glideMs < 0 || settings.glideMs > 2_000 ||
      !Number.isFinite(settings.attackMs) || settings.attackMs < 0 || settings.attackMs > 5_000 ||
      !Number.isFinite(settings.releaseMs) || settings.releaseMs < 0 || settings.releaseMs > 5_000 ||
      (settings.saturation !== undefined && (!Number.isFinite(settings.saturation) ||
        settings.saturation < 0 || settings.saturation > 1)) ||
      (settings.subGainDb !== undefined && (!Number.isFinite(settings.subGainDb) ||
        settings.subGainDb < -36 || settings.subGainDb > 0)) ||
      (settings.retrigger === "legato" &&
        (region.playMode !== "gate" || region.loopMode !== "loop"))) {
    throw new RangeError("Configuración monofónica de muestra inválida");
  }
}

/** One physical sample source per track, plus short tails from retrigger. */
export class MonoUserSampleEngine {
  private readonly registry = new OwnedVoiceRegistry();
  private readonly sources = new Set<MonoSource>();
  private readonly notes = new Map<OwnedVoiceHandle, HeldNote>();
  private readonly held: HeldNote[] = [];
  private readonly regionBuffer: AudioBuffer;
  private readonly region: SampleRegion;
  private readonly settings: MonoSampleVoiceSettings;
  private readonly destination: Tone.ToneAudioNode;
  private readonly voiceBus: Tone.Gain;
  private readonly saturation: Tone.Distortion | null;
  private readonly subFilter: Tone.Filter | null;
  private readonly subGain: Tone.Gain | null;
  private readonly onVoiceEnd?: () => void;
  private current: MonoSource | null = null;
  private lastRate: number | null = null;
  private dropped = 0;
  private disposed = false;

  constructor(sample: DecodedUserSample, region: SampleRegion,
    settings: MonoSampleVoiceSettings, destination: Tone.ToneAudioNode,
    onVoiceEnd?: () => void) {
    validateSettings(settings, region);
    this.regionBuffer = renderUserSampleRegion(sample.buffer, region, Tone.getContext().rawContext);
    this.region = region;
    this.settings = settings;
    this.destination = destination;
    this.voiceBus = new Tone.Gain(1);
    this.saturation = (settings.saturation ?? 0) > 0
      ? new Tone.Distortion({ distortion: settings.saturation!, wet: 1, oversample: "4x" })
      : null;
    if (this.saturation) {
      this.voiceBus.connect(this.saturation);
      this.saturation.connect(destination);
    } else this.voiceBus.connect(destination);
    if (settings.subGainDb !== undefined) {
      this.subFilter = new Tone.Filter({ type: "lowpass", frequency: 90, Q: 0.7, rolloff: -24 });
      this.subGain = new Tone.Gain(10 ** (settings.subGainDb / 20));
      this.voiceBus.connect(this.subFilter);
      this.subFilter.connect(this.subGain);
      this.subGain.connect(destination);
    } else {
      this.subFilter = null;
      this.subGain = null;
    }
    this.onVoiceEnd = onVoiceEnd;
  }

  trigger(options: UserSampleVoiceOptions): OwnedVoiceHandle | null {
    if (this.disposed) return null;
    const { note, velocity, ownerId, epoch, audioTime } = options;
    if (!Number.isSafeInteger(note) || note < 0 || note > 127 ||
        !Number.isSafeInteger(velocity) || velocity < 1 || velocity > 127 ||
        !ownerId || !Number.isSafeInteger(epoch) || epoch < 0 ||
        !Number.isFinite(audioTime) || audioTime < 0 ||
        !Number.isFinite(options.gain ?? 1) || (options.gain ?? 1) < 0) {
      throw new RangeError("Ataque monofónico de muestra inválido");
    }
    const semitones = note - this.region.rootMidi + this.region.cents / 100;
    if (Math.abs(semitones) > 48 || this.registry.activeCount >= MAX_HELD_NOTES) {
      this.dropped++;
      return null;
    }
    const rate = 2 ** (semitones / 12);
    const level = Math.min(16, velocity / 127 * (options.gain ?? 1));
    if (this.settings.retrigger === "legato" && this.current && this.held.length) {
      const voice = this.current;
      const handle = this.registry.register({ ownerId, epoch,
        release: (at, fade) => this.releaseNote(handle, at, fade) });
      const held = { handle, note, rate, level, voice };
      this.notes.set(handle, held);
      this.held.push(held);
      voice.handles.add(handle);
      this.glide(voice, rate, level, audioTime);
      return handle;
    }
    if (this.sources.size >= MAX_MONO_SOURCES) { this.dropped++; return null; }
    const previousRate = this.current?.source.playbackRate.getValueAtTime(audioTime)
      ?? this.lastRate ?? rate;
    const startRate = this.settings.glideMs > 0 ? previousRate : rate;
    const gain = new Tone.Gain(level).connect(this.voiceBus);
    const source = new Tone.ToneBufferSource({
      url: this.regionBuffer,
      playbackRate: startRate,
      loop: this.region.loopMode === "loop",
      loopStart: 0,
      loopEnd: this.regionBuffer.duration,
      fadeIn: Math.max(SAFETY_FADE_SECONDS, this.settings.attackMs / 1000),
      fadeOut: Math.max(SAFETY_FADE_SECONDS, this.settings.releaseMs / 1000),
      curve: "linear",
      onended: () => this.finishVoice(voice, true),
    }).connect(gain);
    const voice: MonoSource = { source, gain, startedAt: audioTime, handles: new Set(),
      targetRate: rate, finished: false };
    const handle = this.registry.register({ ownerId, epoch,
      release: (at, fade) => this.releaseNote(handle, at, fade) });
    const held = { handle, note, rate, level, voice };
    this.notes.set(handle, held);
    this.held.push(held);
    voice.handles.add(handle);
    this.sources.add(voice);
    const previous = this.current;
    this.current = voice;
    this.lastRate = rate;
    try {
      source.start(audioTime, 0, undefined, 1);
      if (startRate !== rate) this.glide(voice, rate, level, audioTime);
      if (previous) {
        for (const oldHandle of [...previous.handles]) {
          this.registry.releaseHandle(oldHandle, audioTime, RETRIGGER_FADE_SECONDS);
        }
      }
    } catch (error) {
      this.finishVoice(voice);
      throw error;
    }
    return handle;
  }

  private glide(voice: MonoSource, rate: number, level: number, at: number): void {
    const pitch = voice.source.playbackRate;
    pitch.cancelAndHoldAtTime(at);
    const duration = this.settings.glideMs / 1000;
    if (duration > 0) pitch.exponentialRampToValueAtTime(rate, at + duration);
    else pitch.setValueAtTime(rate, at);
    voice.gain.gain.cancelAndHoldAtTime(at);
    voice.gain.gain.linearRampToValueAtTime(level, at + SAFETY_FADE_SECONDS);
    voice.targetRate = rate;
    this.lastRate = rate;
  }

  private stopVoice(voice: MonoSource, at: number, fadeSeconds: number): void {
    if (voice.finished) return;
    if (at < voice.startedAt - 0.001) { this.finishVoice(voice); return; }
    voice.source.fadeOut = Math.max(SAFETY_FADE_SECONDS, fadeSeconds);
    voice.source.stop(Math.max(at, voice.startedAt));
  }

  private releaseNote(handle: OwnedVoiceHandle, at: number, fadeSeconds: number): void {
    const note = this.notes.get(handle);
    if (!note) return;
    const index = this.held.findIndex((item) => item.handle === handle);
    if (this.settings.retrigger === "legato" && note.voice === this.current &&
        this.held.some((item) => item.handle !== handle)) {
      const next = [...this.held].reverse().find((item) => item.handle !== handle)!;
      this.glide(note.voice, next.rate, next.level, at);
      if (index >= 0) this.held.splice(index, 1);
      this.registry.markReleasing(handle);
      this.finishHandle(handle);
      return;
    }
    this.stopVoice(note.voice, at, fadeSeconds);
    if (!note.voice.finished && index >= 0) this.held.splice(index, 1);
  }

  private finishHandle(handle: OwnedVoiceHandle): void {
    const note = this.notes.get(handle);
    if (!note) return;
    this.notes.delete(handle);
    note.voice.handles.delete(handle);
    const index = this.held.findIndex((item) => item.handle === handle);
    if (index >= 0) this.held.splice(index, 1);
    this.registry.finish(handle);
    this.onVoiceEnd?.();
  }

  private finishVoice(voice: MonoSource, naturallyEnded = false): void {
    if (voice.finished) return;
    voice.finished = true;
    if (this.current === voice) this.current = null;
    for (const handle of [...voice.handles]) this.finishHandle(handle);
    this.sources.delete(voice);
    const dispose = (): void => { voice.source.dispose(); voice.gain.dispose(); };
    if (!naturallyEnded || !retainUntilOfflineRender(voice.source.context, dispose)) dispose();
  }

  /** One-shot ignores normal Note Off but obeys Stop/Seek and retrigger. */
  noteOffHandle(handle: OwnedVoiceHandle, audioTime: number): boolean {
    if (this.region.playMode === "oneShot") {
      const index = this.held.findIndex((item) => item.handle === handle);
      if (index >= 0) this.held.splice(index, 1);
      return this.registry.markReleasing(handle);
    }
    return this.registry.releaseHandle(handle, audioTime,
      Math.max(SAFETY_FADE_SECONDS, this.settings.releaseMs / 1000));
  }

  releaseHandle(handle: OwnedVoiceHandle, audioTime: number): boolean {
    return this.registry.releaseHandle(handle, audioTime, RETRIGGER_FADE_SECONDS);
  }

  releaseOwner(ownerId: string, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseOwner(ownerId, audioTime, RETRIGGER_FADE_SECONDS, includeDescendants);
  }

  releaseEpoch(ownerId: string, epoch: number, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseEpoch(ownerId, epoch, audioTime,
      RETRIGGER_FADE_SECONDS, includeDescendants);
  }

  snapshot(): OwnedVoiceSnapshot & { readonly dropped: number; readonly activeSources: number;
    readonly heldNotes: number; readonly targetPlaybackRate: number | null;
    readonly saturation: number; readonly subGainDb: number | null } {
    return { ...this.registry.snapshot(), dropped: this.dropped,
      activeSources: this.sources.size, heldNotes: this.held.length,
      targetPlaybackRate: this.current?.targetRate ?? null,
      saturation: this.settings.saturation ?? 0,
      subGainDb: this.settings.subGainDb ?? null };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of [...this.sources]) this.finishVoice(voice);
    this.held.length = 0;
    this.voiceBus.dispose();
    this.saturation?.dispose();
    this.subFilter?.dispose();
    this.subGain?.dispose();
  }
}
