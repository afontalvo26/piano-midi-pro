import type { OwnedVoiceHandle } from "../audio/ownedVoiceRegistry";
import { MusicalClock, PROJECT_PPQ, type LoopRange, type TickRounding,
  validateLoopRange, wrapLoopTick } from "./musicalClock";
import type {
  AutomationResolver, ScheduledAudioClip, ScheduledAuthority, ScheduledAutomation,
  ScheduledControl, ScheduledMetronomeTick,
  ScheduledNoteOff, ScheduledNoteOn, SequencerSink, TimelineAudioClip, TimelineEvent,
  TimelineAutomation, TimelineNote, TimelineResolver,
} from "./timelineEvents";

export interface AudioClockSource {
  readonly currentTime: number;
  readonly state: "running" | "suspended" | "closed";
}

export interface TransportOptions {
  readonly rootOwnerId: string;
  readonly clock: MusicalClock;
  readonly audio: AudioClockSource;
  readonly sink: SequencerSink;
  readonly resolve: TimelineResolver;
  readonly resolveAutomation?: AutomationResolver;
  readonly loop?: LoopRange;
  readonly horizonSeconds?: number;
  /** Offline render can start exactly at sample zero; live retains the 8 ms lead. */
  readonly startLeadSeconds?: number;
  readonly wakeIntervalMs?: number;
  /** Manual pump is useful for offline scheduling and deterministic tests. */
  readonly autoPump?: boolean;
  readonly metronomeEnabled?: boolean;
}

export type TransportState = "stopped" | "playing" | "paused" | "suspended" | "blocked";

export interface TransportSnapshot {
  readonly state: TransportState;
  readonly tick: number;
  readonly iteration: number;
  readonly epoch: number;
  readonly scheduledEvents: number;
  readonly skippedNotes: number;
  readonly skippedAudioClips: number;
  readonly lateEvents: number;
}

interface Attack {
  handle: OwnedVoiceHandle | null;
}

type Action =
  | { kind: "on"; at: number; sequence: number; id: string; event: ScheduledNoteOn; attack: Attack;
      futureOff: ScheduledNoteOff | null }
  | { kind: "off"; at: number; sequence: number; id: string; event: ScheduledNoteOff; attack: Attack }
  | { kind: "control"; at: number; sequence: number; id: string; event: ScheduledControl }
  | { kind: "authority"; at: number; sequence: number; id: string; event: ScheduledAuthority }
  | { kind: "audioClip"; at: number; sequence: number; id: string; event: ScheduledAudioClip }
  | { kind: "automation"; at: number; sequence: number; id: string; event: ScheduledAutomation }
  | { kind: "metronome"; at: number; sequence: number; id: string; event: ScheduledMetronomeTick };
type AutomationAction = Extract<Action, { kind: "automation" }>;

const MAX_EVENTS_PER_PUMP = 4096;

function requireTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("transport tick must be non-negative and safe");
}

function requireOwnerPath(path: string): void {
  if (!path || path.startsWith("/") || path.endsWith("/") ||
      path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new RangeError("timeline ownerPath must be a relative owner path");
  }
}

