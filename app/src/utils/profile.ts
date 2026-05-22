// ============================================================
// PLAYER PROFILE MANAGEMENT SYSTEM
// Handles user profiles, XP, leveling, and statistics
// ============================================================

import type {
  PlayerProfile,
  PlayerStats,
  XPReward,
  LevelUpEvent,
  ExtendedGameStats,
} from "../types/gamification";
import type { GameDifficulty } from "../game/engine";
import { STORAGE_KEYS, GAMIFICATION_CONSTANTS } from "../types/gamification";

// ============================================================
// PROFILE CREATION & INITIALIZATION
// ============================================================

export function createDefaultStats(): PlayerStats {
  return {
    totalGamesPlayed: 0,
    totalScore: 0,
    totalNotesHit: 0,
    totalNotesMissed: 0,
    bestCombo: 0,
    averageAccuracy: 0,
    totalPlaytimeSeconds: 0,
    perfectPlusCount: 0,
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    totalStarsEarned: 0,
    songsCompleted: 0,
    achievementsUnlocked: 0,
  };
}

export function createProfile(username?: string): PlayerProfile {
  const now = new Date().toISOString();

  return {
    id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    username: username || "Player",
    avatar: "🎹", // Default piano emoji
    level: 1,
    currentXP: 0,
    totalXP: 0,
    createdAt: now,
    lastPlayedAt: now,
    stats: createDefaultStats(),
    achievements: [],
    settings: {
      showXPNotifications: true,
      showAchievementNotifications: true,
      showLevelUpAnimations: true,
    },
  };
}

// ============================================================
// XP & LEVELING CALCULATIONS
// ============================================================

/**
 * Calculate XP required for a specific level
 * Formula: 1000 * (level ^ 1.5)
 */
export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(
    GAMIFICATION_CONSTANTS.XP_PER_LEVEL_BASE * Math.pow(level, GAMIFICATION_CONSTANTS.XP_LEVEL_EXPONENT)
  );
}

/**
 * Calculate level from total XP
 */
export function calculateLevel(totalXP: number): number {
  let level = 1;

  while (
    level < GAMIFICATION_CONSTANTS.MAX_LEVEL &&
    totalXP >= getXPForLevel(level + 1)
  ) {
    level++;
  }

  return level;
}

/**
 * Get XP progress within current level (0-1)
 */
export function getLevelProgress(profile: PlayerProfile): number {
  const currentLevelXP = getXPForLevel(profile.level);
  const nextLevelXP = getXPForLevel(profile.level + 1);
  const xpInLevel = profile.totalXP - currentLevelXP;
  const xpNeeded = nextLevelXP - currentLevelXP;

  return xpNeeded > 0 ? xpInLevel / xpNeeded : 0;
}

/**
 * Calculate XP reward from game performance
 */
export function calculateXPReward(
  score: number,
  accuracy: number,
  maxCombo: number,
  difficulty: GameDifficulty,
  perfectStreak?: number,
): XPReward {
  // Base XP from score
  const base = Math.floor(score / 100);

  // Accuracy bonus (up to 500 XP for perfect accuracy)
  const accuracyBonus = Math.floor(accuracy * 500);

  // Combo bonus (10 XP per combo point)
  const comboBonus = maxCombo * 10;

  // Perfect streak bonus (50 XP per streak note after 10)
  const streakBonus = perfectStreak && perfectStreak >= 10 
    ? (perfectStreak - 9) * 50 
    : 0;

  // Difficulty multiplier
  const difficultyMultiplier =
    GAMIFICATION_CONSTANTS.DIFFICULTY_XP_MULTIPLIERS[difficulty];

  // Calculate total
  const subtotal = base + accuracyBonus + comboBonus + streakBonus;
  const total = Math.floor(subtotal * difficultyMultiplier);

  // Build breakdown
  const breakdown: string[] = [
    `Base: ${base} XP (from score)`,
    `Accuracy: +${accuracyBonus} XP (${(accuracy * 100).toFixed(1)}%)`,
    `Combo: +${comboBonus} XP (x${maxCombo})`,
  ];

  if (streakBonus > 0) {
    breakdown.push(`Perfect Streak: +${streakBonus} XP (${perfectStreak} notes)`);
  }

  breakdown.push(
    `Difficulty: x${difficultyMultiplier} (${difficulty})`,
    `Total: ${total} XP`,
  );

  return {
    base,
    accuracyBonus,
    comboBonus,
    difficultyMultiplier,
    perfectStreakBonus: streakBonus,
    total,
    breakdown,
  };
}

