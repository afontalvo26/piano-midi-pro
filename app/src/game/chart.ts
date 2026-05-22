import type {
  GameChartNote,
  GameDifficulty,
  GameMode,
  RhythmSourceNote,
} from "./types";

export function buildGameChart(
  notes: RhythmSourceNote[],
  options: {
    difficulty: GameDifficulty;
    mode: GameMode;
    rangeStart: number;
    rangeCount: number;
  },
): GameChartNote[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const grouped: RhythmSourceNote[][] = [];

  for (const note of sorted) {
    const last = grouped[grouped.length - 1];
    if (!last) {
      grouped.push([note]);
      continue;
    }

    const dt = Math.abs(last[0].time - note.time);
    if (dt <= 0.03) {
      last.push(note);
    } else {
      grouped.push([note]);
    }
  }

  const sampled: RhythmSourceNote[] = [];
  let lastEasyTime = -999;

  grouped.forEach((chord) => {
    const byHighMidi = [...chord].sort((a, b) => b.midi - a.midi);

    if (options.difficulty === "easy") {
      const top = byHighMidi[0];
      if (top.time - lastEasyTime >= 0.18) {
        sampled.push(top);
        lastEasyTime = top.time;
      }
      return;
    }

    if (options.difficulty === "normal") {
      sampled.push(...byHighMidi.slice(0, 2));
      return;
    }

    sampled.push(...byHighMidi);
  });

  // Always filter by range to prevent notes outside visible piano keys
  const rangeEnd = options.rangeStart + options.rangeCount;
  const filtered = sampled.filter(
    (n) => n.midi >= options.rangeStart && n.midi < rangeEnd,
  );

  return filtered.map((n) => ({
    ...n,
    hit: false,
    missed: false,
  }));
}

export function computeAutoShiftTarget(
  chart: GameChartNote[],
  nowSec: number,
  currentRangeStart: number,
  options: {
    lookAheadSec: number;
    minMidi: number;
    maxMidi: number;
    rangeCount: number;
    snap: (n: number) => number;
  },
): number | null {
  const endWindow = nowSec + options.lookAheadSec;
  const upcoming = chart.filter(
    (n) => !n.missed && !n.hit && n.time >= nowSec && n.time <= endWindow,
  );

  if (upcoming.length === 0) return null;

  let minNote = 127;
  let maxNote = 0;
  for (const n of upcoming) {
    if (n.midi < minNote) minNote = n.midi;
    if (n.midi > maxNote) maxNote = n.midi;
  }

  const currentEnd = currentRangeStart + options.rangeCount - 1;
  if (minNote >= currentRangeStart && maxNote <= currentEnd) {
    return null;
  }

  const rawCenterStart =
    Math.round((minNote + maxNote) / 2) - Math.floor(options.rangeCount / 2);
  const clamped = Math.max(
    options.minMidi,
    Math.min(rawCenterStart, options.maxMidi - options.rangeCount + 1),
  );
  const snapped = options.snap(clamped);

  if (snapped === currentRangeStart) return null;
  return snapped;
}