function validateEvent(event: TimelineEvent, start: number, end: number): void {
  if (!event.eventId || !event.sourceKind || !Number.isSafeInteger(event.tick) ||
      event.tick < 0 || event.tick >= end ||
      (event.kind !== "audioClip" && event.tick < start) ||
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 0 || !Number.isInteger(event.channel) || event.channel < 0 || event.channel > 15) {
    throw new RangeError("resolver returned an invalid or out-of-window timeline event");
  }
  requireOwnerPath(event.ownerPath);
  if (event.kind === "audioClip") {
    const absolute = event.timeMode === "absolute";
    const segmentUs = event.segmentStartUs !== undefined || event.segmentEndUs !== undefined;
    const envelopeStart = event.envelopeStartFrame ?? event.sourceStartFrame;
    const envelopeEnd = event.envelopeEndFrame ?? event.sourceEndFrame;
    const crossfades = event.crossfades ?? [];
    if (!event.assetId || !Number.isSafeInteger(event.clipStartTick) ||
        event.clipStartTick < 0 || event.clipStartTick > event.tick ||
        !Number.isSafeInteger(event.clipEndTick) || event.clipEndTick <= start ||
        event.clipEndTick <= event.tick ||
        (event.timeMode !== undefined && event.timeMode !== "beat" && !absolute) ||
        (absolute && (!Number.isSafeInteger(event.absoluteStartUs) ||
          !Number.isSafeInteger(event.absoluteEndUs) ||
          event.absoluteStartUs! < 0 || event.absoluteEndUs! <= event.absoluteStartUs!)) ||
        (!absolute && (event.absoluteStartUs !== undefined || event.absoluteEndUs !== undefined)) ||
        (segmentUs && (!Number.isSafeInteger(event.segmentStartUs) ||
          !Number.isSafeInteger(event.segmentEndUs) ||
          event.segmentStartUs! < 0 || event.segmentEndUs! <= event.segmentStartUs!)) ||
        (absolute && (!segmentUs || event.segmentStartUs! < event.absoluteStartUs! ||
          event.segmentEndUs! > event.absoluteEndUs!)) ||
        !Number.isSafeInteger(event.sourceStartFrame) || event.sourceStartFrame < 0 ||
        !Number.isSafeInteger(event.sourceEndFrame) || event.sourceEndFrame <= event.sourceStartFrame ||
        !Number.isSafeInteger(envelopeStart) || envelopeStart < 0 ||
        !Number.isSafeInteger(envelopeEnd) || envelopeEnd <= envelopeStart ||
        event.sourceStartFrame < envelopeStart || event.sourceEndFrame > envelopeEnd ||
        !Number.isSafeInteger(event.fadeInFrames) || event.fadeInFrames < 0 ||
        !Number.isSafeInteger(event.fadeOutFrames) || event.fadeOutFrames < 0 ||
        event.fadeInFrames + event.fadeOutFrames > envelopeEnd - envelopeStart ||
        crossfades.length > 2 ||
        new Set(crossfades.map((fade) => fade.id)).size !== crossfades.length ||
        new Set(crossfades.map((fade) => fade.role)).size !== crossfades.length ||
        crossfades.some((fade) => !fade.id ||
          (fade.role !== "in" && fade.role !== "out") ||
          !Number.isSafeInteger(fade.startUs) || fade.startUs < 0 ||
          !Number.isSafeInteger(fade.endUs) || fade.endUs <= fade.startUs ||
          (fade.curve !== "linear" && fade.curve !== "equalPower")) ||
        !Number.isFinite(event.gainDb) ||
        (event.tailPolicy !== "cut" && event.tailPolicy !== "continue")) {
      throw new RangeError("resolver returned an invalid audio clip");
    }
  } else if (event.kind === "authority") {
    if (!Array.isArray(event.trackIds) || event.trackIds.length === 0 ||
        new Set(event.trackIds).size !== event.trackIds.length ||
        event.trackIds.some((id) => typeof id !== "string" || !id)) {
      throw new RangeError("resolver returned an invalid authority boundary");
    }
  } else if (event.kind === "note") {
    if (!Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127 ||
        !Number.isInteger(event.playedPitch) || event.playedPitch < 0 || event.playedPitch > 127 ||
        !Number.isInteger(event.velocity) || event.velocity < 1 || event.velocity > 127 ||
        !Number.isInteger(event.releaseVelocity) || event.releaseVelocity < 0 || event.releaseVelocity > 127 ||
        !Number.isSafeInteger(event.durationTicks) || event.durationTicks < 1 ||
        (event.tailPolicy !== "cut" && event.tailPolicy !== "continue")) {
      throw new RangeError("resolver returned an invalid note");
    }
  }
}

