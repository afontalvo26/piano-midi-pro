/**
 * A real AudioBuffer per attack. Unlike Tone.Sampler, this owns the source,
 * gain and pitch of each live voice, so same-pitch repetitions cannot release
 * one another. It does not fetch or invent samples/layers.
 */
import * as Tone from "tone";
import type {
  LiveVoiceAttack,
  LiveVoiceFactory,
  LiveVoiceHandle,
  LiveVoiceInitialState,
} from "./liveVoiceController";
import { retainUntilOfflineRender } from "./offlineGraphRetention";

export interface DecodedPianoSample {
  midi: number;
  /** Exact recorded root pitch; WAF may include fine/coarse tuning in cents. */
  pitchMidi?: number;
  buffer: AudioBuffer;
  /** Optional playable key range supplied by a sampled instrument bank. */
  keyRangeLow?: number;
  keyRangeHigh?: number;
  /** Loop points in source seconds, used only by sustained sampled instruments. */
  loopStartSec?: number;
  loopEndSec?: number;
  /** A WAF percussive envelope can decay even while its sample is looped. */
  naturalStopSeconds?: number;
  /** A real recorded velocity layer, when the optional Salamander bank is ready. */
  velocityLayer?: number;
  /** Centre of the original SFZ velocity region, used to select a sparse layer. */
  velocityCenter?: number;
  /** Compensates intrinsic recording level before the caller's velocity curve. */
  gainCompensation?: number;
}

export interface SampleCoverage {
  playable: number[];
  missing: number[];
}

export class DecodedPianoSampleBank {
  private readonly samples = new Map<string, DecodedPianoSample>();

  add(sample: DecodedPianoSample): void {
    if (!Number.isInteger(sample.midi) || sample.midi < 0 || sample.midi > 127) {
      throw new RangeError("sample.midi must be MIDI 0..127");
    }
    if (!sample.buffer || !Number.isFinite(sample.buffer.duration) || sample.buffer.duration <= 0
      || sample.buffer.length <= 0 || sample.buffer.sampleRate <= 0
      || typeof sample.buffer.getChannelData !== "function") {
      throw new RangeError("sample.buffer must contain decoded audio");
    }
    if (sample.pitchMidi !== undefined && (!Number.isFinite(sample.pitchMidi)
      || sample.pitchMidi < -24 || sample.pitchMidi > 151)) {
      throw new RangeError("sample.pitchMidi must be a finite pitched root");
    }
    if (sample.keyRangeLow !== undefined && sample.keyRangeHigh !== undefined &&
        (sample.keyRangeLow < 0 || sample.keyRangeHigh > 127 || sample.keyRangeLow > sample.keyRangeHigh)) {
      throw new RangeError("sample key range must stay within MIDI 0..127");
    }
    if (sample.loopStartSec !== undefined && sample.loopEndSec !== undefined &&
        (sample.loopStartSec < 0 || sample.loopEndSec <= sample.loopStartSec ||
         sample.loopEndSec > sample.buffer.duration)) {
      throw new RangeError("sample loop points must be within its buffer");
    }
    if (sample.velocityLayer !== undefined && (!Number.isInteger(sample.velocityLayer)
      || sample.velocityLayer < 1 || sample.velocityLayer > 16
      || !Number.isFinite(sample.velocityCenter) || sample.velocityCenter! < 1 || sample.velocityCenter! > 127
      || !Number.isFinite(sample.gainCompensation) || sample.gainCompensation! <= 0
      || sample.gainCompensation! > 32)) {
      throw new RangeError("velocity layer needs a MIDI centre and bounded gain compensation");
    }
    // A sampled bank can split one recorded pitch across different key
    // ranges. Keep those zones distinct; an exact duplicate range replaces
    // an older decode of the same anchor on retry.
    const key = `${sample.midi}:${sample.keyRangeLow ?? 0}:${sample.keyRangeHigh ?? 127}:${sample.velocityLayer ?? 0}`;
    this.samples.set(key, sample);
  }