/**
 * Add XP to profile and handle level ups
 */
export function addXP(
  profile: PlayerProfile,
  xp: number,
): { profile: PlayerProfile; levelUp?: LevelUpEvent } {
  const newTotalXP = profile.totalXP + xp;
  const oldLevel = profile.level;
  const newLevel = calculateLevel(newTotalXP);

  const currentLevelXP = getXPForLevel(newLevel);
  const currentXP = newTotalXP - currentLevelXP;

  const updatedProfile: PlayerProfile = {
    ...profile,
    totalXP: newTotalXP,
    currentXP,
    level: newLevel,
    lastPlayedAt: new Date().toISOString(),
  };

  // Check for level up
  if (newLevel > oldLevel) {
    const levelUpEvent: LevelUpEvent = {
      oldLevel,
      newLevel,
      xpRequired: getXPForLevel(newLevel),
      rewards: generateLevelRewards(newLevel),
      timestamp: new Date().toISOString(),
    };

    return { profile: updatedProfile, levelUp: levelUpEvent };
  }

  return { profile: updatedProfile };
}

/**
 * Generate rewards for reaching a level
 */
function generateLevelRewards(level: number): string[] {
  const rewards: string[] = [];

  // Milestone rewards
  if (level === 5) rewards.push("Unlocked: Hard Difficulty");
  if (level === 10) rewards.push("Unlocked: Expert Difficulty");
  if (level === 15) rewards.push("Unlocked: Custom Avatars");
  if (level === 20) rewards.push("Unlocked: Leaderboards");
  if (level === 25) rewards.push("Unlocked: Daily Challenges");
  if (level === 50) rewards.push("Achievement: Halfway There!");
  if (level === 100) rewards.push("Achievement: Master Pianist!");

  // Every 10 levels
  if (level % 10 === 0) {
    rewards.push(`Title Unlocked: Level ${level} Virtuoso`);
  }

  return rewards;
}

// ============================================================
// STATISTICS UPDATES
// ============================================================

/**
 * Update profile statistics after a game
 */
export function updateStats(
  profile: PlayerProfile,
  gameStats: ExtendedGameStats,
  stars: number,
  duration: number,
): PlayerProfile {
  const stats = profile.stats;

  // Calculate new average accuracy
  const totalGames = stats.totalGamesPlayed + 1;
  const newAverageAccuracy =
    (stats.averageAccuracy * stats.totalGamesPlayed + gameStats.accuracy) /
    totalGames;

  const updatedStats: PlayerStats = {
    totalGamesPlayed: totalGames,
    totalScore: stats.totalScore + gameStats.score,
    totalNotesHit: stats.totalNotesHit + gameStats.hits,
    totalNotesMissed: stats.totalNotesMissed + gameStats.misses,
    bestCombo: Math.max(stats.bestCombo, gameStats.maxCombo),
    averageAccuracy: newAverageAccuracy,
    totalPlaytimeSeconds: stats.totalPlaytimeSeconds + duration,
    perfectPlusCount: stats.perfectPlusCount + gameStats.perfectPlus,
    perfectCount: stats.perfectCount + gameStats.perfect,
    greatCount: stats.greatCount + gameStats.great,
    goodCount: stats.goodCount + gameStats.good,
    totalStarsEarned: stats.totalStarsEarned + stars,
    songsCompleted: stats.songsCompleted + (gameStats.progress >= 1 ? 1 : 0),
    achievementsUnlocked: stats.achievementsUnlocked,
  };

  return {
    ...profile,
    stats: updatedStats,
    lastPlayedAt: new Date().toISOString(),
  };
}

// ============================================================
// PERSISTENCE (localStorage)
// ============================================================

/**
 * Save profile to localStorage
 */
export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  } catch (error) {
    console.error("Failed to save profile:", error);
  }
}

/**
 * Load profile from localStorage
 */
export function loadProfile(): PlayerProfile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!stored) return null;

    const profile = JSON.parse(stored) as PlayerProfile;

    // Validate profile structure
    if (!profile.id || !profile.username || typeof profile.level !== "number") {
      console.warn("Invalid profile structure, creating new profile");
      return null;
    }

    return profile;
  } catch (error) {
    console.error("Failed to load profile:", error);
    return null;
  }
}

/**
 * Get or create profile
 */
export function getOrCreateProfile(): PlayerProfile {
  const existing = loadProfile();
  if (existing) return existing;

  const newProfile = createProfile();
  saveProfile(newProfile);
  return newProfile;
}

