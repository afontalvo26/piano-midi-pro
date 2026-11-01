import { OwnedVoiceRegistry, type OwnedVoiceHandle, type OwnedVoiceSnapshot } from "./ownedVoiceRegistry";

/**
 * Owns live notes independently of React's render cycle.
 * A voice is identified by attack, input and MIDI channel. The factory must
 * return a handle for that exact voice; Tone.Sampler is not such a factory,
 * because triggerRelease(note) stops every instance of the same pitch.
 */

export interface LiveOrigin {
  inputId: string;
  /** Zero-based MIDI channel. */
  channel: number;
}

export interface LiveVoiceAttack extends LiveOrigin {
  attackId: number;
  originalNote: number;
  mappedMidi: number;
  rawVelocity: number;
  /** Already calibrated/curved attack level, independent of later CC values. */
  amplitude: number;
  /** Absolute AudioContext time. */
  audioTime: number;
}

export interface LiveVoiceInitialState {
  gain: number;
  bendSemitones: number;
  softPedal: boolean;
  /** Normalized CC1 depth; actual vibrato is bounded by the voice factory. */
  modulation: number;
}

export interface LiveVoiceHandle {
  /** Release this instance only. Repeated calls may shorten an existing tail. */
  release(audioTime: number, fadeSeconds: number): void;
  setGain(gain: number, audioTime: number): void;
  setBend(semitones: number, audioTime: number): void;
  /** A documented approximation if the sample has no true una corda layer. */
  setSoftPedal(active: boolean, audioTime: number): void;
  setModulation(depth: number, audioTime: number): void;
}

export interface LiveVoiceFactory {
  create(
    attack: LiveVoiceAttack,
    initial: LiveVoiceInitialState,
    onEnded: () => void,
  ): LiveVoiceHandle | null;
}

interface ChannelState extends LiveOrigin {
  volume: number;
  expression: number;
  pressure: number;
  modulation: number;
  bend: number;
  bendRange: number;
  sustain: number;
  halfPedal: number;
  unaCorda: boolean;
  sostenuto: boolean;
}

interface GlobalPedalState {
  sustain: number;
  halfPedal: number;
  unaCorda: boolean;
  sostenuto: boolean;
}

interface VoiceRecord {
  attack: LiveVoiceAttack;
  originKey: string;
  noteKey: string;
  handle: LiveVoiceHandle;
  keyDown: boolean;
  released: boolean;
  captures: Set<string>;
  polyPressure: number;
  gain: number;
  bendSemitones: number;
  softPedal: boolean;
  modulation: number;
  ownedHandle: OwnedVoiceHandle | null;
}

export interface LiveVoiceSnapshot {
  activeVoiceCount: number;
  allocatedVoiceCount: number;
  maxVoices: number;
  activeVoiceLimit: number;
  maxRetiringVoices: number;
  retiringVoiceCount: number;
  stolenVoiceCount: number;
  discardedAttackCount: number;
  /** Note Ons still held physically whose sample was missing or has ended. */
  pendingSilentNoteCount: number;
  voices: Array<{
    attackId: number;
    inputId: string;
    channel: number;
    originalNote: number;
    mappedMidi: number;
    keyDown: boolean;
    released: boolean;
    sostenutoCaptured: boolean;
    gain: number;
    bendSemitones: number;
    softPedal: boolean;
    modulation: number;
  }>;
}

const DEFAULT_RELEASE_SEC = 1.2;
const FORCED_RELEASE_SEC = 0.012;
// 56 sustained sources plus a brief 45-source overlap during voice stealing.
// The 37-key SMK37 can retrigger every key while older pedal-held voices fade.
const DEFAULT_MAX_VOICES = 101;
const DEFAULT_ACTIVE_VOICES = 56;

export interface LiveVoiceLimits {
  /** Hard bound on allocated sources, including short voice-stealing tails. */
  maxVoices?: number;
}

interface RetiringVoice {
  handle: LiveVoiceHandle;
  shortened: boolean;
  ownedHandle: OwnedVoiceHandle | null;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampVoiceGain(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(16, value)) : 0;
}