  get size(): number {
    return this.samples.size;
  }

  /** Float32 PCM payload held by distinct buffers; excludes browser/node overhead. */
  get decodedPcmBytes(): number {
    const unique = new Set([...this.samples.values()].map((sample) => sample.buffer));
    let bytes = 0;
    for (const buffer of unique) {
      bytes += buffer.length * (buffer.numberOfChannels || 0) * Float32Array.BYTES_PER_ELEMENT;
    }
    return bytes;
  }

  pitches(): number[] {
    return [...new Set([...this.samples.values()].map((sample) => sample.midi))].sort((a, b) => a - b);
  }

  coverage(firstMidi: number, lastMidi: number, maxShiftSemitones = 6): SampleCoverage {
    if (!Number.isInteger(firstMidi) || !Number.isInteger(lastMidi)
      || firstMidi < 0 || lastMidi > 127 || firstMidi > lastMidi) {
      throw new RangeError("coverage needs an ascending MIDI range within 0..127");
    }
    const result: SampleCoverage = { playable: [], missing: [] };
    for (let midi = firstMidi; midi <= lastMidi; midi++) {
      (this.closest(midi, maxShiftSemitones) ? result.playable : result.missing).push(midi);
    }
    return result;
  }

  closest(midi: number, maxShiftSemitones: number, rawVelocity?: number): DecodedPianoSample | null {
    if (!Number.isFinite(maxShiftSemitones) || maxShiftSemitones < 0) {
      throw new RangeError("maxShiftSemitones must be non-negative");
    }
    let bestBase: DecodedPianoSample | null = null;
    let baseDistance = Infinity;
    let bestLayer: DecodedPianoSample | null = null;
    let layerDistance = Infinity;
    let velocityDistance = Infinity;
    for (const sample of this.samples.values()) {
      const sampleMidi = sample.midi;
      if (midi < (sample.keyRangeLow ?? 0) || midi > (sample.keyRangeHigh ?? 127)) continue;
      const next = Math.abs(midi - sampleMidi);
      if (sample.velocityLayer !== undefined) {
        const nextVelocityDistance = Math.abs((rawVelocity ?? 127) - sample.velocityCenter!);
        if (next < layerDistance || (next === layerDistance && nextVelocityDistance < velocityDistance)
          || (next === layerDistance && nextVelocityDistance === velocityDistance
            && bestLayer !== null && sampleMidi > bestLayer.midi)) {
          bestLayer = sample;
          layerDistance = next;
          velocityDistance = nextVelocityDistance;
        }
      } else if (next < baseDistance || (next === baseDistance && bestBase !== null && sampleMidi > bestBase.midi)) {
        bestBase = sample;
        baseDistance = next;
      }
    }
    if (rawVelocity !== undefined && layerDistance <= maxShiftSemitones) return bestLayer;
    if (baseDistance <= maxShiftSemitones) return bestBase;
    return layerDistance <= maxShiftSemitones ? bestLayer : null;
  }
}

export interface ToneSampleVoiceOptions {
  /** Bounded repitch range; a missing sample remains observable as a miss. */
  maxShiftSemitones?: number;
  attackSeconds?: number;
  /** Low-pass approximation, not a true una corda recording. */
  softPedalCutoffHz?: number;
  /** Model hammer brightness from raw MIDI velocity for the one-layer Salamander bank only. */
  velocityColor?: boolean;
  /** Existing one-layer bank for pitches outside an optional layered range. */
  fallbackBank?: DecodedPianoSampleBank;
  primaryRange?: { minMidi: number; maxMidi: number };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampVoiceGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(16, value)) : 0;
}

// Tone.Vibrato changes pitch through a short modulated delay. At 5 Hz with a
// 5 ms delay, depth 0.18 is approximately a 25-cent peak excursion. It is an
// approximation, not a second recording or a retuned MIDI note.
const MAX_VIBRATO_DEPTH = 0.18;

