import type { ProjectAudioRecordingPlan, ProjectDocumentV1, ProjectMixChannel } from "../project/model";
import { validateProjectAudioRecordingPlan } from "../project/audioRecordingPlan.ts";
import { createArrangementResolver, quantizeSceneLaunchTick } from "../composition/resolveProjectTimeline";
import { MusicalClock, type LoopRange, wrapLoopTick } from "../sequencer/musicalClock";
import { createBaseAutomationResolver, type AutomationValueSnapshot } from "../sequencer/automationResolver.ts";
import { TransportScheduler, type AudioClockSource, type TransportSnapshot } from "../sequencer/transportScheduler";
import type { TimelineAuthority, TimelineEvent, TimelineResolver } from "../sequencer/timelineEvents";
import { ProjectAudioSink, type ProjectAudioDiagnostics } from "./projectAudioSink";
import type { AudioCaptureStart, AudioCaptureTake, AudioInputSession } from "./audioInputSession";

export interface ProjectRecordingSchedule {
  readonly startAudioTime: number;
  readonly endAudioTime: number | null;
  readonly countInClicks: number;
  /** Resolves at the worklet-confirmed first captured frame. */
  readonly started: Promise<number>;
  /** Present for punch-out; resolves to the complete or interrupted take. */
  readonly completed: Promise<AudioCaptureTake | null> | null;
  cancel(reason?: string): void;
}

export interface ProjectPlaybackSnapshot {
  readonly transport: TransportSnapshot;
  readonly audio: ProjectAudioDiagnostics;
  readonly launcher: ProjectLauncherSnapshot;
  readonly automation: readonly AutomationValueSnapshot[];
}

export interface PerformedSceneSegment {
  readonly sceneId: string;
  readonly startTick: number;
  readonly endTick: number;
}

export interface ProjectLauncherSnapshot {
  readonly activeSceneId: string | null;
  readonly queuedSceneId: string | null;
  readonly queuedStartTick: number | null;
  readonly performedSceneSegments: readonly PerformedSceneSegment[];
  readonly performanceRevision: number;
}

export interface ArrangementSwapResult {
  /** First musical tick whose unscheduled events use the new revision. */
  readonly effectiveTick: number;
  readonly affectedTrackIds: readonly string[];
}

interface SceneInterval extends PerformedSceneSegment {
  readonly token: number;
  readonly resolver: TimelineResolver;
}

function sameSnapshot(left: unknown, right: unknown): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/** Runs the pure resolver against a single prepared project sink. */
export class ProjectPlayback {
  readonly sink: ProjectAudioSink;
  readonly scheduler: TransportScheduler;
  readonly projectId: string;
  private document: ProjectDocumentV1;
  private readonly audio: AudioClockSource;
  private loop: LoopRange | null;
  private arrangementResolver: TimelineResolver;
  private automationResolver: ReturnType<typeof createBaseAutomationResolver>;
  private intervals: SceneInterval[] = [];
  private performed: PerformedSceneSegment[] = [];
  private nextSceneToken = 0;
  private performanceRevisionValue = 0;
  private recordingToken = 0;
  private activeRecording: { readonly session: AudioInputSession;
    readonly schedule: ProjectRecordingSchedule } | null = null;
  private disposed = false;

  constructor(document: ProjectDocumentV1, sink: ProjectAudioSink,
    audio: AudioClockSource, resolver: TimelineResolver, loop?: LoopRange,
    autoPump = true) {
    if (document.id !== sink.projectId) throw new RangeError("project sink/document mismatch");
    this.projectId = document.id;
    this.document = document;
    this.audio = audio;
    this.loop = loop ?? null;
    this.arrangementResolver = resolver;
    const clock = new MusicalClock(document.tempoMap, document.meterMap);
    this.automationResolver = createBaseAutomationResolver(document, clock);
    this.sink = sink;
    this.scheduler = new TransportScheduler({
      rootOwnerId: sink.rootOwnerId, clock,
      audio, sink, resolve: (start, end, iteration) => this.resolve(start, end, iteration),
      resolveAutomation: (start, end, iteration) =>
        this.automationResolver(start, end, iteration),
      loop, autoPump,
    });
  }

