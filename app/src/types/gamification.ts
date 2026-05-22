// ============================================================
// GAMIFICATION TYPE SYSTEM - Phase 1 MVP
// Guitar Hero-style progression and achievement system
// ============================================================

import type { GameDifficulty } from "../game/engine";

// ============================================================
// PLAYER PROFILE
// ============================================================

export interface PlayerStats {
  totalGamesPlayed: number;
  totalScore: number;
  totalNotesHit: number;
  totalNotesMissed: number;
  bestCombo: number;
  averageAccuracy: number;
  totalPlaytimeSeconds: number;
  perfectPlusCount: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  totalStarsEarned: number;
  songsCompleted: number;
  achievementsUnlocked: number;
}

export interface PlayerProfile {
  id: string;
  username: string;
  avatar: string; // Avatar identifier or URL
  level: number;
  currentXP: number;
  totalXP: number;
  createdAt: string; // ISO date string
  lastPlayedAt: string; // ISO date string
  stats: PlayerStats;
  achievements: string[]; // Array of unlocked achievement IDs
  settings: {
    showXPNotifications: boolean;
    showAchievementNotifications: boolean;
    showLevelUpAnimations: boolean;
  };
}

// ============================================================
// XP & LEVELING
// ============================================================

export interface XPReward {
  base: number; // Base XP from score
  accuracyBonus: number; // Bonus from accuracy
  comboBonus: number; // Bonus from max combo
  difficultyMultiplier: number; // Multiplier based on difficulty
  perfectStreakBonus: number; // Bonus for perfect streaks
  total: number; // Total XP earned
  breakdown: string[]; // Human-readable breakdown
}

export interface LevelUpEvent {
  oldLevel: number;
  newLevel: number;
  xpRequired: number;
  rewards: string[]; // Unlocked features/achievements
  timestamp: string;
}

// ============================================================
// ACHIEVEMENTS
// ============================================================

export type AchievementCategory =
  | "first_steps"
  | "combo_master"
  | "accuracy_expert"
  | "score_hunter"
  | "dedication";

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  icon: string; // Icon identifier or emoji
  requirement: {
    type: "count" | "threshold" | "streak" | "special";
    target: number;
    metric: string; // What to track (e.g., "combo", "accuracy", "score")
  };
  reward: {
    xp: number;
    title?: string; // Optional title unlock
  };
  unlocked: boolean;
  unlockedAt?: string; // ISO date string
  progress: number; // Current progress towards target
  hidden: boolean; // Hidden until unlocked
}

// ============================================================
// SONG RATINGS & PROGRESS
// ============================================================

export interface SongRating {
  songId: string;
  songTitle: string;
  difficulty: GameDifficulty;
  stars: number; // 1-5 stars
  score: number;
  maxScore: number;
  accuracy: number;
  maxCombo: number;
  perfectPlus: number;
  perfect: number;
  great: number;
  good: number;
  misses: number;
  completedAt: string; // ISO date string
  playCount: number;
}

export interface SongProgress {
  songId: string;
  songTitle: string;
  ratings: {
    easy?: SongRating;
    normal?: SongRating;
    hard?: SongRating;
    expert?: SongRating;
  };
  bestStars: number;
  totalStars: number; // Sum across all difficulties
  completionPercentage: number; // 0-100
  firstPlayedAt: string;
  lastPlayedAt: string;
}

// ============================================================
// LEADERBOARD
// ============================================================

export interface LeaderboardEntry {
  rank: number;
  username: string;
  userId: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  stars: number;
  difficulty: GameDifficulty;
  date: string; // ISO date string
  isCurrentUser: boolean;
}

export interface Leaderboard {
  songId: string;
  songTitle: string;
  difficulty: GameDifficulty;
  entries: LeaderboardEntry[];
  userBestRank?: number;
  totalEntries: number;
  lastUpdated: string;
}

// ============================================================
// CHALLENGES (Future Phase 2)
// ============================================================

export type ChallengeType = "daily" | "weekly" | "special" | "community";
export type ChallengeStatus = "active" | "completed" | "expired" | "locked";

