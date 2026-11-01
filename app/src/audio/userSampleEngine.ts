import * as Tone from "tone";
import type { ProjectInstrumentRef } from "../project/model";
import { OwnedVoiceRegistry, type OwnedVoiceHandle, type OwnedVoiceSnapshot } from "./ownedVoiceRegistry";
import type { DecodedUserSample } from "./userSampleAsset";
import { retainUntilOfflineRender } from "./offlineGraphRetention";

const MAX_ACTIVE_VOICES = 24;
const MAX_ALLOCATED_VOICES = 48;
const RELEASE_FADE_SECONDS = 0.012;
type ProjectSampleRegion = NonNullable<ProjectInstrumentRef["sampleRegion"]>;
type SampleVoiceEnvelope = Pick<NonNullable<ProjectInstrumentRef["sampleVoice"]>,
  "attackMs" | "releaseMs">;

export interface UserSampleVoiceOptions {
  readonly note: number;
  readonly velocity: number;
  readonly ownerId: string;
  readonly epoch: number;
  readonly audioTime: number;
  readonly gain?: number;
}

function assertRegion(region: ProjectSampleRegion, buffer: AudioBuffer): void {
  const values = [region.startFrame, region.endFrame, region.fadeInFrames,
    region.fadeOutFrames, region.rootMidi, region.cents];
  if (values.some((value) => !Number.isSafeInteger(value)) ||
      region.startFrame < 0 || region.endFrame <= region.startFrame ||
      region.endFrame > buffer.length || region.fadeInFrames < 0 ||
      region.fadeOutFrames < 0 ||
      region.fadeInFrames + region.fadeOutFrames > region.endFrame - region.startFrame ||
      region.rootMidi < 0 || region.rootMidi > 127 || region.cents < -1200 ||
      region.cents > 1200 || typeof region.reverse !== "boolean" ||
      (region.loopMode !== "none" && region.loopMode !== "loop") ||
      (region.playMode !== "oneShot" && region.playMode !== "gate") ||
      (region.loopMode === "loop" && region.playMode !== "gate")) {
    throw new RangeError("Región de muestra inválida o fuera del audio original");
  }
}

export function defaultUserSampleRegion(buffer: AudioBuffer): ProjectSampleRegion {
  return { startFrame: 0, endFrame: buffer.length, fadeInFrames: 0,
    fadeOutFrames: 0, rootMidi: 60, cents: 0, reverse: false,
    loopMode: "none", playMode: "oneShot" };
}

/** Copy only the selected frames, so the immutable original is never modified. */
export function renderUserSampleRegion(buffer: AudioBuffer, region: ProjectSampleRegion,
  context: BaseAudioContext): AudioBuffer {
  assertRegion(region, buffer);
  const frames = region.endFrame - region.startFrame;
  const rendered = context.createBuffer(buffer.numberOfChannels, frames, buffer.sampleRate);
  // Tiny safety tapers prevent a hard waveform discontinuity even when the
  // user leaves editable fades at zero. Loop ends therefore stay click-free.
  const safety = Math.min(64, Math.floor(frames / 2));
  const fadeIn = Math.max(region.fadeInFrames, safety);
  const fadeOut = Math.max(region.fadeOutFrames, safety);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const output = rendered.getChannelData(channel);
    for (let frame = 0; frame < frames; frame++) {
      const sourceFrame = region.reverse ? region.endFrame - 1 - frame : region.startFrame + frame;
      const inGain = fadeIn > 0 ? Math.min(1, (frame + 1) / fadeIn) : 1;
      const outGain = fadeOut > 0 ? Math.min(1, (frames - frame) / fadeOut) : 1;
      output[frame] = source[sourceFrame]! * Math.min(inGain, outGain);
    }
  }
  return rendered;
}

/** A track-scoped sampler: project Stop never releases the physical live piano. */
export class UserSampleEngine {
  private readonly registry = new OwnedVoiceRegistry();
  private readonly voices = new Map<OwnedVoiceHandle, Tone.ToneBufferSource>();
  private readonly regionBuffer: AudioBuffer;
  private readonly region: ProjectSampleRegion;
  private readonly destination: Tone.ToneAudioNode;
  private readonly onVoiceEnd?: () => void;
  private readonly envelope?: SampleVoiceEnvelope;
  private disposed = false;
  private dropped = 0;