/** A gentle per-attack colour change; this does not claim a second recording. */
function pianoVelocityShelf(rawVelocity: number, mappedMidi: number): { frequency: number; gain: number } {
  const touch = clamp01((rawVelocity - 1) / 126);
  const pitchScale = 2 ** ((mappedMidi - 60) / 36);
  return {
    frequency: Math.max(1200, Math.min(4000, 1800 * pitchScale)),
    gain: -10 * (1 - touch) ** 1.2,
  };
}

/** One mod/filter chain per MIDI origin; every voice keeps its own gain/source. */
class SharedOriginBus {
  readonly input: Tone.ToneAudioNode;
  private readonly vibrato: Tone.Vibrato;
  private readonly filter: Tone.Filter;
  private readonly softPedalCutoffHz: number;
  private readonly onEmpty: () => void;
  private references = 0;
  private softPedal: boolean;
  private modulation: number;
  private disposed = false;

  constructor(
    destination: Tone.ToneAudioNode,
    initial: LiveVoiceInitialState,
    softPedalCutoffHz: number,
    onEmpty: () => void,
  ) {
    this.softPedalCutoffHz = softPedalCutoffHz;
    this.onEmpty = onEmpty;
    this.softPedal = initial.softPedal;
    this.modulation = clamp01(initial.modulation);
    let filter: Tone.Filter | undefined;
    let vibrato: Tone.Vibrato | undefined;
    try {
      filter = new Tone.Filter({
        type: "lowpass",
        frequency: this.softPedal ? softPedalCutoffHz : 20000,
        Q: 0.7,
        rolloff: -12,
      });
      filter.connect(destination);
      vibrato = new Tone.Vibrato({
        frequency: 5,
        maxDelay: 0.005,
        depth: this.modulation * MAX_VIBRATO_DEPTH,
        // A neutral CC1 must use the undelayed sample, not the effect's delay.
        wet: Math.min(1, this.modulation * 2),
      });
      vibrato.connect(filter);
      this.filter = filter;
      this.vibrato = vibrato;
      this.input = vibrato;
    } catch (error) {
      vibrato?.dispose();
      filter?.dispose();
      throw error;
    }
  }

  acquire(): void {
    if (this.disposed) throw new Error("Cannot reuse a disposed origin bus");
    this.references++;
  }

  release(): void {
    if (this.references === 0) return;
    this.references--;
    if (this.references !== 0) return;
    this.disposed = true;
    this.vibrato.dispose();
    this.filter.dispose();
    this.onEmpty();
  }

  setSoftPedal(active: boolean, audioTime: number): void {
    if (this.disposed || this.softPedal === active) return;
    this.softPedal = active;
    this.filter.frequency.rampTo(
      active ? this.softPedalCutoffHz : 20000,
      0.03,
      Math.max(audioTime, Tone.immediate()),
    );
  }

  setModulation(depth: number, audioTime: number): void {
    const next = clamp01(depth);
    if (this.disposed || this.modulation === next) return;
    this.modulation = next;
    this.vibrato.depth.rampTo(
      next * MAX_VIBRATO_DEPTH,
      0.025,
      Math.max(audioTime, Tone.immediate()),
    );
    this.vibrato.wet.rampTo(
      Math.min(1, next * 2),
      0.025,
      Math.max(audioTime, Tone.immediate()),
    );
  }
}

class ToneSampleVoice implements LiveVoiceHandle {
  private readonly source!: Tone.ToneBufferSource;
  private readonly gain!: Tone.Gain;
  private readonly decayGain: Tone.Gain | null;
  private readonly velocityFilter: Tone.Filter | null;
  private readonly bus: SharedOriginBus;
  private readonly baseRate: number;
  private readonly levelMultiplier: number;
  private ended = false;
  private readonly onEnded: () => void;
  private readonly attackTime: number;
  private stopDeadline = Infinity;