function ccValue(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(127, Math.round(value))) : 0;
}

function requireAudioTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("audioTime must be a non-negative finite number");
  }
}

function keyOf(origin: LiveOrigin): string {
  if (!origin.inputId || !Number.isInteger(origin.channel) || origin.channel < 0 || origin.channel > 15) {
    throw new RangeError("A live origin needs an inputId and MIDI channel 0..15");
  }
  return `${origin.inputId.length}:${origin.inputId}:${origin.channel}`;
}

function noteKeyOf(originKey: string, originalNote: number): string {
  if (!Number.isInteger(originalNote) || originalNote < 0 || originalNote > 127) {
    throw new RangeError("originalNote must be MIDI 0..127");
  }
  return `${originKey}:${originalNote}`;
}

function globalToken(source: string): string {
  if (!source) throw new RangeError("global pedal source must be named");
  return `global:${source}`;
}

export class LiveVoiceController {
  private readonly factory: LiveVoiceFactory;
  private readonly voices = new Map<number, VoiceRecord>();
  private readonly pressed = new Map<string, number[]>();
  private readonly channels = new Map<string, ChannelState>();
  private readonly globals = new Map<string, GlobalPedalState>();
  private readonly retiring = new Map<number, RetiringVoice>();
  private readonly ownedVoices = new OwnedVoiceRegistry();
  private readonly ownedByHandle = new Map<OwnedVoiceHandle, number>();
  private readonly maxVoices: number;
  private readonly activeVoiceLimit: number;
  private nextAttackId = 1;
  private releaseSeconds = DEFAULT_RELEASE_SEC;
  private stolenVoiceCount = 0;
  private discardedAttackCount = 0;
  private disposed = false;

  constructor(
    factory: LiveVoiceFactory,
    releaseSeconds = DEFAULT_RELEASE_SEC,
    limits: LiveVoiceLimits = {},
  ) {
    this.factory = factory;
    this.setReleaseSeconds(releaseSeconds);
    const maxVoices = limits.maxVoices ?? DEFAULT_MAX_VOICES;
    if (!Number.isInteger(maxVoices) || maxVoices < 2 || maxVoices > 256) {
      throw new RangeError("maxVoices must be an integer between 2 and 256");
    }
    this.maxVoices = maxVoices;
    // Source.stop(time) schedules a short ramp. The stable voice ceiling stays
    // fixed at 56; the remaining slots are strictly bounded overlap during
    // those 12 ms fades. Small custom limits keep their prior 1/8 reserve.
    const stealReserve = Math.min(8, Math.max(1, Math.floor(maxVoices / 8)));
    this.activeVoiceLimit = Math.min(DEFAULT_ACTIVE_VOICES, maxVoices - stealReserve);
  }

