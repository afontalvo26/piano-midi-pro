import * as Tone from "tone";
import type { ProjectAssetRef, ProjectAudioCrossfade, ProjectClip } from "../project/model";
import type { ScheduledAudioClip } from "../sequencer/timelineEvents";
import { OwnedVoiceRegistry, type OwnedVoiceHandle, type OwnedVoiceSnapshot } from "./ownedVoiceRegistry";
import { UserSampleCache, type UserSampleReader } from "./userSampleAsset";
import { clipEnvelopeGainAt, scheduleClipEnvelope } from "./audioClipEnvelope";
import { retainUntilOfflineRender } from "./offlineGraphRetention";

const AUDIO_CLIP_LIMITS = { maxEncodedBytes: 64 * 1024 * 1024,
  maxDecodedBytes: 96 * 1024 * 1024, maxDurationSeconds: 180 } as const;
const MAX_CLIP_SOURCES = 24;

interface PreparedClip {
  readonly clip: Extract<ProjectClip, { kind: "audio" }>;
  readonly buffer: AudioBuffer;
}

interface ClipVoice {
  readonly source: Tone.ToneBufferSource;
  readonly clipId: string;
  readonly envelopeGain: Tone.Gain;
  readonly automationGain: Tone.Gain;
}

interface ClipGainCommand {
  readonly kind: "set" | "ramp";
  readonly valueDb: number;
  readonly audioTime: number;
}

/** Original-rate, beat-anchored playback. Seek resumes at the source's verified frame offset. */
export class AudioClipEngine {
  private readonly clips = new Map<string, Extract<ProjectClip, { kind: "audio" }>>();
  private readonly prepared = new Map<string, PreparedClip>();
  private readonly registry = new OwnedVoiceRegistry();
  private readonly voices = new Map<OwnedVoiceHandle, ClipVoice>();
  private readonly gainCommands = new Map<string, ClipGainCommand[]>();
  private readonly assets: readonly ProjectAssetRef[];
  private readonly crossfades: readonly ProjectAudioCrossfade[];
  private readonly reader?: UserSampleReader;
  private readonly cache: UserSampleCache;
  private readonly destination: Tone.ToneAudioNode;
  private readonly onVoiceEnd?: () => void;
  private errorValue: string | null = null;
  private disposed = false;
  private skipped = 0;

  constructor(trackId: string, clips: readonly ProjectClip[], assets: readonly ProjectAssetRef[],
    destination: Tone.ToneAudioNode, cache: UserSampleCache,
    reader?: UserSampleReader, onVoiceEnd?: () => void,
    crossfades: readonly ProjectAudioCrossfade[] = []) {
    for (const clip of clips) {
      if (clip.kind === "audio" && clip.trackId === trackId) this.clips.set(clip.id, clip);
    }
    this.assets = assets;
    this.crossfades = crossfades;
    this.reader = reader;
    this.cache = cache;
    this.destination = destination;
    this.onVoiceEnd = onVoiceEnd;
  }