/** AudioContext time is authoritative; the JS timer only wakes the planner. */
export class TransportScheduler {
  private readonly options: TransportOptions;
  private loop: LoopRange | null;
  private readonly horizon: number;
  private readonly startLead: number;
  private readonly wakeMs: number;
  private stateValue: TransportState = "stopped";
  private epochValue = 0;
  private epochActive = false;
  private position = 0;
  private cursor = 0;
  private anchorPosition = 0;
  private anchorAudioTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingOffs: Action[] = [];
  private scheduledEvents = 0;
  private skippedNotes = 0;
  private skippedAudioClips = 0;
  private readonly scheduledAudioIds = new Map<string, number>();
  private lateEvents = 0;
  private automationPlannedUntil = 0;
  private metronomeEnabled: boolean;

  constructor(options: TransportOptions) {
    if (!options.rootOwnerId.startsWith("transport/") || options.rootOwnerId.endsWith("/")) {
      throw new RangeError("rootOwnerId must start with transport/ and name a project");
    }
    this.options = options;
    this.metronomeEnabled = options.metronomeEnabled ?? false;
    this.loop = options.loop ? validateLoopRange(options.loop) : null;
    this.horizon = options.horizonSeconds ?? 0.12;
    this.startLead = options.startLeadSeconds ?? 0.008;
    this.wakeMs = options.wakeIntervalMs ?? 25;
    if (!Number.isFinite(this.horizon) || this.horizon < 0.02 || this.horizon > 0.5 ||
        !Number.isFinite(this.startLead) || this.startLead < 0 || this.startLead > 0.1 ||
        !Number.isSafeInteger(this.wakeMs) || this.wakeMs < 5 || this.wakeMs > 100) {
      throw new RangeError("invalid transport scheduling horizon or wake interval");
    }
  }

  get state(): TransportState { return this.stateValue; }
  get epoch(): number { return this.epochValue; }
  get isMetronomeEnabled(): boolean { return this.metronomeEnabled; }
  get scheduledUntilTick(): number { return this.cursor; }

  /** Change the musical repeat region without rebuilding instruments or sources.
   * Every change invalidates the old epoch before any new notes can be planned. */
  setLoopRange(next: LoopRange | null): void {
    const normalized = next ? validateLoopRange(next) : null;
    if (this.loop?.startTick === normalized?.startTick &&
        this.loop?.endTick === normalized?.endTick) return;
    const wasPlaying = this.stateValue === "playing";
    // Preserve the displayed musical position when leaving an earlier loop.
    const musicalTick = this.snapshot().tick;
    const tick = normalized && musicalTick >= normalized.endTick
      ? normalized.startTick : musicalTick;
    this.invalidate();
    this.loop = normalized;
    this.position = tick;
    this.cursor = tick;
    this.automationPlannedUntil = tick;
    if (wasPlaying) {
      this.stateValue = "paused";
      this.start(tick);
    }
  }

  setMetronomeEnabled(enabled: boolean): void {
    if (this.metronomeEnabled === enabled) return;
    this.metronomeEnabled = enabled;
    if (!enabled) this.options.sink.cancelMetronome?.();
  }

  /** Replace only mixer lookahead after a validated automation or base-mix revision. */
  replanAutomation(): void {
    if (this.stateValue !== "playing" || !this.options.resolveAutomation) return;
    if (!this.options.sink.automation || !this.options.sink.cancelAutomationEpoch) {
      throw new Error("Sink sin cancelación selectiva de automatización");
    }
    const now = this.options.audio.currentTime;
    const start = this.absoluteTickAtAudioTime(now + this.startLead, "ceil");
    const end = Math.max(this.cursor,
      this.absoluteTickAtAudioTime(now + this.horizon, "ceil"));
    const actions = this.planAutomation(start, end);
    if (actions.length > MAX_EVENTS_PER_PUMP) {
      throw new RangeError("Automatización excede el límite del horizonte");
    }
    actions.sort((a, b) => a.event.audioTime - b.event.audioTime ||
      a.sequence - b.sequence || a.id.localeCompare(b.id));
    this.options.sink.cancelAutomationEpoch(this.options.rootOwnerId, this.epochValue, now, false);
    try {
      for (const action of actions) {
        if (action.event.audioTime < now) this.lateEvents++;
        this.options.sink.automation(action.event);
        this.scheduledEvents++;
      }
      this.automationPlannedUntil = end;
    } finally {
      this.options.sink.finishAutomationReplan?.(this.options.rootOwnerId, this.epochValue, now);
    }
  }

