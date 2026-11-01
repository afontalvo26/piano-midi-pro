import type { ProjectDrumRack } from "./model.ts";

/** 64 bars at 4/4, at the project's 960 PPQ. */
export const MAX_DRUM_RACK_CYCLE_TICKS = 245_760;

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** Exact common cycle across pads; rejects an unbounded or unsafe timeline. */
export function drumRackCycleTicks(rack: ProjectDrumRack): number {
  let cycle = 1;
  for (const pad of rack.pads) {
    const padCycle = pad.stepTicks * pad.stepCount;
    if (!Number.isSafeInteger(padCycle) || padCycle < 1 || padCycle > MAX_DRUM_RACK_CYCLE_TICKS) {
      throw new RangeError("Ciclo del pad excede el límite del rack");
    }
    cycle = (cycle / gcd(cycle, padCycle)) * padCycle;
    if (!Number.isSafeInteger(cycle) || cycle > MAX_DRUM_RACK_CYCLE_TICKS) {
      throw new RangeError("Ciclo común de batería excede 64 compases de 4/4");
    }
  }
  return cycle;
}