  constructor(sample: DecodedUserSample, region: ProjectSampleRegion,
    destination: Tone.ToneAudioNode,
    onVoiceEnd?: () => void, envelope?: SampleVoiceEnvelope) {
    if (envelope && (!Number.isFinite(envelope.attackMs) || envelope.attackMs < 0 ||
        envelope.attackMs > 5_000 || !Number.isFinite(envelope.releaseMs) ||
        envelope.releaseMs < 0 || envelope.releaseMs > 5_000)) {
      throw new RangeError("Envolvente de muestra inválida");
    }
    this.destination = destination;
    this.onVoiceEnd = onVoiceEnd;
    this.envelope = envelope;
    this.region = region;
    this.regionBuffer = renderUserSampleRegion(sample.buffer, region, Tone.getContext().rawContext);
  }

  trigger(options: UserSampleVoiceOptions): OwnedVoiceHandle | null {
    if (this.disposed) return null;
    const { note, velocity, ownerId, epoch, audioTime } = options;
    if (!Number.isSafeInteger(note) || note < 0 || note > 127 ||
        !Number.isSafeInteger(velocity) || velocity < 1 || velocity > 127 ||
        !ownerId || !Number.isSafeInteger(epoch) || epoch < 0 ||
        !Number.isFinite(audioTime) || audioTime < 0 ||
        !Number.isFinite(options.gain ?? 1) || (options.gain ?? 1) < 0) {
      throw new RangeError("Ataque de muestra inválido");
    }
    if (this.registry.activeCount >= MAX_ACTIVE_VOICES) {
      const victim = [...this.voices.keys()].find((handle) => !this.registry.isReleasing(handle));
      if (victim) this.registry.releaseHandle(victim, audioTime, RELEASE_FADE_SECONDS);
    }
    if (this.voices.size >= MAX_ALLOCATED_VOICES) { this.dropped++; return null; }
    const semitones = note - this.region.rootMidi + this.region.cents / 100;
    if (Math.abs(semitones) > 48) { this.dropped++; return null; }
    const rate = 2 ** (semitones / 12);
    const level = Math.min(16, velocity / 127 * (options.gain ?? 1));
    let handle: OwnedVoiceHandle | null = null;
    let finished = false;
    const source = new Tone.ToneBufferSource({
      url: this.regionBuffer,
      playbackRate: rate,
      loop: this.region.loopMode === "loop",
      loopStart: 0,
      loopEnd: this.regionBuffer.duration,
      fadeIn: Math.max(0.005, (this.envelope?.attackMs ?? 0) / 1000),
      fadeOut: RELEASE_FADE_SECONDS,
      curve: "linear",
      onended: () => finish(true),
    }).connect(this.destination);
    const finish = (naturallyEnded = false): void => {
      if (finished) return;
      finished = true;
      if (handle) {
        this.voices.delete(handle);
        this.registry.finish(handle);
      }
      const dispose = (): void => { source.dispose(); };
      if (!naturallyEnded || !retainUntilOfflineRender(source.context, dispose)) dispose();
      this.onVoiceEnd?.();
    };
    handle = this.registry.register({ ownerId, epoch, release: (at, fade) => {
      if (at < audioTime - 0.001) { finish(); return; }
      source.fadeOut = Math.max(0.005, fade);
      source.stop(Math.max(at, audioTime));
    } });
    this.voices.set(handle, source);
    try { source.start(audioTime, 0, undefined, level); }
    catch (error) { finish(); throw error; }
    return handle;
  }

  /** A one-shot ignores musical Note Off but still obeys Stop/Seek/panic. */
  noteOffHandle(handle: OwnedVoiceHandle, audioTime: number): boolean {
    if (this.region.playMode === "oneShot") return this.registry.markReleasing(handle);
    return this.registry.releaseHandle(handle, audioTime,
      Math.max(0.005, (this.envelope?.releaseMs ?? 12) / 1000));
  }

  releaseHandle(handle: OwnedVoiceHandle, audioTime: number): boolean {
    return this.registry.releaseHandle(handle, audioTime, RELEASE_FADE_SECONDS);
  }

  releaseOwner(ownerId: string, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseOwner(ownerId, audioTime, RELEASE_FADE_SECONDS, includeDescendants);
  }

  releaseEpoch(ownerId: string, epoch: number, audioTime: number, includeDescendants = false): number {
    return this.registry.releaseEpoch(ownerId, epoch, audioTime, RELEASE_FADE_SECONDS, includeDescendants);
  }

  snapshot(): OwnedVoiceSnapshot & { readonly dropped: number } {
    return { ...this.registry.snapshot(), dropped: this.dropped };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.registry.panic(Tone.immediate(), RELEASE_FADE_SECONDS);
    for (const [handle, source] of this.voices) {
      source.dispose();
      this.registry.finish(handle);
    }
    this.voices.clear();
  }
}