  private currentAbsoluteTick(): number {
    return this.scheduler.positionAtAudioTime(this.audio.currentTime, "floor").absoluteTick;
  }

  private sceneAt(tick: number): SceneInterval | undefined {
    return this.intervals.find((interval) => interval.startTick <= tick && tick < interval.endTick);
  }

  private sceneTrackIds(sceneId: string | undefined): string[] {
    return sceneId ? [...new Set(this.document.scenes.find((scene) => scene.id === sceneId)
      ?.slots.map((slot) => slot.trackId) ?? [])] : [];
  }

  private interval(sceneId: string, startTick: number, endTick = Number.MAX_SAFE_INTEGER): SceneInterval {
    return { sceneId, startTick, endTick, token: ++this.nextSceneToken,
      resolver: createArrangementResolver(this.document, { launcher: {
        sceneId, startTick, stopTick: endTick === Number.MAX_SAFE_INTEGER ? undefined : endTick,
      } }),
    };
  }

  private rebuild(interval: SceneInterval, endTick: number): SceneInterval {
    return { ...this.interval(interval.sceneId, interval.startTick, endTick), token: interval.token };
  }

  private resolve(start: number, end: number, iteration: number): readonly TimelineEvent[] {
    const boundaries = new Set([start, end]);
    for (const interval of this.intervals) {
      if (interval.startTick > start && interval.startTick < end) boundaries.add(interval.startTick);
      if (interval.endTick > start && interval.endTick < end) boundaries.add(interval.endTick);
    }
    const points = [...boundaries].sort((left, right) => left - right);
    const events: TimelineEvent[] = [];
    for (let index = 0; index + 1 < points.length; index++) {
      const from = points[index]!;
      const to = points[index + 1]!;
      const active = this.sceneAt(from);
      events.push(...(active?.resolver ?? this.arrangementResolver)(from, to, iteration));
    }
    for (const tick of points) {
      if (tick < start || tick >= end) continue;
      const ending = this.intervals.find((interval) => interval.endTick === tick);
      const starting = this.intervals.find((interval) => interval.startTick === tick);
      if (!ending && !starting) continue;
      const trackIds = [...new Set([
        ...this.sceneTrackIds(ending?.sceneId), ...this.sceneTrackIds(starting?.sceneId),
      ])];
      if (!trackIds.length) continue;
      const authority: TimelineAuthority = { kind: "authority", sourceKind: "launcher",
        ownerPath: "authority/scene-switch", trackId: undefined,
        eventId: `authority:${tick}:${ending?.token ?? 0}:${starting?.token ?? 0}`,
        tick, sequence: 0, channel: 0, trackIds };
      events.push(authority);
    }
    return events;
  }

  private archiveEnded(throughTick: number, force = false): void {
    const remaining: SceneInterval[] = [];
    for (const interval of this.intervals) {
      const boundaryCommitted = force || this.scheduler.state !== "playing" ||
        interval.endTick < this.scheduler.scheduledUntilTick;
      if (interval.endTick <= throughTick && boundaryCommitted) {
        if (interval.endTick > interval.startTick) {
          this.performed.push({ sceneId: interval.sceneId,
            startTick: interval.startTick, endTick: interval.endTick });
          this.performanceRevisionValue++;
        }
      } else remaining.push(interval);
    }
    this.intervals = remaining;
  }

  private quantizedBoundary(sceneId: string, requestedTick?: number): number {
    const scene = this.document.scenes.find((entry) => entry.id === sceneId);
    if (!scene) throw new RangeError(`Escena inexistente: ${sceneId}`);
    const current = this.currentAbsoluteTick();
    if (requestedTick !== undefined && (!Number.isSafeInteger(requestedTick) || requestedTick < 0)) {
      throw new RangeError("Tick solicitado inválido");
    }
    let target = quantizeSceneLaunchTick(scene, Math.max(current, requestedTick ?? current));
    if (this.scheduler.state === "playing" && scene.launchQuantizationTicks > 0) {
      while (target < this.scheduler.scheduledUntilTick) target += scene.launchQuantizationTicks;
    }
    return target;
  }