export interface Challenge {
  id: string;
  type: ChallengeType;
  name: string;
  description: string;
  status: ChallengeStatus;
  target: number;
  progress: number;
  reward: {
    xp: number;
    title?: string;
    badge?: string;
  };
  expiresAt?: string; // ISO date string
  completedAt?: string;
}

// ============================================================
// STAR POWER / PIANO FURY MODE
// ============================================================

export interface StarPowerState {
  available: number; // 0-100 (percentage)
  active: boolean;
  duration: number; // Seconds remaining when active
  maxDuration: number; // Maximum duration (default 10s)
  multiplier: number; // Score multiplier when active (default 2x)
  activationThreshold: number; // Minimum % needed to activate (default 50)
}

// ============================================================
// GAME STATISTICS (Extended from engine.ts)
// ============================================================

export interface ExtendedGameStats {
  // Core stats (from engine.ts)
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

  // Extended gamification stats
  stars: number; // 1-5 stars earned
  xpEarned: number;
  starPowerActivations: number;
  perfectStreaks: number; // Count of perfect streaks
  longestPerfectStreak: number;
  averageHitTiming: number; // Average ms offset
  earlyHits: number;
  lateHits: number;
  difficulty: GameDifficulty;
  songId: string;
  songTitle: string;
  duration: number; // Total play time in seconds
}

// ============================================================
// SCORING CONFIGURATION
// ============================================================

export interface ScoringConfig {
  basePoints: {
    perfectPlus: number;
    perfect: number;
    great: number;
    good: number;
  };
  comboMultipliers: number[]; // Multipliers at different combo thresholds
  comboThresholds: number[]; // Combo counts for each multiplier
  starPowerMultiplier: number;
  perfectStreakBonus: number; // Bonus per consecutive perfect hit
  accuracyBonusThreshold: number; // Min accuracy for bonus (e.g., 0.95)
  accuracyBonusMultiplier: number;
}

// ============================================================
// NOTIFICATIONS & UI EVENTS
// ============================================================

export interface GameNotification {
  id: string;
  type: "xp_gained" | "level_up" | "achievement" | "star_power" | "combo_milestone";
  title: string;
  message: string;
  icon?: string;
  duration: number; // Display duration in ms
  timestamp: string;
  data?: unknown; // Additional data for the notification
}

// ============================================================
// STORAGE KEYS (for localStorage)
// ============================================================

export const STORAGE_KEYS = {
  PROFILE: "piano_midi_pro_profile",
  SONG_RATINGS: "piano_midi_pro_song_ratings",
  ACHIEVEMENTS: "piano_midi_pro_achievements",
  SETTINGS: "piano_midi_pro_gamification_settings",
} as const;

// ============================================================
// CONSTANTS
// ============================================================

export const GAMIFICATION_CONSTANTS = {
  // XP System
  XP_PER_LEVEL_BASE: 1000,
  XP_LEVEL_EXPONENT: 1.5,
  MAX_LEVEL: 100,

  // Difficulty Multipliers
  DIFFICULTY_XP_MULTIPLIERS: {
    easy: 1.0,
    normal: 1.5,
    hard: 2.0,
    expert: 3.0,
  },

  // Star Thresholds (percentage of max score)
  STAR_THRESHOLDS: {
    1: 0.6, // 60%
    2: 0.7, // 70%
    3: 0.8, // 80%
    4: 0.9, // 90%
    5: 0.95, // 95%
  },

  // Star Power
  STAR_POWER_MAX: 100,
  STAR_POWER_ACTIVATION_THRESHOLD: 50,
  STAR_POWER_DURATION: 10, // seconds
  STAR_POWER_MULTIPLIER: 2,
  STAR_POWER_GAIN_PER_PERFECT_PLUS: 5,
  STAR_POWER_GAIN_PER_PERFECT: 3,

  // Combo Multipliers
  COMBO_MULTIPLIERS: [1, 2, 4, 8, 16, 32],
  COMBO_THRESHOLDS: [0, 10, 25, 50, 100, 250],

  // Perfect Streak
  PERFECT_STREAK_BONUS_PER_NOTE: 50,
  PERFECT_STREAK_MIN_LENGTH: 10,
} as const;

// Made with Bob
