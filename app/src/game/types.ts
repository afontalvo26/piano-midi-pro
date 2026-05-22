import type { StarPowerState } from "../types/gamification";

export type GameMode = "learn" | "score";
export type GameDifficulty = "easy" | "normal" | "hard" | "expert";
export type GameStatus = "setup" | "countdown" | "playing" | "results";

export type HitGrade = "perfect_plus" | "perfect" | "great" | "good" | "miss";

export interface RhythmSourceNote {
  id: string;
  midi: number;
  time: number;
  duration: number;
  velocity: number;
  trackIndex: number;
}

export interface GameChartNote extends RhythmSourceNote {
  hit: boolean;
  missed: boolean;
  grade?: HitGrade;
  deltaMs?: number;
}

export interface TimingWindows {
  perfectPlusMs: number;
  perfectMs: number;
  greatMs: number;
  goodMs: number;
}

export interface GameRunStats {
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
  perfectPlus: number;
  perfect: number;
  great: number;
  good: number;
  accuracy: number;
  progress: number;
  totalTargets: number;
}

export interface GameBestScore {
  score: number;
  accuracy: number;
  maxCombo: number;
  date: string;
}

export interface EnhancedGameStats extends GameRunStats {
  starPower: StarPowerState;
  perfectStreak: number;
  longestPerfectStreak: number;
  starPowerActivations: number;
}