  /** Queue a scene on the shared musical clock; returns its actual global boundary. */
  queueScene(sceneId: string, requestedTick?: number): number {
    if (this.disposed) throw new Error("Playback cerrado");
    const current = this.currentAbsoluteTick();
    this.archiveEnded(current);
    const launchTick = this.quantizedBoundary(sceneId, requestedTick);
    this.intervals = this.intervals.filter((interval) => interval.startTick < current);
    this.intervals = this.intervals.map((interval) => interval.endTick > current
      ? this.rebuild(interval, launchTick) : interval);
    this.intervals.push(this.interval(sceneId, launchTick));
    if (this.scheduler.state === "playing" && launchTick < this.scheduler.scheduledUntilTick) {
      // Immediate launch has no next quantum. Replan the project epoch only;
      // the live input registry has a different owner and keeps sounding.
      this.scheduler.seek(current);
    }
    return launchTick;
  }

  /** Quantized return to arrangement; an unstarted queued scene is cancelled. */
  stopScene(requestedTick?: number): number | null {
    if (this.disposed) return null;
    const current = this.currentAbsoluteTick();
    this.archiveEnded(current);
    this.intervals = this.intervals.filter((interval) => interval.startTick < current ||
      (interval.startTick === current && this.scheduler.state === "playing"));
    const active = this.sceneAt(current);
    if (!active) return null;
    const stopTick = this.quantizedBoundary(active.sceneId, requestedTick);
    this.intervals = this.intervals.map((interval) => interval === active
      ? this.rebuild(interval, stopTick) : interval);
    if (this.scheduler.state === "playing" && stopTick < this.scheduler.scheduledUntilTick) {
      this.scheduler.seek(current);
    }
    this.archiveEnded(current);
    return stopTick;
  }

  performedSceneSegments(): readonly PerformedSceneSegment[] {
    this.archiveEnded(this.currentAbsoluteTick());
    return [...this.performed];
  }

  clearPerformedSceneSegments(): void { this.performed = []; }

  launchSnapshot(): ProjectLauncherSnapshot {
    const current = this.currentAbsoluteTick();
    this.archiveEnded(current);
    const candidate = this.sceneAt(current);
    const active = this.scheduler.state === "playing" && candidate &&
      candidate.startTick < this.scheduler.scheduledUntilTick ? candidate
      : this.scheduler.state === "paused" ? this.intervals.find((interval) =>
        interval.startTick < current && current < interval.endTick) : undefined;
    const queued = this.intervals.find((interval) => interval.startTick > current ||
      (interval.startTick <= current && interval === candidate && !active));
    return { activeSceneId: active?.sceneId ?? null,
      queuedSceneId: queued?.sceneId ?? null, queuedStartTick: queued?.startTick ?? null,
      performedSceneSegments: [...this.performed], performanceRevision: this.performanceRevisionValue };
  }

  private finishPerformance(): void {
    const current = this.currentAbsoluteTick();
    this.intervals = this.intervals.map((interval) => interval.startTick < current &&
      interval.endTick > current ? this.rebuild(interval, current) : interval);
    this.archiveEnded(current, true);
    this.intervals = [];
  }