  constructor(
    sample: DecodedPianoSample,
    attack: LiveVoiceAttack,
    initial: LiveVoiceInitialState,
    bus: SharedOriginBus,
    options: ToneSampleVoiceOptions,
    onEnded: () => void,
  ) {
    this.attackTime = attack.audioTime;
    this.onEnded = onEnded;
    this.baseRate = 2 ** ((attack.mappedMidi - (sample.pitchMidi ?? sample.midi)) / 12);
    this.levelMultiplier = sample.gainCompensation ?? 1;
    this.bus = bus;
    bus.acquire();
    let gain: Tone.Gain | undefined;
    let decayGain: Tone.Gain | null = null;
    let velocityFilter: Tone.Filter | null = null;
    let source: Tone.ToneBufferSource | undefined;
    try {
      gain = new Tone.Gain(Math.min(32, clampVoiceGain(initial.gain) * this.levelMultiplier));
      gain.connect(bus.input);
      if (sample.naturalStopSeconds !== undefined) {
        decayGain = new Tone.Gain(1).connect(gain);
        const start = attack.audioTime;
        const end = sample.naturalStopSeconds;
        decayGain.gain.setValueAtTime(1, start);
        decayGain.gain.setValueAtTime(1, start + Math.min(0.5, end * 0.1));
        decayGain.gain.linearRampToValueAtTime(0.5, start + Math.min(2, end * 0.4));
        decayGain.gain.linearRampToValueAtTime(0, start + end);
      }
      if (options.velocityColor && sample.velocityLayer === undefined && attack.rawVelocity < 127) {
        velocityFilter = new Tone.Filter({
          type: "highshelf",
          ...pianoVelocityShelf(attack.rawVelocity, attack.mappedMidi),
          Q: 0.7,
          rolloff: -12,
        }).connect(decayGain ?? gain);
      }
      source = new Tone.ToneBufferSource({
        url: sample.buffer,
        playbackRate: this.baseRate * 2 ** (initial.bendSemitones / 12),
        loop: sample.loopStartSec !== undefined && sample.loopEndSec !== undefined,
        loopStart: sample.loopStartSec ?? 0,
        loopEnd: sample.loopEndSec ?? 0,
        fadeIn: options.attackSeconds ?? 0.003,
        fadeOut: sample.naturalStopSeconds === undefined ? 0.12 : 0.02,
        curve: options.velocityColor ? "exponential" : "linear",
      });
      source.connect(velocityFilter ?? decayGain ?? gain);
      this.gain = gain;
      this.decayGain = decayGain;
      this.velocityFilter = velocityFilter;
      this.source = source;
      source.onended = () => this.finish(true);
      // No fixed duration: the recording ends naturally unless this instance
      // receives its own Note Off or a voice-limit release. Percussive WAF
      // zones with an AHDSR decay are the explicit exception: their source
      // loop must not ring forever under sustain.
      source.start(attack.audioTime);
      if (sample.naturalStopSeconds !== undefined) {
        this.stopDeadline = attack.audioTime + sample.naturalStopSeconds + 0.02;
        // ToneBufferSource.stop(t) begins its fade at t and ends after
        // fadeOut seconds, unlike AudioBufferSourceNode.stop(t). The separate
        // decay node remains continuous if a Note Off shortens this stop.
        source.stop(attack.audioTime + sample.naturalStopSeconds);
      }
    } catch (error) {
      this.ended = true;
      source?.dispose();
      decayGain?.dispose();
      velocityFilter?.dispose();
      gain?.dispose();
      bus.release();
      throw error;
    }
  }