  /** Start at a musical tick; no audio is scheduled when the lock is unavailable. */
  start(tick = this.position): boolean {
    return this.startAt(tick, this.options.audio.currentTime + this.startLead);
  }

  /** Anchor playback to an exact future AudioContext time for count-in/punch. */
  startAt(tick: number, audioTime: number): boolean {
    requireTick(tick);
    if (!Number.isFinite(audioTime) || audioTime < this.options.audio.currentTime ||
        audioTime > this.options.audio.currentTime + 60) {
      throw new RangeError("transport start audio time must be within 60 seconds");
    }
    // The position is absolute after a loop has repeated; resume may start
    // at iteration 2+ even though the displayed musical tick is inside it.
    if (this.stateValue === "playing") this.invalidate();
    this.position = tick;
    this.cursor = tick;
    this.automationPlannedUntil = tick;
    if (!this.options.sink.hasAudioOwnership()) {
      this.stateValue = "blocked";
      this.clearTimer();
      return false;
    }
    if (this.options.audio.state !== "running") {
      this.stateValue = "suspended";
      this.clearTimer();
      return false;
    }
    this.epochValue++;
    this.epochActive = true;
    this.anchorPosition = tick;
    this.anchorAudioTime = audioTime;
    this.stateValue = "playing";
    this.pump();
    this.armTimer();
    return true;
  }

  resume(): boolean {
    if (this.stateValue === "playing") return true;
    return this.start(this.position);
  }

  pause(): void {
    if (this.stateValue === "playing") {
      this.position = this.currentAbsoluteTick();
      this.invalidate();
    }
    this.stateValue = "paused";
    this.clearTimer();
  }

  stop(): void {
    this.invalidate();
    this.position = 0;
    this.cursor = 0;
    this.stateValue = "stopped";
    this.clearTimer();
  }

  seek(tick: number): void {
    requireTick(tick);
    if (this.loop && tick >= this.loop.endTick) throw new RangeError("seek tick must be before loop end");
    const wasPlaying = this.stateValue === "playing";
    this.invalidate();
    this.position = tick;
    this.cursor = tick;
    if (wasPlaying) {
      this.stateValue = "paused";
      this.start(tick);
    }
  }

  /** Poll after an audio state/lock change; suspension invalidates future plans. */
  pump(): void {
    if (this.stateValue !== "playing") return;
    const audio = this.options.audio;
    if (!this.options.sink.hasAudioOwnership() || audio.state !== "running") {
      this.position = this.currentAbsoluteTick();
      this.invalidate();
      this.stateValue = audio.state !== "running" ? "suspended" : "blocked";
      this.clearTimer();
      return;
    }
    const end = this.absoluteTickAtAudioTime(audio.currentTime + this.horizon, "ceil");
    if (end <= this.cursor) return;
    try {
      const actions = this.plan(this.cursor, end);
      if (actions.length > MAX_EVENTS_PER_PUMP) {
        throw new RangeError("transport scheduling density exceeds the per-pump safety limit");
      }
      actions.sort((a, b) => a.event.audioTime - b.event.audioTime ||
        this.priority(a) - this.priority(b) || a.sequence - b.sequence || a.id.localeCompare(b.id));
      for (const action of actions) {
        if (action.event.audioTime < audio.currentTime) this.lateEvents++;
        if (action.kind === "authority") {
          if (!this.options.sink.authorityChange) throw new Error("Sink sin cambios de autoridad");
          this.options.sink.authorityChange(action.event);
        }
        else if (action.kind === "control") this.options.sink.control(action.event);
        else if (action.kind === "automation") {
          if (!this.options.sink.automation) throw new Error("Sink sin automatización de mezcla");
          this.options.sink.automation(action.event);
        }
        else if (action.kind === "metronome") this.options.sink.metronome?.(action.event);
        else if (action.kind === "audioClip") {
          if (!this.options.sink.audioClip) throw new Error("Sink de audio no reproduce clips de audio");
          if (!this.options.sink.audioClip(action.event)) this.skippedAudioClips++;
        }
        else if (action.kind === "on") {
          action.attack.handle = this.options.sink.noteOn(action.event);
          if (!action.attack.handle) this.skippedNotes++;
          else if (action.futureOff) this.pendingOffs.push({
            kind: "off", at: action.futureOff.absoluteTick, sequence: action.sequence,
            id: action.id, event: action.futureOff, attack: action.attack,
          });
        } else if (action.attack.handle) this.options.sink.noteOff(action.attack.handle, action.event);
        this.scheduledEvents++;
      }
      this.cursor = end;
      this.automationPlannedUntil = Math.max(this.automationPlannedUntil, end);
    } catch (error) {
      this.invalidate();
      this.stateValue = "paused";
      throw error;
    }
  }