  /** Replace only composition data; keep clock, buses, voices and current tick. */
  replaceArrangementRevision(next: ProjectDocumentV1): ArrangementSwapResult {
    if (this.disposed) throw new Error("Playback cerrado");
    const previous = this.document;
    if (next.id !== previous.id || next.ppq !== previous.ppq ||
        !sameSnapshot(next.tempoMap, previous.tempoMap) ||
        !sameSnapshot(next.meterMap, previous.meterMap) ||
        !sameSnapshot(next.trackOrder, previous.trackOrder) ||
        !sameSnapshot(next.tracks, previous.tracks) ||
        !sameSnapshot(next.assets, previous.assets) ||
        !sameSnapshot(next.mix, previous.mix) ||
        !sameSnapshot(next.scenes, previous.scenes) ||
        !sameSnapshot(next.automation, previous.automation) ||
        !sameSnapshot(next.clips.filter((clip) => clip.kind === "audio"),
          previous.clips.filter((clip) => clip.kind === "audio"))) {
      throw new Error("Edición requiere preparar audio de nuevo: tempo, pistas, banco, mezcla, escena o clip audio cambió");
    }
    const nextResolver = createArrangementResolver(next);
    const nextIntervals = this.intervals.map((interval) => ({ ...interval,
      resolver: createArrangementResolver(next, { launcher: {
        sceneId: interval.sceneId, startTick: interval.startTick,
        stopTick: interval.endTick === Number.MAX_SAFE_INTEGER ? undefined : interval.endTick,
      } }),
    }));
    const previousClips = new Map(previous.clips.map((clip) => [clip.id, clip]));
    const nextClips = new Map(next.clips.map((clip) => [clip.id, clip]));
    const affected = new Set<string>();
    for (const id of new Set([...previousClips.keys(), ...nextClips.keys()])) {
      const before = previousClips.get(id);
      const after = nextClips.get(id);
      if (!sameSnapshot(before, after)) {
        if (before) affected.add(before.trackId);
        if (after) affected.add(after.trackId);
      }
    }
    const previousPatterns = new Map(previous.patterns.map((pattern) => [pattern.id, pattern]));
    const nextPatterns = new Map(next.patterns.map((pattern) => [pattern.id, pattern]));
    const changedPatternIds = new Set([...previousPatterns.keys(), ...nextPatterns.keys()]
      .filter((id) => !sameSnapshot(previousPatterns.get(id), nextPatterns.get(id))));
    for (const clip of [...previous.clips, ...next.clips]) {
      if (clip.kind === "pattern" && changedPatternIds.has(clip.sourceId)) {
        affected.add(clip.trackId);
      }
    }
    for (const scene of next.scenes) for (const slot of scene.slots) {
      if (changedPatternIds.has(slot.patternId)) affected.add(slot.trackId);
    }
    // Commit the old lookahead first; no previously started voice is cut.
    if (this.scheduler.state === "playing") this.scheduler.pump();
    const effectiveTick = this.scheduler.state === "playing"
      ? this.scheduler.scheduledUntilTick : this.currentAbsoluteTick();
    this.document = next;
    this.arrangementResolver = nextResolver;
    this.intervals = nextIntervals;
    return { effectiveTick, affectedTrackIds: [...affected].sort() };
  }

