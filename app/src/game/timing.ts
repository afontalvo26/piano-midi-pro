import type { GameDifficulty, HitGrade, TimingWindows } from "./types";

export function getTimingWindows(difficulty: GameDifficulty): TimingWindows {
  const base: TimingWindows = {
    perfectPlusMs: 22,
    perfectMs: 45,
    greatMs: 80,
    goodMs: 120,
  };

  // Wide windows → game feels responsive and fair
  const mult =
    difficulty === "easy"
      ? 3.5 // ±420ms – very forgiving, great for beginners
      : difficulty === "normal"
        ? 2.0 // ±240ms – comfortable
        : difficulty === "hard"
          ? 1.1 // ±132ms – requires real timing
          : 0.7; // expert ±84ms – tight

  return {
    perfectPlusMs: Math.round(base.perfectPlusMs * mult),
    perfectMs: Math.round(base.perfectMs * mult),
    greatMs: Math.round(base.greatMs * mult),
    goodMs: Math.round(base.goodMs * mult),
  };
}

export function classifyHit(
  deltaMsAbs: number,
  windows: TimingWindows,
): HitGrade {
  if (deltaMsAbs <= windows.perfectPlusMs) return "perfect_plus";
  if (deltaMsAbs <= windows.perfectMs) return "perfect";
  if (deltaMsAbs <= windows.greatMs) return "great";
  if (deltaMsAbs <= windows.goodMs) return "good";
  return "miss";
}