  snapshot(): TransportSnapshot {
    const absolute = this.stateValue === "playing" ? this.currentAbsoluteTick() : this.position;
    const display = this.loop ? wrapLoopTick(absolute, this.loop) : { tick: absolute, iteration: 0 };
    return { state: this.stateValue, tick: display.tick, iteration: display.iteration,
      epoch: this.epochValue, scheduledEvents: this.scheduledEvents,
      skippedNotes: this.skippedNotes, skippedAudioClips: this.skippedAudioClips,
      lateEvents: this.lateEvents };
  }

  /** Map a scheduled capture time through this transport's tempo and loop anchor. */
  positionAtAudioTime(audioTime: number, rounding: TickRounding = "nearest"):
    { readonly state: TransportState; readonly tick: number;
      readonly absoluteTick: number; readonly iteration: number;
      readonly projectUs: number; readonly projectTick: number } {
    if (!Number.isFinite(audioTime) || audioTime < 0) throw new RangeError("invalid audio time");
    const absoluteTick = this.stateValue === "playing"
      ? this.absoluteTickAtAudioTime(audioTime, rounding) : this.position;
    const wrapped = this.loop ? wrapLoopTick(absoluteTick, this.loop)
      : { tick: absoluteTick, iteration: 0 };
    const seconds = this.stateValue === "playing"
      ? this.secondsAt(this.anchorPosition) + Math.max(0, audioTime - this.anchorAudioTime)
      : this.secondsAt(this.position);
    const projectUs = Math.round(seconds * 1_000_000);
    if (!Number.isSafeInteger(projectUs)) throw new RangeError("project time exceeds safe microseconds");
    const projectTick = this.options.clock.secondsToTick(projectUs / 1_000_000, "nearest");
    return { state: this.stateValue, tick: wrapped.tick, absoluteTick,
      iteration: wrapped.iteration, projectUs, projectTick };
  }

  /** Continuous project time for an absolute tick, including repeated tempo inside a loop. */
  projectUsAtAbsoluteTick(absoluteTick: number): number {
    requireTick(absoluteTick);
    const projectUs = Math.round(this.secondsAt(absoluteTick) * 1_000_000);
    if (!Number.isSafeInteger(projectUs)) throw new RangeError("project time exceeds safe microseconds");
    return projectUs;
  }

  /** Future AudioContext time of an absolute musical tick in the active epoch. */
  audioTimeAtAbsoluteTick(absoluteTick: number): number {
    requireTick(absoluteTick);
    if (this.stateValue !== "playing") throw new Error("transport is not playing");
    return this.audioTimeAt(absoluteTick);
  }

  dispose(): void { this.stop(); }

  private priority(action: Action): number {
    return action.kind === "authority" ? 0
      : action.kind === "control" || action.kind === "metronome" ||
        action.kind === "automation" ? 1
        : action.kind === "off" ? 2 : 3;
  }