  /** Commit a validated mix-only revision to this sink and its resolver snapshot. */
  syncLiveMixRevision(next: ProjectDocumentV1): number {
    if (this.disposed) throw new Error("Playback cerrado");
    const previous = this.document;
    if (next.id !== previous.id || next.ppq !== previous.ppq ||
        !sameSnapshot(next.tempoMap, previous.tempoMap) ||
        !sameSnapshot(next.meterMap, previous.meterMap) ||
        !sameSnapshot(next.trackOrder, previous.trackOrder) ||
        !sameSnapshot(next.assets, previous.assets) ||
        !sameSnapshot(next.patterns, previous.patterns) ||
        !sameSnapshot(next.clips, previous.clips) ||
        !sameSnapshot(next.scenes, previous.scenes) ||
        !sameSnapshot(next.automation, previous.automation) ||
        !sameSnapshot(next.mix.masterEffects, previous.mix.masterEffects) ||
        next.tracks.length !== previous.tracks.length) {
      throw new Error("Sincronización live admite sólo ganancia, pan, mute, solo y armado");
    }
    for (let index = 0; index < next.tracks.length; index++) {
      const before = previous.tracks[index]!;
      const after = next.tracks[index]!;
      const { mix: beforeMix, ...beforeBase } = before;
      const { mix: afterMix, ...afterBase } = after;
      if (!sameSnapshot(beforeBase, afterBase) ||
          !sameSnapshot(beforeMix.outputBusTrackId, afterMix.outputBusTrackId) ||
          !sameSnapshot(beforeMix.sends, afterMix.sends) ||
          !sameSnapshot(beforeMix.effects, afterMix.effects)) {
        throw new Error("Sincronización live no admite cambiar ruta, banco o efectos");
      }
    }
    const nextResolver = createArrangementResolver(next);
    const nextAutomation = createBaseAutomationResolver(next,
      new MusicalClock(next.tempoMap, next.meterMap));
    const nextIntervals = this.intervals.map((interval) => ({ ...interval,
      resolver: createArrangementResolver(next, { launcher: {
        sceneId: interval.sceneId, startTick: interval.startTick,
        stopTick: interval.endTick === Number.MAX_SAFE_INTEGER ? undefined : interval.endTick,
      } }),
    }));
    if (this.scheduler.state === "playing") this.scheduler.pump();
    for (let index = 0; index < next.tracks.length; index++) {
      const before = previous.tracks[index]!.mix;
      const after = next.tracks[index]!.mix;
      const patch: { gainDb?: number; pan?: number; mute?: boolean; solo?: boolean } = {};
      if (before.gainDb !== after.gainDb) patch.gainDb = after.gainDb;
      if (before.pan !== after.pan) patch.pan = after.pan;
      if (before.mute !== after.mute) patch.mute = after.mute;
      if (before.solo !== after.solo) patch.solo = after.solo;
      if (Object.keys(patch).length) this.sink.setTrackMix(next.tracks[index]!.id, patch);
    }
    if (previous.mix.masterGainDb !== next.mix.masterGainDb) {
      this.sink.setMasterGainDb(next.mix.masterGainDb);
    }
    this.document = next;
    this.arrangementResolver = nextResolver;
    this.automationResolver = nextAutomation;
    this.intervals = nextIntervals;
    this.scheduler.replanAutomation();
    return this.scheduler.state === "playing" ? this.scheduler.scheduledUntilTick
      : this.currentAbsoluteTick();
  }

  /** Change only persisted base automation without replaying or cutting MIDI voices. */
  replaceAutomationRevision(next: ProjectDocumentV1): number {
    if (this.disposed) throw new Error("Playback cerrado");
    const previous = this.document;
    if (!sameSnapshot({ ...previous, automation: next.automation, updatedAt: next.updatedAt }, next)) {
      throw new Error("Cambio de automatización incluye edición que exige preparar audio de nuevo");
    }
    const resolver = createBaseAutomationResolver(next,
      new MusicalClock(next.tempoMap, next.meterMap));
    this.document = next;
    this.automationResolver = resolver;
    this.scheduler.replanAutomation();
    return this.scheduler.state === "playing" ? this.scheduler.scheduledUntilTick
      : this.currentAbsoluteTick();
  }

  play(tick?: number): boolean {
    if (this.disposed) return false;
    this.cancelRecording("transport-restarted");
    return tick === undefined ? this.scheduler.resume() : this.scheduler.start(tick);
  }

  pause(): void { this.cancelRecording("transport-paused"); this.scheduler.pause(); }
  stop(): void { this.cancelRecording("transport-stopped"); this.finishPerformance(); this.scheduler.stop(); }
  seek(tick: number): void {
    this.cancelRecording("transport-seek"); this.finishPerformance(); this.scheduler.seek(tick);
  }