  release(audioTime: number, fadeSeconds: number): void {
    if (this.ended) return;
    if (audioTime < this.attackTime - 0.001) {
      // A Stop/Seek before a lookahead attack must not emit a future blip.
      this.finish();
      return;
    }
    const time = Math.max(audioTime, this.attackTime);
    const fade = Math.max(0.005, Math.min(10, fadeSeconds));
    const deadline = time + fade;
    // ToneBufferSource.stop cancels its previous stop. A repeated release may
    // shorten a tail (All Sound Off), but must never make it ring longer.
    if (deadline >= this.stopDeadline) return;
    this.stopDeadline = deadline;
    // Voice stealing and All Sound Off still need a bounded click-safe tail.
    if (fade <= 0.02) this.source.curve = "linear";
    this.source.fadeOut = fade;
    this.source.stop(time);
  }

  private finish(naturallyEnded = false): void {
    if (this.ended) return;
    this.ended = true;
    this.source.onended = () => {};
    const dispose = (): void => {
      this.source.dispose();
      this.decayGain?.dispose();
      this.velocityFilter?.dispose();
      this.gain.dispose();
      this.bus.release();
    };
    if (!naturallyEnded || !retainUntilOfflineRender(this.source.context, dispose)) dispose();
    this.onEnded();
  }

  setGain(gain: number, audioTime: number): void {
    if (this.ended) return;
    this.gain.gain.rampTo(Math.min(32, clampVoiceGain(gain) * this.levelMultiplier), 0.015,
      Math.max(audioTime, Tone.immediate()));
  }

  setBend(semitones: number, audioTime: number): void {
    if (this.ended) return;
    const target = this.baseRate * 2 ** (semitones / 12);
    this.source.playbackRate.rampTo(target, 0.008, Math.max(audioTime, Tone.immediate()));
  }

  setSoftPedal(active: boolean, audioTime: number): void {
    if (this.ended) return;
    this.bus.setSoftPedal(active, audioTime);
  }

  setModulation(depth: number, audioTime: number): void {
    if (this.ended) return;
    this.bus.setModulation(depth, audioTime);
  }
}

export class ToneSampleVoiceFactory implements LiveVoiceFactory {
  private readonly bank: DecodedPianoSampleBank;
  private readonly destination: Tone.ToneAudioNode;
  private readonly options: ToneSampleVoiceOptions;
  private readonly originBuses = new Map<string, SharedOriginBus>();

  constructor(
    bank: DecodedPianoSampleBank,
    destination: Tone.ToneAudioNode,
    options: ToneSampleVoiceOptions = {},
  ) {
    this.bank = bank;
    this.destination = destination;
    this.options = options;
  }

  get activeOriginBusCount(): number {
    return this.originBuses.size;
  }

  create(
    attack: LiveVoiceAttack,
    initial: LiveVoiceInitialState,
    onEnded: () => void,
  ): LiveVoiceHandle | null {
    // A small bound avoids strongly repitched attacks; the startup bank must
    // cover the keyboard's visible range before live input switches to it.
    const inPrimaryRange = !this.options.primaryRange || (attack.mappedMidi >= this.options.primaryRange.minMidi
      && attack.mappedMidi <= this.options.primaryRange.maxMidi);
    const sample = (inPrimaryRange
      ? this.bank.closest(attack.mappedMidi, this.options.maxShiftSemitones ?? 6, attack.rawVelocity)
      : null)
      ?? this.options.fallbackBank?.closest(attack.mappedMidi, 6, attack.rawVelocity);
    if (!sample) return null;
    const key = `${attack.inputId.length}:${attack.inputId}:${attack.channel}`;
    let bus = this.originBuses.get(key);
    if (!bus) {
      bus = new SharedOriginBus(
        this.destination,
        initial,
        this.options.softPedalCutoffHz ?? 8500,
        () => { this.originBuses.delete(key); },
      );
      this.originBuses.set(key, bus);
    } else {
      bus.setSoftPedal(initial.softPedal, attack.audioTime);
      bus.setModulation(initial.modulation, attack.audioTime);
    }
    return new ToneSampleVoice(sample, attack, initial, bus, this.options, onEnded);
  }
}