  private invalidate(): void {
    this.clearTimer();
    if (this.epochActive) {
      this.options.sink.cancelEpoch(this.options.rootOwnerId, this.epochValue, this.options.audio.currentTime);
      this.epochActive = false;
    }
    this.pendingOffs = [];
    this.scheduledAudioIds.clear();
    this.automationPlannedUntil = 0;
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private armTimer(): void {
    if (this.options.autoPump === false || this.stateValue !== "playing" || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { this.pump(); } catch (error) { console.error("[Transport] scheduler paused", error); }
      finally { this.armTimer(); }
    }, this.wakeMs);
  }

  private secondsAt(absoluteTick: number): number {
    const clock = this.options.clock;
    const loop = this.loop;
    if (!loop || absoluteTick < loop.startTick) return clock.tickToSeconds(absoluteTick);
    const length = loop.endTick - loop.startTick;
    const offset = absoluteTick - loop.startTick;
    const iteration = Math.floor(offset / length);
    const within = offset % length;
    const startSeconds = clock.tickToSeconds(loop.startTick);
    const loopSeconds = clock.secondsBetween(loop.startTick, loop.endTick);
    return startSeconds + iteration * loopSeconds + clock.secondsBetween(loop.startTick, loop.startTick + within);
  }

  private absoluteTickAtAudioTime(audioTime: number, rounding: TickRounding): number {
    const elapsedSeconds = Math.max(0, audioTime - this.anchorAudioTime);
    const seconds = this.secondsAt(this.anchorPosition) + elapsedSeconds;
    const loop = this.loop;
    const clock = this.options.clock;
    if (!loop || seconds < clock.tickToSeconds(loop.startTick)) return clock.secondsToTick(seconds, rounding);
    const startSeconds = clock.tickToSeconds(loop.startTick);
    const loopSeconds = clock.secondsBetween(loop.startTick, loop.endTick);
    const iteration = Math.floor((seconds - startSeconds) / loopSeconds);
    const withinSeconds = seconds - startSeconds - iteration * loopSeconds;
    const tick = Math.min(loop.endTick, clock.secondsToTick(startSeconds + withinSeconds, rounding));
    return loop.startTick + iteration * (loop.endTick - loop.startTick) + tick - loop.startTick;
  }

  private currentAbsoluteTick(): number {
    return this.absoluteTickAtAudioTime(this.options.audio.currentTime, "floor");
  }

  private audioTimeAt(absoluteTick: number): number {
    return this.anchorAudioTime + this.secondsAt(absoluteTick) - this.secondsAt(this.anchorPosition);
  }

  private audioTimeAtSongUs(songUs: number, iteration: number): number {
    const loopSeconds = this.loop
      ? this.options.clock.secondsBetween(this.loop.startTick, this.loop.endTick) : 0;
    return this.anchorAudioTime + songUs / 1_000_000 + iteration * loopSeconds -
      this.secondsAt(this.anchorPosition);
  }

