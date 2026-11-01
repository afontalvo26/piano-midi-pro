import { PROJECT_PPQ, type TempoPoint, type MeterPoint } from "../project/model.ts";

/** Canonical project resolution; historical SMF recordings remain at 480 PPQ. */
export { PROJECT_PPQ };
export type { TempoPoint, MeterPoint };

export interface LoopRange {
  readonly startTick: number;
  readonly endTick: number;
}

interface TempoSegment extends TempoPoint {
  readonly startSeconds: number;
}

export type TickRounding = "nearest" | "floor" | "ceil";

function requireTick(tick: number, label: string): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer tick`);
  }
}

function lastAtOrBefore<T>(items: readonly T[], value: number, field: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (field(items[middle]!) <= value) low = middle;
    else high = middle;
  }
  return low;
}

export function validateLoopRange(loop: LoopRange): LoopRange {
  requireTick(loop.startTick, "loop start");
  requireTick(loop.endTick, "loop end");
  if (loop.endTick <= loop.startTick) throw new RangeError("loop end must follow start");
  return { startTick: loop.startTick, endTick: loop.endTick };
}

/** Tick at an absolute transport position; endTick belongs to the next cycle. */
export function wrapLoopTick(absoluteTick: number, loop: LoopRange): { tick: number; iteration: number } {
  requireTick(absoluteTick, "absoluteTick");
  validateLoopRange(loop);
  if (absoluteTick < loop.startTick) return { tick: absoluteTick, iteration: 0 };
  const length = loop.endTick - loop.startTick;
  const offset = absoluteTick - loop.startTick;
  return { tick: loop.startTick + offset % length, iteration: Math.floor(offset / length) };
}

/** Pure tempo integration. The audio engine supplies the absolute time anchor. */
export class MusicalClock {
  readonly tempoMap: readonly TempoPoint[];
  readonly meterMap: readonly MeterPoint[];
  private readonly segments: readonly TempoSegment[];

  constructor(tempoMap: readonly TempoPoint[], meterMap: readonly MeterPoint[]) {
    if (!tempoMap.length || tempoMap[0]!.tick !== 0 || !meterMap.length || meterMap[0]!.tick !== 0) {
      throw new RangeError("tempo and meter maps must begin at tick 0");
    }
    let previous = -1;
    this.tempoMap = Object.freeze(tempoMap.map((point) => {
      requireTick(point.tick, "tempo tick");
      if (point.tick <= previous || !Number.isSafeInteger(point.microsPerQuarter) ||
          point.microsPerQuarter < 60_000 || point.microsPerQuarter > 60_000_000) {
        throw new RangeError("tempo map must have ordered unique ticks and 1..1000 BPM");
      }
      previous = point.tick;
      return Object.freeze({ ...point });
    }));
    previous = -1;
    this.meterMap = Object.freeze(meterMap.map((point) => {
      requireTick(point.tick, "meter tick");
      if (point.tick <= previous || !Number.isSafeInteger(point.numerator) || point.numerator < 1 ||
          point.numerator > 64 || !Number.isSafeInteger(point.denominator) ||
          point.denominator < 1 || point.denominator > 128 ||
          (point.denominator & (point.denominator - 1)) !== 0) {
        throw new RangeError("meter map must have ordered unique ticks and a valid signature");
      }
      previous = point.tick;
      return Object.freeze({ ...point });
    }));
    let seconds = 0;
    const segments: TempoSegment[] = [];
    for (const point of this.tempoMap) {
      const prior = segments.at(-1);
      if (prior) seconds += (point.tick - prior.tick) * prior.microsPerQuarter /
        (PROJECT_PPQ * 1_000_000);
      if (!Number.isFinite(seconds)) throw new RangeError("tempo map exceeds supported duration");
      segments.push({ ...point, startSeconds: seconds });
    }
    this.segments = segments;
  }

  tempoAt(tick: number): TempoPoint {
    requireTick(tick, "tick");
    return this.tempoMap[lastAtOrBefore(this.tempoMap, tick, (point) => point.tick)]!;
  }

  meterAt(tick: number): MeterPoint {
    requireTick(tick, "tick");
    return this.meterMap[lastAtOrBefore(this.meterMap, tick, (point) => point.tick)]!;
  }

  tickToSeconds(tick: number): number {
    requireTick(tick, "tick");
    const segment = this.segments[lastAtOrBefore(this.segments, tick, (point) => point.tick)]!;
    return segment.startSeconds + (tick - segment.tick) * segment.microsPerQuarter /
      (PROJECT_PPQ * 1_000_000);
  }

  secondsToTick(seconds: number, rounding: TickRounding = "nearest"): number {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("seconds must be non-negative");
    const segment = this.segments[lastAtOrBefore(this.segments, seconds, (point) => point.startSeconds)]!;
    const exact = segment.tick + (seconds - segment.startSeconds) *
      PROJECT_PPQ * 1_000_000 / segment.microsPerQuarter;
    const tick = rounding === "floor" ? Math.floor(exact + 1e-9)
      : rounding === "ceil" ? Math.ceil(exact - 1e-9) : Math.round(exact);
    requireTick(tick, "converted tick");
    return tick;
  }

  secondsBetween(startTick: number, endTick: number): number {
    requireTick(startTick, "startTick");
    requireTick(endTick, "endTick");
    if (endTick < startTick) throw new RangeError("endTick must follow startTick");
    return this.tickToSeconds(endTick) - this.tickToSeconds(startTick);
  }
}
