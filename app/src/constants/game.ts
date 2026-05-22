/**
 * Game Constants
 * 
 * Contains all game-related constants including difficulties,
 * modes, timing windows, and scoring configuration.
 */

// Game Difficulties
export const GAME_DIFFICULTIES = ["easy", "normal", "hard", "expert"] as const;
export type GameDifficulty = typeof GAME_DIFFICULTIES[number];

export const DEFAULT_DIFFICULTY: GameDifficulty = "normal";

// Game Modes
export const GAME_MODES = ["practice", "performance", "challenge"] as const;
export type GameMode = typeof GAME_MODES[number];

export const DEFAULT_GAME_MODE: GameMode = "practice";

// Game Status
export const GAME_STATUSES = ["idle", "ready", "playing", "paused", "finished"] as const;
export type GameStatus = typeof GAME_STATUSES[number];

// Hit Grades
export const HIT_GRADES = ["perfect+", "perfect", "great", "good", "miss"] as const;
export type HitGrade = typeof HIT_GRADES[number];

// Timing Windows (in milliseconds) by Difficulty
export const TIMING_WINDOWS = {
  easy: {
    "perfect+": 30,
    perfect: 61,
    great: 108,
    good: 162,
  },
  normal: {
    "perfect+": 22,
    perfect: 45,
    great: 80,
    good: 120,
  },
  hard: {
    "perfect+": 19,
    perfect: 38,
    great: 68,
    good: 102,
  },
  expert: {
    "perfect+": 15,
    perfect: 32,
    great: 56,
    good: 84,
  },
} as const;

// Base Points by Hit Grade
export const BASE_POINTS = {
  "perfect+": 110,
  perfect: 100,
  great: 70,
  good: 40,
  miss: 0,
} as const;

// Combo Multipliers (Enhanced - Guitar Hero style)
export const COMBO_MULTIPLIERS = [
  { min: 0, max: 9, multiplier: 1 },
  { min: 10, max: 24, multiplier: 2 },
  { min: 25, max: 49, multiplier: 4 },
  { min: 50, max: 99, multiplier: 8 },
  { min: 100, max: 249, multiplier: 16 },
  { min: 250, max: Infinity, multiplier: 32 },
] as const;

// Star Power / Piano Fury Configuration
export const STAR_POWER_CONFIG = {
  activationThreshold: 50, // % required to activate
  duration: 10, // seconds
  scoreMultiplier: 2, // 2x score when active
  perfectPlusGain: 5, // % gained per perfect+ hit
  perfectGain: 3, // % gained per perfect hit
  greatGain: 1, // % gained per great hit
  missLoss: 10, // % lost per miss
} as const;

// Perfect Streak Configuration
export const PERFECT_STREAK_CONFIG = {
  minStreak: 10, // Minimum streak to activate bonus
  bonusPoints: 50, // Bonus points per note after min streak
} as const;

// XP Multipliers by Difficulty
export const XP_DIFFICULTY_MULTIPLIERS = {
  easy: 1.0,
  normal: 1.5,
  hard: 2.0,
  expert: 3.0,
} as const;

// Star Rating Thresholds (% of max score)
export const STAR_THRESHOLDS = {
  1: 60, // 60-69%
  2: 70, // 70-79%
  3: 80, // 80-89%
  4: 90, // 90-94%
  5: 95, // 95-100%
} as const;

// Falling Notes Configuration
export const FALLING_NOTES_CONFIG = {
  fallSpeed: 200, // pixels per second
  noteHeight: 20, // pixels
  noteWidth: 40, // pixels
  hitLineY: 0.8, // 80% from top
  despawnOffset: 100, // pixels below hit line before despawn
} as const;

// Game Canvas Configuration
export const GAME_CANVAS_CONFIG = {
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  hitLineColor: "#ef4444",
  hitLineWidth: 3,
} as const;

// Auto-Shift Configuration (for falling notes)
export const AUTO_SHIFT_CONFIG = {
  enabled: true,
  lookAheadTime: 2, // seconds
  minVisibleNotes: 5,
  maxVisibleNotes: 37, // RANGE_KEY_COUNT
} as const;

// Difficulty Labels
export const DIFFICULTY_LABELS = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
  expert: "Expert",
} as const;

// Difficulty Descriptions
export const DIFFICULTY_DESCRIPTIONS = {
  easy: "Relaxed timing windows, perfect for beginners",
  normal: "Balanced challenge for casual players",
  hard: "Tight timing, requires practice",
  expert: "Extreme precision, for masters only",
} as const;

// Game Mode Labels
export const GAME_MODE_LABELS = {
  practice: "Practice",
  performance: "Performance",
  challenge: "Challenge",
} as const;

// Game Mode Descriptions
export const GAME_MODE_DESCRIPTIONS = {
  practice: "Learn at your own pace, no penalties",
  performance: "Full scoring and XP, compete for high scores",
  challenge: "Special objectives and time limits",
} as const;

// Helper: Get combo multiplier for current combo
export function getComboMultiplier(combo: number): number {
  for (const tier of COMBO_MULTIPLIERS) {
    if (combo >= tier.min && combo <= tier.max) {
      return tier.multiplier;
    }
  }
  return 1;
}

// Helper: Get timing window for difficulty and grade
export function getTimingWindow(
  difficulty: GameDifficulty,
  grade: Exclude<HitGrade, "miss">
): number {
  return TIMING_WINDOWS[difficulty][grade];
}

// Helper: Calculate stars from score percentage
export function calculateStarsFromPercentage(percentage: number): number {
  if (percentage >= STAR_THRESHOLDS[5]) return 5;
  if (percentage >= STAR_THRESHOLDS[4]) return 4;
  if (percentage >= STAR_THRESHOLDS[3]) return 3;
  if (percentage >= STAR_THRESHOLDS[2]) return 2;
  if (percentage >= STAR_THRESHOLDS[1]) return 1;
  return 0;
}

// Helper: Get XP multiplier for difficulty
export function getXPMultiplier(difficulty: GameDifficulty): number {
  return XP_DIFFICULTY_MULTIPLIERS[difficulty];
}

// Helper: Check if combo qualifies for multiplier tier
export function getComboTier(combo: number): number {
  for (let i = COMBO_MULTIPLIERS.length - 1; i >= 0; i--) {
    const tier = COMBO_MULTIPLIERS[i];
    if (combo >= tier.min) {
      return i;
    }
  }
  return 0;
}

// Helper: Get next combo milestone
export function getNextComboMilestone(combo: number): number | null {
  for (const tier of COMBO_MULTIPLIERS) {
    if (combo < tier.min) {
      return tier.min;
    }
  }
  return null; // Already at max tier
}

// Made with Bob
