import type { ProjectClip, ProjectDocumentV1, ProjectDrumPad, ProjectExpressionEvent, ProjectNote, ProjectPattern,
  ProjectScene } from "../project/model.ts";
import { MusicalClock } from "../sequencer/musicalClock.ts";
import type { TimelineAudioClip, TimelineEvent, TimelineResolver } from "../sequencer/timelineEvents.ts";

export interface LauncherAuthority {
  readonly sceneId: string;
  /** Already quantized by the coordinator. A zero scene quantization launches immediately. */
  readonly startTick: number;
  readonly stopTick?: number;
}

export interface ArrangementMode {
  readonly launcher?: LauncherAuthority;
  /** Explicit probability seed for a reproducible export; omitted preserves the project-ID seed. */
  readonly probabilitySeed?: string;
}

interface PatternInstance {
  readonly id: string;
  readonly trackId: string;
  readonly ownerPath: string;
  readonly sourceKind: "arrangement" | "launcher";
  readonly startTick: number;
  readonly endTick: number;
  readonly sourceOffsetTick: number;
  readonly loopMode: "none" | "loop";
  readonly tailPolicy: "cut" | "continue";
  readonly transpose: number;
  readonly gainDb: number;
  readonly pattern: ProjectPattern;
  readonly drumPads?: ReadonlyMap<string, ProjectDrumPad>;
}

interface AudioSegment {
  readonly clip: Extract<ProjectClip, { kind: "audio" }>;
  readonly startUs: number;
  readonly endUs: number;
}

interface AudioBounds {
  readonly startUs: number;
  readonly endUs: number;
}

interface AudioFade {
  readonly id: string;
  readonly outgoing: Extract<ProjectClip, { kind: "audio" }>;
  readonly incoming: Extract<ProjectClip, { kind: "audio" }>;
  readonly startUs: number;
  readonly endUs: number;
  readonly curve: "linear" | "equalPower";
}