  private plan(start: number, end: number): Action[] {
    for (const [id, endTick] of this.scheduledAudioIds) {
      if (endTick <= start) this.scheduledAudioIds.delete(id);
    }
    const actions: Action[] = [];
    const remaining: Action[] = [];
    for (const off of this.pendingOffs) {
      if (off.at < end) actions.push(off);
      else remaining.push(off);
    }
    this.pendingOffs = remaining;
    actions.push(...this.planAutomation(Math.max(start, this.automationPlannedUntil), end));
    let absolute = start;
    while (absolute < end) {
      const loop = this.loop;
      const wrapped = loop ? wrapLoopTick(absolute, loop) : { tick: absolute, iteration: 0 };
      const segmentEnd = loop
        ? Math.min(end, absolute + (absolute < loop.startTick ? loop.startTick - absolute : loop.endTick - wrapped.tick))
        : end;
      const musicalEnd = wrapped.tick + segmentEnd - absolute;
      if (this.metronomeEnabled && this.options.sink.metronome) {
        this.planMetronome(wrapped.tick, musicalEnd, absolute, wrapped.iteration, actions);
      }
      const events = this.options.resolve(wrapped.tick, musicalEnd, wrapped.iteration);
      const seen = new Set<string>();
      for (const event of events) {
        validateEvent(event, wrapped.tick, musicalEnd);
        const dedupeKey = `${event.ownerPath}:${event.eventId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const audioId = `${wrapped.iteration}:${dedupeKey}`;
        if (event.kind === "audioClip" && this.scheduledAudioIds.has(audioId)) continue;
        const playTick = event.kind === "audioClip" ? Math.max(event.tick, wrapped.tick) : event.tick;
        const at = absolute + playTick - wrapped.tick;
        const ownerId = `${this.options.rootOwnerId}/${event.ownerPath}/iteration-${wrapped.iteration}/epoch-${this.epochValue}`;
        const base = { ...event, ownerId, absoluteTick: at, iteration: wrapped.iteration,
          epoch: this.epochValue, audioTime: this.audioTimeAt(at) };
        if (event.kind === "audioClip") {
          const clip = event as TimelineAudioClip;
          const clock = this.options.clock;
          const windowUs = Math.round(clock.tickToSeconds(playTick) * 1_000_000);
          const segmentStartUs = clip.segmentStartUs ??
            Math.round(clock.tickToSeconds(clip.tick) * 1_000_000);
          const segmentEndUs = clip.segmentEndUs ??
            Math.round(clock.tickToSeconds(clip.clipEndTick) * 1_000_000);
          const clipStartUs = clip.timeMode === "absolute" ? clip.absoluteStartUs!
            : Math.round(clock.tickToSeconds(clip.clipStartTick) * 1_000_000);
          // A projected absolute tick can be up to half a tick after its
          // microsecond origin. Only a true Seek/overlap resumes at the
          // window tick; a newly encountered segment starts at exact µs.
          const resumesAtWindow = clip.tick < wrapped.tick ||
            (absolute === this.anchorPosition && clip.tick === wrapped.tick);
          const playSongUs = resumesAtWindow
            ? Math.max(windowUs, segmentStartUs) : segmentStartUs;
          if (segmentEndUs <= playSongUs) {
            this.scheduledAudioIds.set(audioId, at + clip.clipEndTick - playTick);
            continue;
          }
          const elapsedSeconds = (playSongUs - clipStartUs) / 1_000_000;
          let endAudioTime = this.audioTimeAtSongUs(segmentEndUs, wrapped.iteration);
          if (loop && clip.tailPolicy === "cut" && at >= loop.startTick) {
            const boundary = absolute + loop.endTick - wrapped.tick;
            endAudioTime = Math.min(endAudioTime, this.audioTimeAt(boundary));
          }
          actions.push({ kind: "audioClip", at, sequence: event.sequence, id: event.eventId,
            event: { ...base, audioTime: this.audioTimeAtSongUs(playSongUs, wrapped.iteration),
              songTimeUs: playSongUs, elapsedSeconds, endAudioTime } as ScheduledAudioClip });
          this.scheduledAudioIds.set(audioId, at + clip.clipEndTick - playTick);
          continue;
        }
        if (event.kind === "authority") {
          actions.push({ kind: "authority", at, sequence: event.sequence, id: event.eventId,
            event: base as ScheduledAuthority });
          continue;
        }
        if (event.kind !== "note") {
          actions.push({ kind: "control", at, sequence: event.sequence, id: event.eventId,
            event: base as ScheduledControl });
          continue;
        }
        const note = event as TimelineNote;
        const attack: Attack = { handle: null };
        let offAt = at + note.durationTicks;
        if (loop && note.tailPolicy === "cut" && at >= loop.startTick) {
          const boundary = at + loop.endTick - wrapped.tick - (event.tick - wrapped.tick);
          offAt = Math.min(offAt, boundary);
        }
        const offWrapped = loop ? wrapLoopTick(offAt, loop) : { tick: offAt, iteration: 0 };
        const off: ScheduledNoteOff = {
          ...base, kind: "noteOff", tick: offWrapped.tick, absoluteTick: offAt,
          iteration: offWrapped.iteration, audioTime: this.audioTimeAt(offAt),
          pitch: note.pitch, releaseVelocity: note.releaseVelocity,
        };
        actions.push({ kind: "on", at, sequence: event.sequence, id: event.eventId,
          event: base as ScheduledNoteOn, attack, futureOff: offAt < end ? null : off });
        if (offAt < end) actions.push({ kind: "off", at: offAt, sequence: event.sequence,
          id: event.eventId, event: off, attack });
      }
      absolute = segmentEnd;
    }
    return actions;
  }

  private validateAutomation(event: TimelineAutomation, start: number, end: number): void {
    const target = event.target;
    if (!event.laneId || !Number.isSafeInteger(event.tick) || event.tick < start ||
        !Number.isSafeInteger(event.endTick) || event.endTick <= event.tick ||
        event.endTick > end || !Number.isSafeInteger(event.sequence) || event.sequence < 0 ||
        !Number.isFinite(event.startValue) || !Number.isFinite(event.endValue) ||
        (event.shape !== "step" && event.shape !== "linear") ||
        (target.scope === "track" && (!target.ownerId ||
          (target.parameterId !== "gainDb" && target.parameterId !== "pan"))) ||
        (target.scope === "master" && target.parameterId !== "masterGainDb") ||
        (target.scope !== "master" && target.scope !== "track")) {
      throw new RangeError("Evento de automatización inválido");
    }
  }

  private planAutomation(start: number, end: number): AutomationAction[] {
    if (!this.options.resolveAutomation || end <= start) return [];
    const actions: AutomationAction[] = [];
    let absolute = start;
    while (absolute < end) {
      const loop = this.loop;
      const wrapped = loop ? wrapLoopTick(absolute, loop) : { tick: absolute, iteration: 0 };
      const segmentEnd = loop
        ? Math.min(end, absolute + (absolute < loop.startTick ? loop.startTick - absolute :
          loop.endTick - wrapped.tick)) : end;
      const musicalEnd = wrapped.tick + segmentEnd - absolute;
      for (const event of this.options.resolveAutomation(wrapped.tick, musicalEnd, wrapped.iteration)) {
        this.validateAutomation(event, wrapped.tick, musicalEnd);
        const at = absolute + event.tick - wrapped.tick;
        const endAt = absolute + event.endTick - wrapped.tick;
        actions.push({ kind: "automation", at, sequence: event.sequence,
          id: `${event.laneId}:${wrapped.iteration}:${event.tick}:${event.endTick}`,
          event: { ...event, epoch: this.epochValue, iteration: wrapped.iteration,
            absoluteTick: at, audioTime: this.audioTimeAt(at),
            endAudioTime: this.audioTimeAt(endAt) } });
      }
      absolute = segmentEnd;
    }
    return actions;
  }

  private planMetronome(start: number, end: number, absoluteStart: number,
    iteration: number, actions: Action[]): void {
    let cursor = start;
    const meterMap = this.options.clock.meterMap;
    while (cursor < end) {
      const meter = this.options.clock.meterAt(cursor);
      const next = meterMap.find((point) => point.tick > cursor)?.tick ?? end;
      const segmentEnd = Math.min(end, next);
      const beatTicks = PROJECT_PPQ * 4 / meter.denominator;
      const firstBeatIndex = Math.ceil((cursor - meter.tick) / beatTicks);
      for (let index = firstBeatIndex; meter.tick + index * beatTicks < segmentEnd; index++) {
        const tick = meter.tick + index * beatTicks;
        const at = absoluteStart + tick - start;
        actions.push({ kind: "metronome", at, sequence: 0, id: `metro-${iteration}-${tick}`,
          event: { tick, absoluteTick: at, iteration, epoch: this.epochValue,
            audioTime: this.audioTimeAt(at), accent: index % meter.numerator === 0 } });
      }
      cursor = segmentEnd;
    }
  }
}