  setReleaseSeconds(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0.01 || seconds > 10) {
      throw new RangeError("releaseSeconds must be between 0.01 and 10");
    }
    this.releaseSeconds = seconds;
  }

  /** Note Off pairs with the oldest held attack of this origin/pitch. */
  noteOn(input: Omit<LiveVoiceAttack, "attackId">): number | null {
    return this.startNote(input, true);
  }

  private startNote(input: Omit<LiveVoiceAttack, "attackId">, preserveSilentPairing: boolean): number | null {
    if (this.disposed) return null;
    requireAudioTime(input.audioTime);
    if (!Number.isInteger(input.mappedMidi) || input.mappedMidi < 0 || input.mappedMidi > 127) {
      throw new RangeError("mappedMidi must be MIDI 0..127");
    }
    if (!Number.isInteger(input.rawVelocity) || input.rawVelocity < 1 || input.rawVelocity > 127) {
      throw new RangeError("rawVelocity must be MIDI 1..127");
    }
    const originKey = keyOf(input);
    const noteKey = noteKeyOf(originKey, input.originalNote);
    const channel = this.channel(input);
    const attack: LiveVoiceAttack = { ...input,
      amplitude: preserveSilentPairing ? clamp01(input.amplitude) : clampVoiceGain(input.amplitude),
      attackId: this.nextAttackId++ };
    if (this.voices.size + this.retiring.size >= this.maxVoices) {
      this.shortenRetiring(input.audioTime);
      this.discardedAttackCount++;
      if (preserveSilentPairing) this.enqueuePressed(noteKey, attack.attackId);
      return null;
    }
    // Sequenced notes have a lower priority than physically held keys.
    if (!preserveSilentPairing && this.voices.size >= this.activeVoiceLimit &&
        ![...this.voices.values()].some((voice) => voice.ownedHandle !== null)) {
      this.discardedAttackCount++;
      return null;
    }
    const softPedal = this.isSoftPedalDown(originKey);
    const initial: LiveVoiceInitialState = {
      gain: this.gainFor(attack.amplitude, channel, 0, softPedal),
      bendSemitones: channel.bend * channel.bendRange,
      softPedal,
      modulation: channel.modulation / 127,
    };
    let endedBeforeRegistration = false;
    const handle = this.factory.create(attack, initial, () => {
      const retired = this.retiring.get(attack.attackId);
      if (retired) {
        this.retiring.delete(attack.attackId);
        if (retired.ownedHandle) this.ownedVoices.finish(retired.ownedHandle);
      }
      else if (this.voices.has(attack.attackId)) this.forget(attack.attackId);
      else endedBeforeRegistration = true;
    });
    if (!handle || endedBeforeRegistration) {
      // Preserve Note On/Off pairing even when a sample was unavailable or
      // ended immediately. Otherwise the next repeated pitch is cut early.
      if (preserveSilentPairing) this.enqueuePressed(noteKey, attack.attackId);
      return null;
    }

    if (this.voices.size >= this.activeVoiceLimit) {
      this.stealOne(originKey, input.audioTime, !preserveSilentPairing);
    }

    this.voices.set(attack.attackId, {
      attack,
      originKey,
      noteKey,
      handle,
      keyDown: true,
      released: false,
      captures: new Set(),
      polyPressure: 0,
      ownedHandle: null,
      ...initial,
    });
    this.enqueuePressed(noteKey, attack.attackId);
    return attack.attackId;
  }

  /** A sequenced or preview note gets a handle independent of pitch/FIFO order. */
  noteOnOwned(input: Omit<LiveVoiceAttack, "attackId">, ownerId: string, epoch: number): OwnedVoiceHandle | null {
    if (!ownerId || !Number.isSafeInteger(epoch) || epoch < 0) {
      throw new RangeError("owned note needs ownerId and non-negative epoch");
    }
    const attackId = this.startNote(input, false);
    if (attackId === null) return null;
    const record = this.voices.get(attackId);
    if (!record) return null;
    const handle = this.ownedVoices.register({
      ownerId, epoch,
      release: (audioTime, fadeSeconds) => {
        this.removePressed(record.noteKey, attackId);
        this.forceRelease(record, audioTime, fadeSeconds);
      },
    });
    record.ownedHandle = handle;
    this.ownedByHandle.set(handle, attackId);
    return handle;
  }

  /** Musical Note Off honors the channel's sustain and sostenuto state. */
  noteOffHandle(handle: OwnedVoiceHandle, audioTime: number): boolean {
    requireAudioTime(audioTime);
    const attackId = this.ownedByHandle.get(handle);
    const record = attackId === undefined ? null : this.voices.get(attackId);
    if (!record || record.ownedHandle !== handle) return false;
    this.removePressed(record.noteKey, attackId!);
    record.keyDown = false;
    this.releaseIfEligible(record, audioTime);
    return true;
  }

  /** Force-release a specific voice, even if a pedal is down. */
  releaseHandle(handle: OwnedVoiceHandle, audioTime: number, fadeSeconds = FORCED_RELEASE_SEC): boolean {
    return this.ownedVoices.releaseHandle(handle, audioTime, fadeSeconds);
  }

  releaseOwner(ownerId: string, audioTime: number, includeDescendants = false): number {
    return this.ownedVoices.releaseOwner(ownerId, audioTime, FORCED_RELEASE_SEC, includeDescendants);
  }

  releaseEpoch(ownerId: string, epoch: number, audioTime: number, includeDescendants = false): number {
    return this.ownedVoices.releaseEpoch(ownerId, epoch, audioTime, FORCED_RELEASE_SEC, includeDescendants);
  }

  ownedVoiceSnapshot(): OwnedVoiceSnapshot {
    return this.ownedVoices.snapshot();
  }

  noteOff(input: LiveOrigin & { originalNote: number; audioTime: number }): number | null {
    if (this.disposed) return null;
    requireAudioTime(input.audioTime);
    const noteKey = noteKeyOf(keyOf(input), input.originalNote);
    const queue = this.pressed.get(noteKey);
    const attackId = queue?.shift();
    if (queue?.length === 0) this.pressed.delete(noteKey);
    if (attackId === undefined) return null;
    const record = this.voices.get(attackId);
    if (!record) return null;
    record.keyDown = false;
    this.releaseIfEligible(record, input.audioTime);
    return attackId;
  }

  setSustain(origin: LiveOrigin, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    this.channel(origin).sustain = ccValue(value);
    this.releaseEligible(audioTime, keyOf(origin));
  }

  /** A 0..1 half-pedal position; unlike full CC64 it changes the release tail. */
  setHalfPedal(origin: LiveOrigin, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    this.channel(origin).halfPedal = clamp01(value);
    this.releaseEligible(audioTime, keyOf(origin));
  }

  setGlobalSustain(source: string, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    this.global(source).sustain = ccValue(value);
    this.releaseEligible(audioTime);
  }

  setGlobalHalfPedal(source: string, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    this.global(source).halfPedal = clamp01(value);
    this.releaseEligible(audioTime);
  }

  setSostenuto(origin: LiveOrigin, down: boolean, audioTime: number): void {
    requireAudioTime(audioTime);
    const key = keyOf(origin);
    const state = this.channel(origin);
    if (state.sostenuto === down) return;
    state.sostenuto = down;
    const token = `local:${key}`;
    for (const record of this.voices.values()) {
      if (record.originKey !== key || record.released) continue;
      if (down && record.keyDown) record.captures.add(token);
      if (!down) record.captures.delete(token);
    }
    if (!down) this.releaseEligible(audioTime, key);
  }

  setGlobalSostenuto(source: string, down: boolean, audioTime: number): void {
    requireAudioTime(audioTime);
    const state = this.global(source);
    if (state.sostenuto === down) return;
    state.sostenuto = down;
    const token = globalToken(source);
    for (const record of this.voices.values()) {
      if (record.released) continue;
      if (down && record.keyDown) record.captures.add(token);
      if (!down) record.captures.delete(token);
    }
    if (!down) this.releaseEligible(audioTime);
  }

  setUnaCorda(origin: LiveOrigin, down: boolean, audioTime: number): void {
    requireAudioTime(audioTime);
    this.channel(origin).unaCorda = down;
    this.refreshExpression(audioTime, keyOf(origin));
  }

  setGlobalUnaCorda(source: string, down: boolean, audioTime: number): void {
    requireAudioTime(audioTime);
    this.global(source).unaCorda = down;
    this.refreshExpression(audioTime);
  }

  setVolume(origin: LiveOrigin, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    this.channel(origin).volume = ccValue(value);
    this.refreshExpression(audioTime, keyOf(origin));
  }

  setExpression(origin: LiveOrigin, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    this.channel(origin).expression = ccValue(value);
    this.refreshExpression(audioTime, keyOf(origin));
  }

  setChannelPressure(origin: LiveOrigin, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    this.channel(origin).pressure = ccValue(value);
    this.refreshExpression(audioTime, keyOf(origin));
  }

  /** CC1 changes the held voices, including those kept by the pedal. */
  setModulation(origin: LiveOrigin, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    const state = this.channel(origin);
    state.modulation = ccValue(value);
    const key = keyOf(origin);
    for (const record of this.voices.values()) {
      if (record.originKey !== key || record.released) continue;
      record.modulation = state.modulation / 127;
      record.handle.setModulation(record.modulation, audioTime);
    }
  }

  setPolyPressure(origin: LiveOrigin, originalNote: number, value: number, audioTime: number): void {
    requireAudioTime(audioTime);
    const noteKey = noteKeyOf(keyOf(origin), originalNote);
    for (const record of this.voices.values()) {
      if (record.noteKey === noteKey && !record.released) {
        record.polyPressure = ccValue(value);
        this.refreshVoiceExpression(record, audioTime);
      }
    }
  }

  /** bend is normalized -1..1; range is the configured semitone span. */
  setPitchBend(origin: LiveOrigin, bend: number, rangeSemitones: number, audioTime: number): void {
    requireAudioTime(audioTime);
    if (!Number.isFinite(rangeSemitones) || rangeSemitones < 0 || rangeSemitones > 24) {
      throw new RangeError("rangeSemitones must be 0..24");
    }
    const state = this.channel(origin);
    state.bend = Number.isFinite(bend) ? Math.max(-1, Math.min(1, bend)) : 0;
    state.bendRange = rangeSemitones;
    const key = keyOf(origin);
    for (const record of this.voices.values()) {
      if (record.originKey !== key || record.released) continue;
      record.bendSemitones = state.bend * state.bendRange;
      record.handle.setBend(record.bendSemitones, audioTime);
    }
  }

  /** CC123: physically release keys while respecting any pedal still down. */
  allNotesOff(origin: LiveOrigin, audioTime: number): void {
    requireAudioTime(audioTime);
    const key = keyOf(origin);
    this.clearPressedForOrigin(key);
    for (const record of this.voices.values()) {
      if (record.originKey !== key || record.released) continue;
      record.keyDown = false;
      this.releaseIfEligible(record, audioTime);
    }
  }

  /** CC120: quickly fade all voices for this channel, ignoring pedals. */
  allSoundOff(origin: LiveOrigin, audioTime: number): void {
    this.releaseChannel(keyOf(origin), audioTime);
  }

  /** Disconnecting one port must not silence another port's voices. */
  releaseOrigin(inputId: string, audioTime: number, channel?: number): void {
    requireAudioTime(audioTime);
    const originKeys = new Set<string>();
    for (const [key, state] of this.channels) {
      if (state.inputId === inputId && (channel === undefined || state.channel === channel)) originKeys.add(key);
    }
    for (const key of originKeys) this.clearPressedForOrigin(key);
    for (const record of this.voices.values()) {
      if (record.attack.inputId === inputId && (channel === undefined || record.attack.channel === channel)) {
        this.forceRelease(record, audioTime);
      }
    }
    for (const [key, state] of this.channels) {
      if (state.inputId === inputId && (channel === undefined || state.channel === channel)) this.channels.delete(key);
    }
  }

  releaseAll(audioTime: number): void {
    requireAudioTime(audioTime);
    for (const record of this.voices.values()) {
      if (!record.ownedHandle) this.forceRelease(record, audioTime);
    }
    this.ownedVoices.panic(audioTime, FORCED_RELEASE_SEC);
    this.pressed.clear();
    this.channels.clear();
    this.globals.clear();
  }

  dispose(audioTime: number): void {
    if (this.disposed) return;
    this.releaseAll(audioTime);
    this.disposed = true;
  }

  snapshot(): LiveVoiceSnapshot {
    const voices = [...this.voices.values()].map((record) => ({
      attackId: record.attack.attackId,
      inputId: record.attack.inputId,
      channel: record.attack.channel,
      originalNote: record.attack.originalNote,
      mappedMidi: record.attack.mappedMidi,
      keyDown: record.keyDown,
      released: record.released,
      sostenutoCaptured: record.captures.size > 0,
      gain: record.gain,
      bendSemitones: record.bendSemitones,
      softPedal: record.softPedal,
      modulation: record.modulation,
    }));
    return {
      activeVoiceCount: voices.filter((voice) => !voice.released).length,
      allocatedVoiceCount: voices.length + this.retiring.size,
      maxVoices: this.maxVoices,
      activeVoiceLimit: this.activeVoiceLimit,
      maxRetiringVoices: this.maxVoices - this.activeVoiceLimit,
      retiringVoiceCount: this.retiring.size,
      stolenVoiceCount: this.stolenVoiceCount,
      discardedAttackCount: this.discardedAttackCount,
      pendingSilentNoteCount: [...this.pressed.values()].reduce(
        (count, queue) => count + queue.filter((id) => !this.voices.has(id)).length,
        0,
      ),
      voices,
    };
  }

  private channel(origin: LiveOrigin): ChannelState {
    const key = keyOf(origin);
    let state = this.channels.get(key);
    if (!state) {
      state = {
        inputId: origin.inputId,
        channel: origin.channel,
        volume: 127,
        expression: 127,
        pressure: 0,
        modulation: 0,
        bend: 0,
        bendRange: 2,
        sustain: 0,
        halfPedal: 0,
        unaCorda: false,
        sostenuto: false,
      };
      this.channels.set(key, state);
    }
    return state;
  }

  private global(source: string): GlobalPedalState {
    const token = globalToken(source);
    let state = this.globals.get(token);
    if (!state) {
      state = { sustain: 0, halfPedal: 0, unaCorda: false, sostenuto: false };
      this.globals.set(token, state);
    }
    return state;
  }

  private sustainValue(record: VoiceRecord): number {
    const local = this.channels.get(record.originKey);
    let value = Math.max(local?.sustain ?? 0, Math.round((local?.halfPedal ?? 0) * 63));
    for (const state of this.globals.values()) {
      value = Math.max(value, state.sustain, Math.round(state.halfPedal * 63));
    }
    return value;
  }

  private isSoftPedalDown(originKey: string): boolean {
    if (this.channels.get(originKey)?.unaCorda) return true;
    for (const state of this.globals.values()) if (state.unaCorda) return true;
    return false;
  }

  private gainFor(amplitude: number, channel: ChannelState, polyPressure: number, soft: boolean): number {
    const volume = channel.volume / 127;
    const expression = channel.expression / 127;
    // Reserve 1.41 dB at zero pressure so aftertouch remains audible even for
    // velocity 127 with CC7/CC11 fully open; at full pressure it reaches the
    // previous peak without clipping. Una corda remains a filter/level proxy.
    const pressure = 0.85 + 0.15 * Math.max(channel.pressure, polyPressure) / 127;
    return clampVoiceGain(amplitude * volume * volume * expression * expression * pressure * (soft ? 0.75 : 1));
  }

  private refreshExpression(audioTime: number, onlyOrigin?: string): void {
    for (const record of this.voices.values()) {
      if (record.released || (onlyOrigin && record.originKey !== onlyOrigin)) continue;
      this.refreshVoiceExpression(record, audioTime);
    }
  }

  private refreshVoiceExpression(record: VoiceRecord, audioTime: number): void {
    const channel = this.channels.get(record.originKey);
    if (!channel) return;
    const soft = this.isSoftPedalDown(record.originKey);
    if (soft !== record.softPedal) {
      record.softPedal = soft;
      record.handle.setSoftPedal(soft, audioTime);
    }
    record.gain = this.gainFor(record.attack.amplitude, channel, record.polyPressure, soft);
    record.handle.setGain(record.gain, audioTime);
  }

  private releaseIfEligible(record: VoiceRecord, audioTime: number): void {
    if (record.keyDown || record.released) return;
    const pedal = this.sustainValue(record);
    if (pedal >= 64 || record.captures.size > 0) return;
    const half = pedal / 63;
    record.handle.release(audioTime, this.releaseSeconds * (1 + 1.5 * half));
    record.released = true;
    if (record.ownedHandle) this.ownedVoices.markReleasing(record.ownedHandle);
  }

  private releaseEligible(audioTime: number, onlyOrigin?: string): void {
    for (const record of this.voices.values()) {
      if (!onlyOrigin || record.originKey === onlyOrigin) this.releaseIfEligible(record, audioTime);
    }
  }

  private forceRelease(record: VoiceRecord, audioTime: number, fadeSeconds = FORCED_RELEASE_SEC): void {
    record.handle.release(audioTime, fadeSeconds);
    record.released = true;
    record.keyDown = false;
    record.captures.clear();
    if (record.ownedHandle) this.ownedVoices.markReleasing(record.ownedHandle);
  }

  private releaseChannel(originKey: string, audioTime: number): void {
    requireAudioTime(audioTime);
    this.clearPressedForOrigin(originKey);
    for (const record of this.voices.values()) {
      if (record.originKey === originKey) this.forceRelease(record, audioTime);
    }
    const state = this.channels.get(originKey);
    if (state) {
      state.sustain = 0;
      state.halfPedal = 0;
      state.sostenuto = false;
    }
  }

  private clearPressedForOrigin(originKey: string): void {
    for (const noteKey of this.pressed.keys()) {
      if (noteKey.startsWith(`${originKey}:`)) this.pressed.delete(noteKey);
    }
  }

  private stealOne(incomingOriginKey: string, audioTime: number, ownedIncoming: boolean): void {
    const candidates = [...this.voices.values()].filter((record) => !ownedIncoming || record.ownedHandle !== null);
    const statePriority = (record: VoiceRecord): number =>
      record.released ? 0 : record.keyDown ? 2 : 1;
    candidates.sort((a, b) =>
      Number(a.ownedHandle === null) - Number(b.ownedHandle === null)
      || statePriority(a) - statePriority(b)
      || Number(a.originKey !== incomingOriginKey) - Number(b.originKey !== incomingOriginKey)
      || a.attack.attackId - b.attack.attackId,
    );
    const oldest = candidates[0];
    if (!oldest) return;
    // Keep a silent FIFO placeholder for a stolen key that is still down.
    // The ToneBufferSource remains in `retiring` until its 12 ms ramp ends.
    this.voices.delete(oldest.attack.attackId);
    this.retiring.set(oldest.attack.attackId, {
      handle: oldest.handle, shortened: false, ownedHandle: oldest.ownedHandle,
    });
    if (oldest.ownedHandle) {
      this.ownedByHandle.delete(oldest.ownedHandle);
      this.ownedVoices.markReleasing(oldest.ownedHandle);
      this.removePressed(oldest.noteKey, oldest.attack.attackId);
    }
    this.stolenVoiceCount++;
    oldest.handle.release(audioTime, FORCED_RELEASE_SEC);
  }

  private shortenRetiring(audioTime: number): void {
    // A third dense retrigger can arrive before previous 12 ms fades end.
    // Request the shortest click-safe fade; an already running source still
    // occupies its slot until onended, so the hard resource cap remains real.
    for (const retired of this.retiring.values()) {
      if (retired.shortened) continue;
      retired.shortened = true;
      retired.handle.release(audioTime, 0.005);
    }
  }

  private enqueuePressed(noteKey: string, attackId: number): void {
    const queue = this.pressed.get(noteKey) ?? [];
    queue.push(attackId);
    this.pressed.set(noteKey, queue);
  }

  private removePressed(noteKey: string, attackId: number): void {
    const queue = this.pressed.get(noteKey);
    if (!queue) return;
    const index = queue.indexOf(attackId);
    if (index >= 0) queue.splice(index, 1);
    if (queue.length === 0) this.pressed.delete(noteKey);
  }

  private forget(attackId: number): void {
    const record = this.voices.get(attackId);
    if (!record) return;
    this.voices.delete(attackId);
    if (record.ownedHandle) {
      this.ownedByHandle.delete(record.ownedHandle);
      this.ownedVoices.finish(record.ownedHandle);
    }
    // A naturally ended one-shot can still have its physical key down. Leave
    // its ID as a silent placeholder until its Note Off arrives, preserving
    // FIFO matching for another attack of the same note.
    if (record.keyDown) {
      if (record.ownedHandle) this.removePressed(record.noteKey, attackId);
      return;
    }
    const queue = this.pressed.get(record.noteKey);
    if (queue) {
      const index = queue.indexOf(attackId);
      if (index >= 0) queue.splice(index, 1);
      if (queue.length === 0) this.pressed.delete(record.noteKey);
    }
  }
}
