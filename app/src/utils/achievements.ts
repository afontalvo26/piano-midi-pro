// ============================================================
// ACHIEVEMENT SYSTEM
// Tracks and unlocks achievements based on player performance
// ============================================================

import type {
  Achievement,
  AchievementCategory,
  PlayerProfile,
  ExtendedGameStats,
} from "../types/gamification";
import { STORAGE_KEYS } from "../types/gamification";

// ============================================================
// ACHIEVEMENT DEFINITIONS (20 Initial Achievements)
// ============================================================

export function getAchievementDefinitions(): Achievement[] {
  return [
    // ========== FIRST STEPS (5 achievements) ==========
    {
      id: "first_note",
      name: "First Note",
      description: "Hit your first note",
      category: "first_steps",
      rarity: "common",
      icon: "🎵",
      requirement: {
        type: "count",
        target: 1,
        metric: "notes_hit",
      },
      reward: { xp: 50 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "first_song",
      name: "First Performance",
      description: "Complete your first song",
      category: "first_steps",
      rarity: "common",
      icon: "🎼",
      requirement: {
        type: "count",
        target: 1,
        metric: "songs_completed",
      },
      reward: { xp: 100 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "first_perfect",
      name: "Perfect Timing",
      description: "Hit a Perfect note",
      category: "first_steps",
      rarity: "common",
      icon: "⭐",
      requirement: {
        type: "count",
        target: 1,
        metric: "perfect_hits",
      },
      reward: { xp: 75 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "first_combo_10",
      name: "Combo Starter",
      description: "Reach a 10x combo",
      category: "first_steps",
      rarity: "common",
      icon: "🔥",
      requirement: {
        type: "threshold",
        target: 10,
        metric: "max_combo",
      },
      reward: { xp: 100 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "first_3_stars",
      name: "Three Star Debut",
      description: "Earn 3 stars on any song",
      category: "first_steps",
      rarity: "common",
      icon: "⭐⭐⭐",
      requirement: {
        type: "threshold",
        target: 3,
        metric: "stars_earned",
      },
      reward: { xp: 150 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },

    // ========== COMBO MASTER (5 achievements) ==========
    {
      id: "combo_25",
      name: "Combo Apprentice",
      description: "Reach a 25x combo",
      category: "combo_master",
      rarity: "common",
      icon: "🔥",
      requirement: {
        type: "threshold",
        target: 25,
        metric: "max_combo",
      },
      reward: { xp: 200 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "combo_50",
      name: "Combo Expert",
      description: "Reach a 50x combo",
      category: "combo_master",
      rarity: "rare",
      icon: "🔥🔥",
      requirement: {
        type: "threshold",
        target: 50,
        metric: "max_combo",
      },
      reward: { xp: 300 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "combo_100",
      name: "Combo Master",
      description: "Reach a 100x combo",
      category: "combo_master",
      rarity: "epic",
      icon: "🔥🔥🔥",
      requirement: {
        type: "threshold",
        target: 100,
        metric: "max_combo",
      },
      reward: { xp: 500, title: "Combo Master" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "combo_250",
      name: "Combo Legend",
      description: "Reach a 250x combo",
      category: "combo_master",
      rarity: "epic",
      icon: "💥",
      requirement: {
        type: "threshold",
        target: 250,
        metric: "max_combo",
      },
      reward: { xp: 1000, title: "Combo Legend" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "combo_500",
      name: "Unstoppable",
      description: "Reach a 500x combo",
      category: "combo_master",
      rarity: "legendary",
      icon: "👑",
      requirement: {
        type: "threshold",
        target: 500,
        metric: "max_combo",
      },
      reward: { xp: 2000, title: "Unstoppable Force" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },

    // ========== ACCURACY EXPERT (5 achievements) ==========
    {
      id: "accuracy_80",
      name: "Consistent Player",
      description: "Achieve 80% accuracy in a song",
      category: "accuracy_expert",
      rarity: "common",
      icon: "🎯",
      requirement: {
        type: "threshold",
        target: 0.8,
        metric: "accuracy",
      },
      reward: { xp: 150 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "accuracy_90",
      name: "Precision Player",
      description: "Achieve 90% accuracy in a song",
      category: "accuracy_expert",
      rarity: "rare",
      icon: "🎯🎯",
      requirement: {
        type: "threshold",
        target: 0.9,
        metric: "accuracy",
      },
      reward: { xp: 300 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "accuracy_95",
      name: "Near Perfect",
      description: "Achieve 95% accuracy in a song",
      category: "accuracy_expert",
      rarity: "epic",
      icon: "💎",
      requirement: {
        type: "threshold",
        target: 0.95,
        metric: "accuracy",
      },
      reward: { xp: 500, title: "Precision Master" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "accuracy_98",
      name: "Almost Flawless",
      description: "Achieve 98% accuracy in a song",
      category: "accuracy_expert",
      rarity: "epic",
      icon: "💎💎",
      requirement: {
        type: "threshold",
        target: 0.98,
        metric: "accuracy",
      },
      reward: { xp: 750, title: "Flawless Performer" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "accuracy_100",
      name: "Perfection",
      description: "Achieve 100% accuracy in a song",
      category: "accuracy_expert",
      rarity: "legendary",
      icon: "👑",
      requirement: {
        type: "threshold",
        target: 1.0,
        metric: "accuracy",
      },
      reward: { xp: 1500, title: "Perfect Pianist" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },

    // ========== SCORE HUNTER (3 achievements) ==========
    {
      id: "score_100k",
      name: "Score Chaser",
      description: "Reach 100,000 total score",
      category: "score_hunter",
      rarity: "rare",
      icon: "💰",
      requirement: {
        type: "threshold",
        target: 100000,
        metric: "total_score",
      },
      reward: { xp: 300 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "score_500k",
      name: "Score Hunter",
      description: "Reach 500,000 total score",
      category: "score_hunter",
      rarity: "epic",
      icon: "💰💰",
      requirement: {
        type: "threshold",
        target: 500000,
        metric: "total_score",
      },
      reward: { xp: 750, title: "Score Hunter" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "score_1m",
      name: "Millionaire",
      description: "Reach 1,000,000 total score",
      category: "score_hunter",
      rarity: "legendary",
      icon: "💎",
      requirement: {
        type: "threshold",
        target: 1000000,
        metric: "total_score",
      },
      reward: { xp: 1500, title: "Score Millionaire" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },

    // ========== DEDICATION (2 achievements) ==========
    {
      id: "songs_10",
      name: "Getting Started",
      description: "Play 10 songs",
      category: "dedication",
      rarity: "common",
      icon: "📚",
      requirement: {
        type: "count",
        target: 10,
        metric: "games_played",
      },
      reward: { xp: 200 },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
    {
      id: "songs_50",
      name: "Dedicated Musician",
      description: "Play 50 songs",
      category: "dedication",
      rarity: "rare",
      icon: "📚📚",
      requirement: {
        type: "count",
        target: 50,
        metric: "games_played",
      },
      reward: { xp: 500, title: "Dedicated Musician" },
      unlocked: false,
      progress: 0,
      hidden: false,
    },
  ];
}

// ============================================================
// ACHIEVEMENT CHECKING & UNLOCKING
// ============================================================

/**
 * Check which achievements should be unlocked based on game stats
 */
export function checkAchievements(
  profile: PlayerProfile,
  gameStats: ExtendedGameStats,
): string[] {
  const definitions = getAchievementDefinitions();
  const unlockedIds: string[] = [];

  for (const achievement of definitions) {
    // Skip already unlocked
    if (profile.achievements.includes(achievement.id)) {
      continue;
    }

    // Check if requirement is met
    if (shouldUnlockAchievement(achievement, profile, gameStats)) {
      unlockedIds.push(achievement.id);
    }
  }

  return unlockedIds;
}

/**
 * Check if a specific achievement should be unlocked
 */
function shouldUnlockAchievement(
  achievement: Achievement,
  profile: PlayerProfile,
  gameStats: ExtendedGameStats,
): boolean {
  const { requirement } = achievement;
  const { type, target, metric } = requirement;

  let currentValue = 0;

  // Get current value based on metric
  switch (metric) {
    case "notes_hit":
      currentValue = profile.stats.totalNotesHit;
      break;
    case "songs_completed":
      currentValue = profile.stats.songsCompleted;
      break;
    case "perfect_hits":
      currentValue = profile.stats.perfectCount + profile.stats.perfectPlusCount;
      break;
    case "max_combo":
      currentValue = Math.max(profile.stats.bestCombo, gameStats.maxCombo);
      break;
    case "stars_earned":
      currentValue = gameStats.stars || 0;
      break;
    case "accuracy":
      currentValue = gameStats.accuracy;
      break;
    case "total_score":
      currentValue = profile.stats.totalScore;
      break;
    case "games_played":
      currentValue = profile.stats.totalGamesPlayed;
      break;
    default:
      return false;
  }

  // Check based on requirement type
  if (type === "threshold" || type === "count") {
    return currentValue >= target;
  }

  return false;
}

/**
 * Unlock an achievement for a profile
 */
export function unlockAchievement(
  profile: PlayerProfile,
  achievementId: string,
): PlayerProfile {
  // Don't unlock if already unlocked
  if (profile.achievements.includes(achievementId)) {
    return profile;
  }

  const updated: PlayerProfile = {
    ...profile,
    achievements: [...profile.achievements, achievementId],
    stats: {
      ...profile.stats,
      achievementsUnlocked: profile.stats.achievementsUnlocked + 1,
    },
  };

  return updated;
}

/**
 * Get progress for a specific achievement
 */
export function getAchievementProgress(
  achievement: Achievement,
  profile: PlayerProfile,
): number {
  if (profile.achievements.includes(achievement.id)) {
    return 1; // 100% if unlocked
  }

  const { requirement } = achievement;
  const { target, metric } = requirement;

  let currentValue = 0;

  switch (metric) {
    case "notes_hit":
      currentValue = profile.stats.totalNotesHit;
      break;
    case "songs_completed":
      currentValue = profile.stats.songsCompleted;
      break;
    case "perfect_hits":
      currentValue = profile.stats.perfectCount + profile.stats.perfectPlusCount;
      break;
    case "max_combo":
      currentValue = profile.stats.bestCombo;
      break;
    case "total_score":
      currentValue = profile.stats.totalScore;
      break;
    case "games_played":
      currentValue = profile.stats.totalGamesPlayed;
      break;
    case "accuracy":
      currentValue = profile.stats.averageAccuracy;
      break;
    default:
      return 0;
  }

  return Math.min(1, currentValue / target);
}

// ============================================================
// ACHIEVEMENT QUERIES
// ============================================================

/**
 * Get all unlocked achievements for a profile
 */
export function getUnlockedAchievements(
  profile: PlayerProfile,
): Achievement[] {
  const definitions = getAchievementDefinitions();
  return definitions
    .filter((a) => profile.achievements.includes(a.id))
    .map((a) => ({
      ...a,
      unlocked: true,
      unlockedAt: profile.lastPlayedAt, // Approximate
      progress: 1,
    }));
}

/**
 * Get all locked achievements for a profile
 */
export function getLockedAchievements(profile: PlayerProfile): Achievement[] {
  const definitions = getAchievementDefinitions();
  return definitions
    .filter((a) => !profile.achievements.includes(a.id))
    .map((a) => ({
      ...a,
      unlocked: false,
      progress: getAchievementProgress(a, profile),
    }));
}

/**
 * Get achievements by category
 */
export function getAchievementsByCategory(
  category: AchievementCategory,
): Achievement[] {
  return getAchievementDefinitions().filter((a) => a.category === category);
}

/**
 * Get achievement by ID
 */
export function getAchievementById(id: string): Achievement | undefined {
  return getAchievementDefinitions().find((a) => a.id === id);
}

/**
 * Get total XP from unlocked achievements
 */
export function getTotalAchievementXP(profile: PlayerProfile): number {
  const unlocked = getUnlockedAchievements(profile);
  return unlocked.reduce((sum, a) => sum + a.reward.xp, 0);
}

/**
 * Get achievement completion percentage
 */
export function getAchievementCompletion(profile: PlayerProfile): number {
  const total = getAchievementDefinitions().length;
  const unlocked = profile.achievements.length;
  return (unlocked / total) * 100;
}

// ============================================================
// PERSISTENCE
// ============================================================

/**
 * Save achievement progress to localStorage
 * (Currently stored in profile, but could be separate)
 */
export function saveAchievementProgress(profile: PlayerProfile): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.ACHIEVEMENTS,
      JSON.stringify(profile.achievements),
    );
  } catch (error) {
    console.error("Failed to save achievement progress:", error);
  }
}

/**
 * Load achievement progress from localStorage
 */
export function loadAchievementProgress(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
    if (!stored) return [];
    return JSON.parse(stored) as string[];
  } catch (error) {
    console.error("Failed to load achievement progress:", error);
    return [];
  }
}

// Made with Bob