interface AuthoritySegment {
  readonly clip: ProjectClip;
  readonly startTick: number;
  readonly endTick: number;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function randomUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export function quantizeSceneLaunchTick(scene: ProjectScene, requestedTick: number): number {
  if (!Number.isSafeInteger(requestedTick) || requestedTick < 0) throw new RangeError("Tick de lanzamiento inválido");
  const quantum = scene.launchQuantizationTicks;
  if (!Number.isSafeInteger(quantum) || quantum < 0) throw new RangeError("Cuantización de escena inválida");
  return quantum === 0 ? requestedTick : Math.ceil(requestedTick / quantum) * quantum;
}

function sequenceForNote(note: ProjectNote, index: number, ratchetIndex: number): number {
  const original = note.origin.sourceSequence;
  return (original !== undefined && Number.isSafeInteger(original) && original >= 0 ? original : index) * 65 + ratchetIndex;
}

/** Immutable project snapshot in, bounded event window out; no DOM, storage or AudioContext work. */
export function createArrangementResolver(document: ProjectDocumentV1, mode: ArrangementMode = {}): TimelineResolver {
  if (mode.probabilitySeed !== undefined &&
      (typeof mode.probabilitySeed !== "string" || mode.probabilitySeed.length > 128)) {
    throw new RangeError("Semilla de probabilidad inválida");
  }
  const probabilitySeed = mode.probabilitySeed ?? document.id;
  const clock = new MusicalClock(document.tempoMap, document.meterMap);
  const patterns = new Map(document.patterns.map((pattern) => [pattern.id, pattern]));
  const tracks = new Map(document.tracks.map((track) => [track.id, track]));
  const audioClips = new Map<string, Extract<ProjectClip, { kind: "audio" }>>();
  const audioBounds = new Map<string, AudioBounds>();
  for (const clip of document.clips) {
    if (clip.kind !== "audio") continue;
    if (clip.loopMode !== "none" || clip.sourceOffsetTick !== 0 || clip.transpose !== 0) {
      throw new RangeError(`Clip de audio ${clip.id}: loop, offset o transposición no admitidos`);
    }
    const startUs = clip.timeMode === "absolute" ? clip.absoluteStartUs :
      Math.round(clock.tickToSeconds(clip.startTick) * 1_000_000);
    const endUs = clip.timeMode === "absolute" ? clip.absoluteEndUs :
      Math.round(clock.tickToSeconds(clip.startTick + clip.lengthTicks) * 1_000_000);
    if (startUs === undefined || endUs === undefined ||
        !Number.isSafeInteger(startUs) || !Number.isSafeInteger(endUs) ||
        startUs < 0 || endUs <= startUs) throw new RangeError(`Rango de audio inválido en clip ${clip.id}`);
    audioClips.set(clip.id, clip);
    audioBounds.set(clip.id, { startUs, endUs });
  }
  const audioFades: AudioFade[] = (document.audioCrossfades ?? []).map((fade) => {
    const outgoing = audioClips.get(fade.outgoingClipId);
    const incoming = audioClips.get(fade.incomingClipId);
    const outBounds = audioBounds.get(fade.outgoingClipId);
    const inBounds = audioBounds.get(fade.incomingClipId);
    if (!outgoing || !incoming || !outBounds || !inBounds ||
        outBounds.startUs >= inBounds.startUs || outBounds.endUs <= inBounds.startUs ||
        outBounds.endUs >= inBounds.endUs || outgoing.trackId !== incoming.trackId) {
      throw new RangeError(`Crossfade de audio inválido: ${fade.id}`);
    }
    return { id: fade.id, outgoing, incoming, startUs: inBounds.startUs,
      endUs: outBounds.endUs, curve: fade.curve };
  });
  const fadeRamps = new Map<string, NonNullable<TimelineAudioClip["crossfades"]>[number][]>();
  for (const fade of audioFades) {
    for (const [clip, role] of [[fade.outgoing, "out"], [fade.incoming, "in"]] as const) {
      const ramps = fadeRamps.get(clip.id) ?? [];
      ramps.push({ id: fade.id, role, startUs: fade.startUs,
        endUs: fade.endUs, curve: fade.curve });
      fadeRamps.set(clip.id, ramps);
    }
  }
  for (const ramps of fadeRamps.values()) ramps.sort((left, right) =>
    left.startUs - right.startUs || left.id.localeCompare(right.id));
  const anySolo = document.tracks.some((track) => track.mix.solo && !track.mix.mute);
  const audible = (trackId: string): boolean => {
    const track = tracks.get(trackId);
    return !!track && !track.mix.mute && (!anySolo || track.mix.solo);
  };
  const arrangementClips = new Map<string, ProjectClip[]>();
  const arrangement: PatternInstance[] = [];
  for (const clip of document.clips) {
    if (clip.muted || !audible(clip.trackId)) continue;
    const list = arrangementClips.get(clip.trackId) ?? [];
    list.push(clip);
    arrangementClips.set(clip.trackId, list);
    if (clip.kind !== "pattern") continue;
    const pattern = patterns.get(clip.sourceId);
    if (!pattern) throw new RangeError(`Patrón faltante para clip ${clip.id}`);
    if (clip.sourceVersion !== pattern.version || clip.sourceOffsetTick >= pattern.lengthTicks) {
      throw new RangeError(`Versión u offset inválido en clip ${clip.id}`);
    }
    const rack = tracks.get(clip.trackId)?.drumRack;
    arrangement.push({ id: clip.id, trackId: clip.trackId,
      ownerPath: `track/${clip.trackId}/clip/${clip.id}`, sourceKind: "arrangement",
      startTick: clip.startTick, endTick: clip.startTick + clip.lengthTicks,
      sourceOffsetTick: clip.sourceOffsetTick, loopMode: clip.loopMode,
      tailPolicy: clip.tailPolicy, transpose: clip.transpose, gainDb: clip.gainDb, pattern,
      drumPads: rack ? new Map(rack.pads.map((pad) => [`${pad.channel}:${pad.midiNote}`, pad])) : undefined });
  }
  for (const list of arrangementClips.values()) {
    list.sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id));
  }

  const launch = mode.launcher;
  let launcher: PatternInstance[] = [];
  const launcherTrackIds = new Set<string>();
  if (launch) {
    if (!Number.isSafeInteger(launch.startTick) || launch.startTick < 0 ||
        (launch.stopTick !== undefined && (!Number.isSafeInteger(launch.stopTick) || launch.stopTick <= launch.startTick))) {
      throw new RangeError("Rango de launcher inválido");
    }
    const scene = document.scenes.find((item) => item.id === launch.sceneId);
    if (!scene) throw new RangeError(`Escena inexistente: ${launch.sceneId}`);
    launcher = scene.slots.filter((slot) => audible(slot.trackId)).map((slot) => {
      const pattern = patterns.get(slot.patternId);
      if (!pattern) throw new RangeError(`Patrón faltante en escena ${scene.id}`);
      const rack = tracks.get(slot.trackId)?.drumRack;
      launcherTrackIds.add(slot.trackId);
      return { id: `${scene.id}:${slot.id}`, trackId: slot.trackId,
        ownerPath: `track/${slot.trackId}/launcher/${scene.id}/slot/${slot.id}`,
        sourceKind: "launcher", startTick: launch.startTick,
        endTick: launch.stopTick ?? Number.MAX_SAFE_INTEGER,
        sourceOffsetTick: 0, loopMode: "loop", tailPolicy: "cut",
        transpose: 0, gainDb: 0, pattern,
        drumPads: rack ? new Map(rack.pads.map((pad) => [`${pad.channel}:${pad.midiNote}`, pad])) : undefined };
    });
  }

  const launcherOwns = (trackId: string, tick: number): boolean =>
    !!launch && launcherTrackIds.has(trackId) && tick >= launch.startTick &&
    tick < (launch.stopTick ?? Number.MAX_SAFE_INTEGER);

  const authoritySegments = new Map<string, AuthoritySegment[]>();
  const audioSegments: AudioSegment[] = [];
  for (const [trackId, clips] of arrangementClips) {
    const changes = new Map<number, { starts: ProjectClip[]; ends: ProjectClip[] }>();
    const changeAt = (tick: number): { starts: ProjectClip[]; ends: ProjectClip[] } => {
      let change = changes.get(tick);
      if (!change) { change = { starts: [], ends: [] }; changes.set(tick, change); }
      return change;
    };
    for (const clip of clips) {
      changeAt(clip.startTick).starts.push(clip);
      changeAt(clip.startTick + clip.lengthTicks).ends.push(clip);
    }
    if (launch && launcherTrackIds.has(trackId)) {
      changeAt(launch.startTick);
      if (launch.stopTick !== undefined) changeAt(launch.stopTick);
    }
    const ticks = [...changes.keys()].sort((a, b) => a - b);
    const active = new Set<string>();
    const heap: ProjectClip[] = [];
    const segments: AuthoritySegment[] = [];
    const outranks = (left: ProjectClip, right: ProjectClip): boolean =>
      left.startTick > right.startTick || (left.startTick === right.startTick && left.id > right.id);
    const push = (clip: ProjectClip): void => {
      heap.push(clip);
      for (let index = heap.length - 1; index > 0;) {
        const parent = Math.floor((index - 1) / 2);
        if (!outranks(heap[index]!, heap[parent]!)) break;
        [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
        index = parent;
      }
    };
    const pop = (): void => {
      const last = heap.pop();
      if (!last || heap.length === 0) return;
      heap[0] = last;
      for (let index = 0; ;) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        const child = right < heap.length && outranks(heap[right]!, heap[left]!) ? right : left;
        if (!outranks(heap[child]!, heap[index]!)) break;
        [heap[index], heap[child]] = [heap[child]!, heap[index]!];
        index = child;
      }
    };
    for (let index = 0; index + 1 < ticks.length; index += 1) {
      const tick = ticks[index]!;
      const change = changes.get(tick)!;
      for (const clip of change.ends) active.delete(clip.id);
      for (const clip of change.starts) { active.add(clip.id); push(clip); }
      while (heap.length && !active.has(heap[0]!.id)) pop();
      const next = ticks[index + 1]!;
      const winner = heap[0];
      if (next <= tick || !winner) continue;
      const lastAuthority = segments[segments.length - 1];
      if (lastAuthority?.clip.id === winner.id && lastAuthority.endTick === tick) {
        segments[segments.length - 1] = { ...lastAuthority, endTick: next };
      } else segments.push({ clip: winner, startTick: tick, endTick: next });
    }
    authoritySegments.set(trackId, segments);
  }

  // Audio authority is resolved in song-zero microseconds. An absolute clip can
  // start between project ticks, and a declared crossfade keeps both owners alive.
  for (const [trackId, clips] of arrangementClips) {
    const trackAudio = clips.filter((clip): clip is Extract<ProjectClip, { kind: "audio" }> =>
      clip.kind === "audio");
    if (!trackAudio.length) continue;
    const trackFades = audioFades.filter((fade) => fade.outgoing.trackId === trackId);
    type Change = { starts: typeof trackAudio; ends: typeof trackAudio;
      fadeStarts: AudioFade[]; fadeEnds: AudioFade[] };
    const changes = new Map<number, Change>();
    const changeAt = (us: number): Change => {
      let change = changes.get(us);
      if (!change) {
        change = { starts: [], ends: [], fadeStarts: [], fadeEnds: [] };
        changes.set(us, change);
      }
      return change;
    };
    for (const clip of trackAudio) {
      const bounds = audioBounds.get(clip.id)!;
      changeAt(bounds.startUs).starts.push(clip);
      changeAt(bounds.endUs).ends.push(clip);
    }
    for (const fade of trackFades) {
      changeAt(fade.startUs).fadeStarts.push(fade);
      changeAt(fade.endUs).fadeEnds.push(fade);
    }
    const launchStartUs = launch && launcherTrackIds.has(trackId)
      ? Math.round(clock.tickToSeconds(launch.startTick) * 1_000_000) : null;
    const launchEndUs = launchStartUs !== null && launch?.stopTick !== undefined
      ? Math.round(clock.tickToSeconds(launch.stopTick) * 1_000_000) : null;
    if (launchStartUs !== null) changeAt(launchStartUs);
    if (launchEndUs !== null) changeAt(launchEndUs);
    const moments = [...changes.keys()].sort((left, right) => left - right);
    const active = new Set<string>();
    const activeFades = new Map<string, AudioFade>();
    const heap: typeof trackAudio = [];
    const outranks = (left: (typeof trackAudio)[number], right: (typeof trackAudio)[number]): boolean => {
      const leftStart = audioBounds.get(left.id)!.startUs;
      const rightStart = audioBounds.get(right.id)!.startUs;
      return leftStart > rightStart || (leftStart === rightStart && left.id > right.id);
    };
    const push = (clip: (typeof trackAudio)[number]): void => {
      heap.push(clip);
      for (let index = heap.length - 1; index > 0;) {
        const parent = Math.floor((index - 1) / 2);
        if (!outranks(heap[index]!, heap[parent]!)) break;
        [heap[index], heap[parent]] = [heap[parent]!, heap[index]!];
        index = parent;
      }
    };
    const pop = (): void => {
      const last = heap.pop();
      if (!last || !heap.length) return;
      heap[0] = last;
      for (let index = 0; ;) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        const child = right < heap.length && outranks(heap[right]!, heap[left]!) ? right : left;
        if (!outranks(heap[child]!, heap[index]!)) break;
        [heap[index], heap[child]] = [heap[child]!, heap[index]!];
        index = child;
      }
    };
    const perClip = new Map<string, AudioSegment[]>();
    const add = (clip: (typeof trackAudio)[number], startUs: number, endUs: number): void => {
      const list = perClip.get(clip.id) ?? [];
      const previous = list[list.length - 1];
      if (previous?.endUs === startUs) list[list.length - 1] = { clip, startUs: previous.startUs, endUs };
      else list.push({ clip, startUs, endUs });
      perClip.set(clip.id, list);
    };
    for (let index = 0; index + 1 < moments.length; index += 1) {
      const us = moments[index]!;
      const change = changes.get(us)!;
      for (const clip of change.ends) active.delete(clip.id);
      for (const fade of change.fadeEnds) activeFades.delete(fade.id);
      for (const clip of change.starts) { active.add(clip.id); push(clip); }
      for (const fade of change.fadeStarts) activeFades.set(fade.id, fade);
      while (heap.length && !active.has(heap[0]!.id)) pop();
      const next = moments[index + 1]!;
      if (next <= us || !heap.length ||
          (launchStartUs !== null && us >= launchStartUs &&
            (launchEndUs === null || us < launchEndUs))) continue;
      const selected = new Map<string, (typeof trackAudio)[number]>();
      selected.set(heap[0]!.id, heap[0]!);
      for (const fade of activeFades.values()) {
        if (active.has(fade.outgoing.id)) selected.set(fade.outgoing.id, fade.outgoing);
        if (active.has(fade.incoming.id)) selected.set(fade.incoming.id, fade.incoming);
      }
      for (const clip of selected.values()) add(clip, us, next);
    }
    for (const segments of perClip.values()) audioSegments.push(...segments);
  }
  audioSegments.sort((left, right) => left.startUs - right.startUs ||
    left.clip.id.localeCompare(right.clip.id) || left.endUs - right.endUs);

  const dominantSegment = (trackId: string, tick: number): AuthoritySegment | undefined => {
    const segments = authoritySegments.get(trackId) ?? [];
    let low = 0;
    let high = segments.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const segment = segments[middle]!;
      if (tick < segment.startTick) high = middle - 1;
      else if (tick >= segment.endTick) low = middle + 1;
      else return segment;
    }
    return undefined;
  };
  const dominantClip = (trackId: string, tick: number): ProjectClip | undefined =>
    dominantSegment(trackId, tick)?.clip;

  const nextAuthorityBoundary = (instance: PatternInstance, tick: number): number => {
    let boundary = instance.endTick;
    if (instance.sourceKind === "arrangement") {
      const dominant = dominantSegment(instance.trackId, tick);
      if (dominant?.clip.id === instance.id) boundary = Math.min(boundary, dominant.endTick);
      if (launch && launcherTrackIds.has(instance.trackId) && launch.startTick > tick) {
        boundary = Math.min(boundary, launch.startTick);
      }
    }
    return boundary;
  };

  function emit(instance: PatternInstance, startTick: number, endTick: number,
    iteration: number, output: TimelineEvent[]): void {
    if (instance.endTick <= startTick || instance.startTick >= endTick) return;
    const length = instance.pattern.lengthTicks;
    const sourcePosition = (sourceTick: number): number => instance.loopMode === "loop"
      ? modulo(sourceTick - instance.sourceOffsetTick, length)
      : sourceTick - instance.sourceOffsetTick;
    const mayPlay = (tick: number): boolean => {
      if (tick < instance.startTick || tick >= instance.endTick || tick < startTick || tick >= endTick) return false;
      if (instance.sourceKind === "launcher") return true;
      if (launcherOwns(instance.trackId, tick)) return false;
      return dominantClip(instance.trackId, tick)?.id === instance.id;
    };
    const cycleFrom = (relative: number, lead: number): number => instance.loopMode === "loop"
      ? Math.max(0, Math.floor((startTick - instance.startTick - relative - lead) / length)) : 0;
    const forCycles = (relative: number, lead: number, visit: (cycle: number, nominalTick: number) => void): void => {
      if (relative < 0) return;
      const first = cycleFrom(relative, lead);
      for (let cycle = first; ; cycle += 1) {
        if (cycle - first > 1_000_000) throw new RangeError("Ventana de timeline demasiado extensa");
        const nominalTick = instance.startTick + relative + (instance.loopMode === "loop" ? cycle * length : 0);
        if (nominalTick - lead >= endTick || nominalTick >= instance.endTick + lead) break;
        visit(cycle, nominalTick);
        if (instance.loopMode === "none") break;
      }
    };

    instance.pattern.expression.forEach((expression: ProjectExpressionEvent) => {
      const relative = sourcePosition(expression.tick);
      forCycles(relative, 0, (cycle, tick) => {
        if (!mayPlay(tick)) return;
        const pitch = expression.kind === "polyPressure" ? expression.pitch + instance.transpose : undefined;
        if (pitch !== undefined && (pitch < 0 || pitch > 127)) {
          throw new RangeError(`Presión polifónica fuera de MIDI en clip ${instance.id}`);
        }
        const base = { ...expression, eventId: `${instance.id}:${cycle}:${expression.id}:iteration-${iteration}`,
          sourceKind: instance.sourceKind, ownerPath: instance.ownerPath, trackId: instance.trackId,
          clipId: instance.id, tick, sequence: expression.sequence };
        if (expression.kind === "polyPressure") output.push({ ...base, kind: "polyPressure", pitch: pitch!,
          pressure: expression.pressure });
        else output.push(base);
      });
    });

    instance.pattern.notes.forEach((note: ProjectNote, noteIndex) => {
      if (note.muted || note.probability === 0) return;
      const pad = instance.drumPads?.get(`${note.channel}:${note.pitch}`);
      if (instance.drumPads && !pad) throw new RangeError(`Nota sin pad en clip ${instance.id}`);
      const padCycle = pad ? pad.stepTicks * pad.stepCount : length;
      if (!Number.isSafeInteger(padCycle) || padCycle < 1 || length % padCycle !== 0) {
        throw new RangeError(`Ciclo de pad incompatible en clip ${instance.id}`);
      }
      const micro = note.microOffsetTick ?? 0;
      for (let padCycleIndex = 0; padCycleIndex < length / padCycle; padCycleIndex += 1) {
        const relative = sourcePosition(note.startTick + padCycleIndex * padCycle);
        forCycles(relative, Math.max(0, -micro) + note.durationTick, (cycle, nominalTick) => {
          if (note.probability !== undefined && note.probability < 1 &&
              randomUnit(pad
                ? `${probabilitySeed}:${instance.id}:${cycle}:${padCycleIndex}:${iteration}:${note.stepId ?? note.id}`
                : `${probabilitySeed}:${instance.id}:${cycle}:${iteration}:${note.stepId ?? note.id}`) >= note.probability) return;
          const pitch = note.pitch + instance.transpose;
          if (pitch < 0 || pitch > 127) throw new RangeError(`Transposición fuera de MIDI en clip ${instance.id}`);
          const ratchets = Math.min(note.ratchetCount ?? 1, note.durationTick);
          for (let ratchet = 0; ratchet < ratchets; ratchet += 1) {
            const offset = Math.floor(ratchet * note.durationTick / ratchets);
            const nextOffset = Math.floor((ratchet + 1) * note.durationTick / ratchets);
            const tick = nominalTick + micro + offset;
            if (!mayPlay(tick)) continue;
            let durationTicks = nextOffset - offset;
            if (instance.tailPolicy === "cut") {
              durationTicks = Math.min(durationTicks, nextAuthorityBoundary(instance, tick) - tick);
              if (instance.loopMode === "loop") {
                const cycleEnd = instance.startTick + (cycle + 1) * length;
                durationTicks = Math.min(durationTicks, cycleEnd - tick);
              }
            }
            if (durationTicks < 1) continue;
            output.push({ kind: "note", eventId: pad
              ? `${instance.id}:${cycle}:pad-${padCycleIndex}:${note.id}:${ratchet}:iteration-${iteration}`
              : `${instance.id}:${cycle}:${note.id}:${ratchet}:iteration-${iteration}`,
              sourceKind: instance.sourceKind, ownerPath: instance.ownerPath,
              trackId: instance.trackId, clipId: instance.id, tick,
              sequence: sequenceForNote(note, noteIndex, ratchet), channel: note.channel,
              pitch, playedPitch: pitch, sourcePitch: note.origin.sourcePitch,
              velocity: note.velocity, releaseVelocity: note.releaseVelocity,
              durationTicks, tailPolicy: instance.tailPolicy, gainDb: instance.gainDb });
          }
        });
      }
    });
  }

  return (startTick: number, endTick: number, iteration: number): readonly TimelineEvent[] => {
    if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick) || startTick < 0 ||
        endTick <= startTick || !Number.isSafeInteger(iteration) || iteration < 0) {
      throw new RangeError("Ventana de timeline inválida");
    }
    const output: TimelineEvent[] = [];
    for (const instance of arrangement) emit(instance, startTick, endTick, iteration, output);
    for (const instance of launcher) emit(instance, startTick, endTick, iteration, output);
    for (const segment of audioSegments) {
      const clip = segment.clip;
      const clipBounds = audioBounds.get(clip.id)!;
      // A conservative tick index makes sub-tick absolute starts visible to
      // scheduler windows. segmentStartUs/EndUs remain the audible authority.
      const segmentStartTick = clock.secondsToTick(segment.startUs / 1_000_000, "floor");
      const segmentEndTick = clock.secondsToTick(segment.endUs / 1_000_000, "ceil");
      if (segmentEndTick <= startTick || segmentStartTick >= endTick) continue;
      output.push({ kind: "audioClip",
        eventId: `audio:${clip.id}:segment-${segment.startUs}-${segment.endUs}`,
        sourceKind: "arrangement", ownerPath: `track/${clip.trackId}/clip/${clip.id}`,
        trackId: clip.trackId, clipId: clip.id, sequence: 0, channel: 0,
        tick: segmentStartTick,
        clipStartTick: clock.secondsToTick(clipBounds.startUs / 1_000_000, "floor"),
        clipEndTick: segmentEndTick, timeMode: clip.timeMode,
        absoluteStartUs: clip.absoluteStartUs, absoluteEndUs: clip.absoluteEndUs,
        segmentStartUs: segment.startUs, segmentEndUs: segment.endUs,
        assetId: clip.sourceId, sourceStartFrame: clip.sourceStartFrame,
        sourceEndFrame: clip.sourceEndFrame, fadeInFrames: clip.fadeInFrames,
        fadeOutFrames: clip.fadeOutFrames,
        envelopeStartFrame: clip.envelopeStartFrame, envelopeEndFrame: clip.envelopeEndFrame,
        crossfades: fadeRamps.get(clip.id), gainDb: clip.gainDb, tailPolicy: clip.tailPolicy });
    }
    if (output.length > 1_000_000) throw new RangeError("Demasiados eventos en la ventana de timeline");
    const rank = (event: TimelineEvent): number => event.kind === "note" ? 1 : 0;
    return output.sort((a, b) => a.tick - b.tick || rank(a) - rank(b) ||
      a.sequence - b.sequence || a.eventId.localeCompare(b.eventId));
  };
}