  async prepare(): Promise<void> {
    if (this.clips.size === 0) return;
    if (!this.reader) throw new Error("Pista de audio sin lector de activos");
    try {
      await Promise.all([...this.clips.values()].map(async (clip) => {
        const ref = this.assets.find((asset) => asset.id === clip.sourceId);
        if (!ref || (ref.sourceKind !== "user" && ref.sourceKind !== "recorded")) {
          throw new Error(`Clip ${clip.id}: activo de audio propio ausente`);
        }
        const decoded = await this.cache.load(ref, this.reader!, Tone.getContext().rawContext,
          AUDIO_CLIP_LIMITS);
        if (this.disposed) return;
        if (clip.sourceEndFrame > decoded.buffer.length) {
          throw new Error(`Clip ${clip.id}: frames fuera de la grabación`);
        }
        this.prepared.set(clip.id, { clip, buffer: decoded.buffer });
      }));
      this.errorValue = null;
    } catch (error) {
      this.errorValue = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  get error(): string | null { return this.errorValue; }
  get hasClips(): boolean { return this.clips.size > 0; }

  private clipGainDb(clipId: string): number {
    const clip = this.clips.get(clipId);
    if (!clip) throw new RangeError(`Clip inexistente: ${clipId}`);
    return clip.gainDb;
  }

  private static linearGain(db: number): number {
    return 10 ** (Math.max(-120, Math.min(24, db)) / 20);
  }

  private commands(clipId: string): ClipGainCommand[] {
    let commands = this.gainCommands.get(clipId);
    if (!commands) { commands = []; this.gainCommands.set(clipId, commands); }
    return commands;
  }

  private rememberGainCommand(clipId: string, command: ClipGainCommand): void {
    if (!Number.isFinite(command.valueDb) || command.valueDb < -120 || command.valueDb > 24 ||
        !Number.isFinite(command.audioTime) || command.audioTime < 0) {
      throw new RangeError("Automatización de gain de clip inválida");
    }
    const commands = this.commands(clipId);
    commands.push(command);
    commands.sort((left, right) => left.audioTime - right.audioTime ||
      (left.kind === "set" ? -1 : 1));
    if (commands.length > 4096) throw new RangeError("Demasiada automatización de gain por clip");
  }

  private gainDbAt(clipId: string, audioTime: number): number {
    const commands = this.gainCommands.get(clipId) ?? [];
    let value = this.clipGainDb(clipId);
    let previousTime = 0;
    for (const command of commands) {
      if (command.audioTime > audioTime) {
        if (command.kind === "ramp" && command.audioTime > previousTime) {
          const fraction = Math.max(0, Math.min(1,
            (audioTime - previousTime) / (command.audioTime - previousTime)));
          return value + (command.valueDb - value) * fraction;
        }
        break;
      }
      value = command.valueDb;
      previousTime = command.audioTime;
    }
    return value;
  }

  private applyGainPlan(clipId: string, gain: Tone.Gain, startAt: number): void {
    const commands = this.gainCommands.get(clipId) ?? [];
    gain.gain.setValueAtTime(AudioClipEngine.linearGain(this.gainDbAt(clipId, startAt)), startAt);
    for (const command of commands) {
      if (command.audioTime <= startAt) continue;
      const linear = AudioClipEngine.linearGain(command.valueDb);
      if (command.kind === "ramp") gain.gain.exponentialRampToValueAtTime(linear, command.audioTime);
      else gain.gain.setValueAtTime(linear, command.audioTime);
    }
  }

  setClipGainAtTime(clipId: string, valueDb: number, audioTime: number): void {
    this.rememberGainCommand(clipId, { kind: "set", valueDb, audioTime });
    const linear = AudioClipEngine.linearGain(valueDb);
    for (const voice of this.voices.values()) if (voice.clipId === clipId) {
      voice.automationGain.gain.setValueAtTime(linear, audioTime);
    }
  }

  rampClipGainToValueAtTime(clipId: string, valueDb: number, audioTime: number): void {
    this.rememberGainCommand(clipId, { kind: "ramp", valueDb, audioTime });
    const linear = AudioClipEngine.linearGain(valueDb);
    for (const voice of this.voices.values()) if (voice.clipId === clipId) {
      voice.automationGain.gain.exponentialRampToValueAtTime(linear, audioTime);
    }
  }

  cancelClipGainAutomation(clipId: string, audioTime: number): void {
    const commands = this.gainCommands.get(clipId) ?? [];
    this.gainCommands.set(clipId, commands.filter((command) => command.audioTime < audioTime));
    for (const voice of this.voices.values()) if (voice.clipId === clipId) {
      voice.automationGain.gain.cancelAndHoldAtTime(audioTime);
    }
  }

  play(event: ScheduledAudioClip): OwnedVoiceHandle | null {
    if (this.disposed || this.errorValue || this.voices.size >= MAX_CLIP_SOURCES) {
      this.skipped++;
      return null;
    }
    const prepared = event.clipId ? this.prepared.get(event.clipId) : null;
    const approved = prepared?.clip;
    const expectedFades = approved ? this.crossfades.filter((fade) =>
      fade.outgoingClipId === approved.id || fade.incomingClipId === approved.id) : [];
    const actualFades = event.crossfades ?? [];
    if (!approved || approved.sourceId !== event.assetId ||
        (approved.timeMode ?? "beat") !== (event.timeMode ?? "beat") ||
        approved.absoluteStartUs !== event.absoluteStartUs ||
        approved.absoluteEndUs !== event.absoluteEndUs ||
        (approved.envelopeStartFrame ?? approved.sourceStartFrame) !==
          (event.envelopeStartFrame ?? event.sourceStartFrame) ||
        (approved.envelopeEndFrame ?? approved.sourceEndFrame) !==
          (event.envelopeEndFrame ?? event.sourceEndFrame) ||
        expectedFades.length !== actualFades.length ||
        expectedFades.some((fade) => !actualFades.some((actual) =>
          actual.id === fade.id && actual.curve === fade.curve &&
          actual.role === (fade.outgoingClipId === approved.id ? "out" : "in"))) ||
        prepared.clip.sourceStartFrame !== event.sourceStartFrame ||
        prepared.clip.sourceEndFrame !== event.sourceEndFrame ||
        prepared.clip.fadeInFrames !== event.fadeInFrames ||
        prepared.clip.fadeOutFrames !== event.fadeOutFrames) {
      this.skipped++;
      this.errorValue = `Clip ${event.clipId ?? "?"}: evento o muestra no coincide con proyecto`;
      return null;
    }
    const rate = prepared.buffer.sampleRate;
    const offline = "startRendering" in Tone.getContext().rawContext;
    const at = offline ? event.audioTime : Math.max(event.audioTime, Tone.immediate() + 0.002);
    const elapsed = event.elapsedSeconds + at - event.audioTime;
    const songTimeUs = (event.songTimeUs ?? 0) + (at - event.audioTime) * 1_000_000;
    const sourceFrame = event.sourceStartFrame + Math.round(elapsed * rate);
    const remaining = Math.min((event.sourceEndFrame - sourceFrame) / rate,
      event.endAudioTime - at);
    if (sourceFrame >= event.sourceEndFrame || remaining <= 0) {
      this.skipped++;
      return null;
    }
    if (event.crossfades?.length && event.songTimeUs === undefined) {
      this.skipped++;
      this.errorValue = `Clip ${event.clipId ?? "?"}: tiempo de crossfade ausente`;
      return null;
    }
    const envelope = { envelopeStartFrame: event.envelopeStartFrame ?? event.sourceStartFrame,
      envelopeEndFrame: event.envelopeEndFrame ?? event.sourceEndFrame,
      fadeInFrames: event.fadeInFrames, fadeOutFrames: event.fadeOutFrames,
      crossfades: event.crossfades ?? [] };
    const safetyFadeIn = clipEnvelopeGainAt(envelope, sourceFrame, songTimeUs) > 1e-8
      ? Math.min(0.002, remaining / 2) : 0;
    let handle: OwnedVoiceHandle | null = null;
    let finished = false;
    const envelopeGain = new Tone.Gain(0);
    const automationGain = new Tone.Gain(AudioClipEngine.linearGain(event.gainDb)).connect(this.destination);
    envelopeGain.connect(automationGain);
    const source = new Tone.ToneBufferSource({ url: prepared.buffer,
      fadeIn: safetyFadeIn, fadeOut: 0,
      curve: "linear", onended: () => finish(true) }).connect(envelopeGain);
    const finish = (naturallyEnded: boolean): void => {
      if (finished) return;
      finished = true;
      if (handle) {
        this.voices.delete(handle);
        this.registry.finish(handle);
      }
      const dispose = (): void => {
        source.dispose(); envelopeGain.dispose(); automationGain.dispose();
      };
      if (!naturallyEnded || !retainUntilOfflineRender(source.context, dispose)) dispose();
      this.onVoiceEnd?.();
    };
    handle = this.registry.register({ ownerId: event.ownerId, epoch: event.epoch,
      release: (audioTime, fadeSeconds) => {
        if (audioTime < at - 0.001) { finish(false); return; }
        source.fadeOut = Math.max(0.005, fadeSeconds);
        source.stop(Math.max(at, audioTime));
      } });
    this.voices.set(handle, { source, clipId: approved.id, envelopeGain, automationGain });
    try {
      this.applyGainPlan(approved.id, automationGain, at);
      source.start(at, sourceFrame / rate, undefined, 1);
      scheduleClipEnvelope(envelopeGain.gain, envelope, at, at + remaining,
        sourceFrame, rate, songTimeUs, 1);
      source.stop(at + remaining);
    } catch (error) { finish(false); throw error; }
    return handle;
  }

  releaseOwner(ownerId: string, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseOwner(ownerId, audioTime, 0.008, includeDescendants);
  }

  releaseEpoch(ownerId: string, epoch: number, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseEpoch(ownerId, epoch, audioTime, 0.008, includeDescendants);
  }

  snapshot(): OwnedVoiceSnapshot & { readonly skipped: number } {
    return { ...this.registry.snapshot(), skipped: this.skipped };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.registry.panic(Tone.immediate(), 0.008);
    for (const [handle, voice] of this.voices) {
      voice.source.dispose();
      voice.envelopeGain.dispose();
      voice.automationGain.dispose();
      this.registry.finish(handle);
    }
    this.voices.clear();
    this.gainCommands.clear();
    this.prepared.clear();
  }
}
