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
  readonly gain: Tone.Gain;
}

/** Original-rate, beat-anchored playback. Seek resumes at the source's verified frame offset. */
export class AudioClipEngine {
  private readonly clips = new Map<string, Extract<ProjectClip, { kind: "audio" }>>();
  private readonly prepared = new Map<string, PreparedClip>();
  private readonly registry = new OwnedVoiceRegistry();
  private readonly voices = new Map<OwnedVoiceHandle, ClipVoice>();
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
    const level = Math.min(16, 10 ** (Math.max(-96, Math.min(24, event.gainDb)) / 20));
    const envelope = { envelopeStartFrame: event.envelopeStartFrame ?? event.sourceStartFrame,
      envelopeEndFrame: event.envelopeEndFrame ?? event.sourceEndFrame,
      fadeInFrames: event.fadeInFrames, fadeOutFrames: event.fadeOutFrames,
      crossfades: event.crossfades ?? [] };
    const safetyFadeIn = clipEnvelopeGainAt(envelope, sourceFrame, songTimeUs) > 1e-8
      ? Math.min(0.002, remaining / 2) : 0;
    let handle: OwnedVoiceHandle | null = null;
    let finished = false;
    const gain = new Tone.Gain(0).connect(this.destination);
    const source = new Tone.ToneBufferSource({ url: prepared.buffer,
      fadeIn: safetyFadeIn, fadeOut: 0,
      curve: "linear", onended: () => finish(true) }).connect(gain);
    const finish = (naturallyEnded: boolean): void => {
      if (finished) return;
      finished = true;
      if (handle) {
        this.voices.delete(handle);
        this.registry.finish(handle);
      }
      const dispose = (): void => { source.dispose(); gain.dispose(); };
      if (!naturallyEnded || !retainUntilOfflineRender(source.context, dispose)) dispose();
      this.onVoiceEnd?.();
    };
    handle = this.registry.register({ ownerId: event.ownerId, epoch: event.epoch,
      release: (audioTime, fadeSeconds) => {
        if (audioTime < at - 0.001) { finish(false); return; }
        source.fadeOut = Math.max(0.005, fadeSeconds);
        source.stop(Math.max(at, audioTime));
      } });
    this.voices.set(handle, { source, gain });
    try {
      source.start(at, sourceFrame / rate, undefined, 1);
      scheduleClipEnvelope(gain.gain, envelope, at, at + remaining,
        sourceFrame, rate, songTimeUs, level);
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
      voice.gain.dispose();
      this.registry.finish(handle);
    }
    this.voices.clear();
    this.prepared.clear();
  }
}