/**
 * Reset profile to defaults
 */
export function resetProfile(): PlayerProfile {
  const newProfile = createProfile();
  saveProfile(newProfile);
  return newProfile;
}

/**
 * Update username
 */
export function updateUsername(
  profile: PlayerProfile,
  username: string,
): PlayerProfile {
  const updated = {
    ...profile,
    username: username.trim() || "Player",
  };
  saveProfile(updated);
  return updated;
}

/**
 * Update avatar
 */
export function updateAvatar(
  profile: PlayerProfile,
  avatar: string,
): PlayerProfile {
  const updated = {
    ...profile,
    avatar,
  };
  saveProfile(updated);
  return updated;
}

/**
 * Update settings
 */
export function updateSettings(
  profile: PlayerProfile,
  settings: Partial<PlayerProfile["settings"]>,
): PlayerProfile {
  const updated = {
    ...profile,
    settings: {
      ...profile.settings,
      ...settings,
    },
  };
  saveProfile(updated);
  return updated;
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

/**
 * Export profile as JSON string
 */
export function exportProfile(profile: PlayerProfile): string {
  return JSON.stringify(profile, null, 2);
}

/**
 * Import profile from JSON string
 */
export function importProfile(json: string): PlayerProfile | null {
  try {
    const profile = JSON.parse(json) as PlayerProfile;

    // Validate
    if (!profile.id || !profile.username || typeof profile.level !== "number") {
      throw new Error("Invalid profile format");
    }

    saveProfile(profile);
    return profile;
  } catch (error) {
    console.error("Failed to import profile:", error);
    return null;
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Format playtime as human-readable string
 */
export function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get rank title based on level
 */
export function getRankTitle(level: number): string {
  if (level >= 100) return "Grand Master";
  if (level >= 90) return "Virtuoso";
  if (level >= 80) return "Maestro";
  if (level >= 70) return "Expert";
  if (level >= 60) return "Professional";
  if (level >= 50) return "Advanced";
  if (level >= 40) return "Skilled";
  if (level >= 30) return "Intermediate";
  if (level >= 20) return "Apprentice";
  if (level >= 10) return "Novice";
  return "Beginner";
}

/**
 * Calculate profile completion percentage
 */
export function getProfileCompletion(profile: PlayerProfile): number {
  let completed = 0;
  const total = 10;

  // Basic info
  if (profile.username !== "Player") completed++;
  if (profile.avatar !== "🎹") completed++;

  // Progress
  if (profile.level >= 10) completed++;
  if (profile.level >= 25) completed++;
  if (profile.level >= 50) completed++;

  // Stats
  if (profile.stats.totalGamesPlayed >= 10) completed++;
  if (profile.stats.totalGamesPlayed >= 50) completed++;
  if (profile.stats.bestCombo >= 100) completed++;
  if (profile.stats.averageAccuracy >= 0.8) completed++;
  if (profile.achievements.length >= 10) completed++;

  return (completed / total) * 100;
}

// Made with Bob

// ============================================================
// TYPE CONVERSION HELPERS
// ============================================================

import type { EnhancedGameStats } from "../game/engine";

/**
 * Convert EnhancedGameStats to ExtendedGameStats
 * Fills in missing fields with default values
 */
export function enhancedToExtendedStats(
  enhanced: EnhancedGameStats,
  songId: string,
  songTitle: string,
  difficulty: GameDifficulty,
  stars: number,
  xpEarned: number,
  duration: number,
): ExtendedGameStats {
  return {
    // Core stats from EnhancedGameStats
    score: enhanced.score,
    combo: enhanced.combo,
    maxCombo: enhanced.maxCombo,
    hits: enhanced.hits,
    misses: enhanced.misses,
    perfectPlus: enhanced.perfectPlus,
    perfect: enhanced.perfect,
    great: enhanced.great,
    good: enhanced.good,
    accuracy: enhanced.accuracy,
    progress: enhanced.progress,
    totalTargets: enhanced.totalTargets,

    // Extended gamification stats
    stars,
    xpEarned,
    starPowerActivations: enhanced.starPowerActivations,
    perfectStreaks: enhanced.perfectStreak > 10 ? 1 : 0, // Count of streaks
    longestPerfectStreak: enhanced.longestPerfectStreak,
    averageHitTiming: 0, // TODO: Track this in future
    earlyHits: 0, // TODO: Track this in future
    lateHits: 0, // TODO: Track this in future
    difficulty,
    songId,
    songTitle,
    duration,
  };
}