  /** Schedules count-in and capture against one AudioContext clock, never a React timer. */
  scheduleRecording(session: AudioInputSession, plan: ProjectAudioRecordingPlan,
    capture: Omit<AudioCaptureStart, "startTick" | "startProjectUs" | "audioTime" | "punch">,
    sampleRate: number): ProjectRecordingSchedule {
    if (this.activeRecording && !["starting", "recording", "stopping"]
      .includes(this.activeRecording.session.state)) this.activeRecording = null;
    if (this.disposed || this.activeRecording || session.state !== "armed" ||
        !Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
      throw new Error("Grabación de proyecto no armada o ya programada");
    }
    validateProjectAudioRecordingPlan(this.document, plan);
    const clock = new MusicalClock(this.document.tempoMap, this.document.meterMap);
    const musicalStartTick = this.loop ? wrapLoopTick(plan.startTick, this.loop).tick : plan.startTick;
    const meter = clock.meterAt(musicalStartTick);
    const tempo = clock.tempoAt(musicalStartTick);
    const beatSeconds = tempo.microsPerQuarter * 4 / meter.denominator / 1_000_000;
    const countInBeats = plan.countInBars * meter.numerator;
    const countInSeconds = countInBeats * beatSeconds;
    const plannedProjectUs = this.scheduler.projectUsAtAbsoluteTick(plan.startTick);
    const projectedStartTick = clock.secondsToTick(plannedProjectUs / 1_000_000, "nearest");
    const punchSeconds = plan.punch
      ? (this.scheduler.projectUsAtAbsoluteTick(plan.punch.endTick) - plannedProjectUs) / 1_000_000 : 0;
    const projectedEndTick = plan.punch ? Math.max(projectedStartTick + 1,
      clock.secondsToTick(this.scheduler.projectUsAtAbsoluteTick(plan.punch.endTick) / 1_000_000,
        "nearest")) : null;
    const now = this.audio.currentTime;
    const wasPlaying = this.scheduler.state === "playing";
    let startAudioTime: number;
    if (wasPlaying) {
      startAudioTime = this.scheduler.audioTimeAtAbsoluteTick(plan.startTick);
    } else {
      startAudioTime = now + 0.08 + countInSeconds;
    }
    startAudioTime = Math.ceil(startAudioTime * sampleRate) / sampleRate;
    const endAudioTime = plan.punch ? startAudioTime + punchSeconds : null;
    if (startAudioTime - countInSeconds < now + 0.035 ||
        (endAudioTime ?? startAudioTime) > now + 59.9 ||
        (endAudioTime !== null && Math.round(endAudioTime * sampleRate) <=
          Math.round(startAudioTime * sampleRate))) {
      throw new RangeError("No hay margen de AudioContext para count-in y punch dentro de 60 s");
    }
    if (countInBeats && !this.sink.diagnostics().metronome.ready) {
      throw new Error("Muestra grabada del metrónomo no disponible para count-in");
    }
    const ownerId = `count-in/${this.projectId}/${++this.recordingToken}`;
    let countInClicks = 0;
    try {
      // When the transport's metronome is already audible, reuse it instead
      // of layering a second click over the same beats.
      if (!(wasPlaying && this.scheduler.isMetronomeEnabled)) {
        for (let beat = 0; beat < countInBeats; beat++) {
          const at = startAudioTime - countInSeconds + beat * beatSeconds;
          if (!this.sink.countInClick(at, beat % meter.numerator === 0, ownerId)) {
            throw new Error("No se pudo programar click grabado de count-in");
          }
          countInClicks++;
        }
      }
      if (!wasPlaying && !this.scheduler.startAt(plan.startTick, startAudioTime)) {
        throw new Error("El transporte no tiene dueño de audio para count-in");
      }
      const punch = plan.punch && endAudioTime !== null ? {
        startTick: projectedStartTick, endTick: projectedEndTick!,
        startAudioTime, endAudioTime,
      } : undefined;
      const started = session.start({ ...capture, startTick: projectedStartTick,
        startProjectUs: plannedProjectUs,
        audioTime: startAudioTime, ...(punch ? { punch } : {}) });
      const completed = endAudioTime === null ? null : session.stop(endAudioTime);
      const schedule: ProjectRecordingSchedule = {
        startAudioTime, endAudioTime, countInClicks, started, completed,
        cancel: (reason = "recording-cancelled") => {
          if (this.activeRecording?.schedule !== schedule) return;
          const beforeFirstFrame = session.state === "starting" &&
            this.audio.currentTime < startAudioTime;
          this.activeRecording = null;
          this.sink.cancelCountIn(ownerId);
          session.interrupt(reason);
          if (!wasPlaying && beforeFirstFrame) this.scheduler.stop();
        },
      };
      this.activeRecording = { session, schedule };
      void started.catch(() => {
        if (this.activeRecording?.schedule === schedule) {
          this.activeRecording = null;
          this.sink.cancelCountIn(ownerId);
          if (!wasPlaying) this.scheduler.stop();
        }
      });
      if (completed) void completed.then(() => {
        if (this.activeRecording?.schedule === schedule) this.activeRecording = null;
      }, () => {
        if (this.activeRecording?.schedule === schedule) this.activeRecording = null;
      });
      return schedule;
    } catch (error) {
      this.sink.cancelCountIn(ownerId);
      if (!wasPlaying) this.scheduler.stop();
      throw error;
    }
  }

  cancelRecording(reason = "recording-cancelled", session?: AudioInputSession): void {
    if (session && this.activeRecording?.session !== session) return;
    this.activeRecording?.schedule.cancel(reason);
  }
  positionAtAudioTime(audioTime: number): ReturnType<TransportScheduler["positionAtAudioTime"]> {
    return this.scheduler.positionAtAudioTime(audioTime);
  }
  setLoopRange(range: LoopRange | null): void {
    this.scheduler.setLoopRange(range);
    this.loop = range;
  }
  setMetronomeEnabled(enabled: boolean): void { this.scheduler.setMetronomeEnabled(enabled); }
  setTrackMute(trackId: string, muted: boolean): void { this.sink.setTrackMute(trackId, muted); }
  setTrackSolo(trackId: string, solo: boolean): void { this.sink.setTrackSolo(trackId, solo); }
  setTrackMix(trackId: string,
    patch: Partial<Pick<ProjectMixChannel, "gainDb" | "pan" | "mute" | "solo">>): void {
    this.sink.setTrackMix(trackId, patch);
  }
  setMasterGainDb(gainDb: number): void { this.sink.setMasterGainDb(gainDb); }

  /** A physical/Touch gesture temporarily outranks read automation for one lane only. */
  setAutomationLiveOverride(laneId: string, value: number): void {
    const lane = this.document.automation.find((item) => item.id === laneId);
    if (!lane) throw new RangeError(`Curva de automatización inexistente: ${laneId}`);
    this.sink.setAutomationLiveOverride(lane.target, value);
  }

  /** Return a released physical control to the current read/base value and re-arm timeline lookahead. */
  releaseAutomationLiveOverride(laneId: string): void {
    const lane = this.document.automation.find((item) => item.id === laneId);
    if (!lane) throw new RangeError(`Curva de automatización inexistente: ${laneId}`);
    const tick = this.scheduler.snapshot().tick;
    const snapshot = this.automationResolver.snapshot(tick).find((item) => item.laneId === laneId);
    if (!snapshot) throw new RangeError(`Curva no reproducible: ${laneId}`);
    this.sink.releaseAutomationLiveOverride(lane.target, snapshot.value);
    this.scheduler.replanAutomation();
  }

  automationSnapshot(): readonly AutomationValueSnapshot[] {
    return this.automationResolver.snapshot(this.scheduler.snapshot().tick).map((snapshot) => {
      const physical = this.sink.automationLiveOverrideValue(snapshot.target);
      return physical === null ? snapshot
        : { ...snapshot, value: physical, owner: "physical" as const };
    });
  }
  setRackPadMute(trackId: string, padId: string, muted: boolean): void {
    this.sink.setRackPadMute(trackId, padId, muted);
  }
  setRackPadSolo(trackId: string, padId: string, solo: boolean): void {
    this.sink.setRackPadSolo(trackId, padId, solo);
  }
  snapshot(): ProjectPlaybackSnapshot {
    return { transport: this.scheduler.snapshot(), audio: this.sink.diagnostics(),
      launcher: this.launchSnapshot(), automation: this.automationSnapshot() };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelRecording("playback-disposed");
    this.scheduler.dispose();
    this.sink.retire();
  }
}
