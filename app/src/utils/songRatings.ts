// ============================================================
// SONG RATING & PROGRESS SYSTEM
// Tracks song completions, star ratings, and best scores
// ============================================================

import type {
  SongRating,
  SongProgress,
  ExtendedGameStats,
} from "../types/gamification";
import type { GameDifficulty } from "../game/engine";
import { STORAGE_KEYS, GAMIFICATION_CONSTANTS } from "../types/gamification";

// ============================================================
// STAR CALCULATION
// ============================================================

/**
 * Calculate stars (1-5) based on score percentage
 */
export function calculateStars(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;

  const percentage = score / maxScore;
  const thresholds = GAMIFICATION_CONSTANTS.STAR_THRESHOLDS;

  if (percentage >= thresholds[5]) return 5;
  if (percentage >= thresholds[4]) return 4;
  if (percentage >= thresholds[3]) return 3;
  if (percentage >= thresholds[2]) return 2;
  if (percentage >= thresholds[1]) return 1;
  return 0;
}

/**
 * Get star threshold percentage for a specific star count
 */
export function getStarThreshold(stars: number): number {
  return GAMIFICATION_CONSTANTS.STAR_THRESHOLDS[stars as 1 | 2 | 3 | 4 | 5] || 0;
}

/**
 * Calculate score needed for specific star rating
 */
export function getScoreForStars(stars: number, maxScore: number): number {
  const threshold = getStarThreshold(stars);
  return Math.ceil(maxScore * threshold);
}

// ============================================================
// SONG RATING MANAGEMENT
// ============================================================

/**
 * Create a song rating from game stats
 */
export function createSongRating(
  songId: string,
  songTitle: string,
  difficulty: GameDifficulty,
  gameStats: ExtendedGameStats,
  maxScore: number,
): SongRating {
  const stars = calculateStars(gameStats.score, maxScore);

  return {
    songId,
    songTitle,
    difficulty,
    stars,
    score: gameStats.score,
    maxScore,
    accuracy: gameStats.accuracy,
    maxCombo: gameStats.maxCombo,
    perfectPlus: gameStats.perfectPlus,
    perfect: gameStats.perfect,
    great: gameStats.great,
    good: gameStats.good,
    misses: gameStats.misses,
    completedAt: new Date().toISOString(),
    playCount: 1,
  };
}

/**
 * Save or update song rating
 */
export function saveSongRating(rating: SongRating): void {
  try {
    const ratings = getAllRatings();
    const key = `${rating.songId}_${rating.difficulty}`;

    const existing = ratings[key];

    // Only save if it's a better score or first time
    if (!existing || rating.score > existing.score) {
      ratings[key] = {
        ...rating,
        playCount: existing ? existing.playCount + 1 : 1,
      };
    } else {
      // Update play count even if score isn't better
      ratings[key] = {
        ...existing,
        playCount: existing.playCount + 1,
      };
    }

    localStorage.setItem(STORAGE_KEYS.SONG_RATINGS, JSON.stringify(ratings));
  } catch (error) {
    console.error("Failed to save song rating:", error);
  }
}

/**
 * Get rating for specific song and difficulty
 */
export function getSongRating(
  songId: string,
  difficulty: GameDifficulty,
): SongRating | null {
  const ratings = getAllRatings();
  const key = `${songId}_${difficulty}`;
  return ratings[key] || null;
}

/**
 * Get all ratings from localStorage
 */
export function getAllRatings(): Record<string, SongRating> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SONG_RATINGS);
    if (!stored) return {};
    return JSON.parse(stored) as Record<string, SongRating>;
  } catch (error) {
    console.error("Failed to load song ratings:", error);
    return {};
  }
}

/**
 * Get all ratings as array
 */
export function getAllRatingsArray(): SongRating[] {
  const ratings = getAllRatings();
  return Object.values(ratings);
}

// ============================================================
// SONG PROGRESS TRACKING
// ============================================================

/**
 * Get progress for a specific song across all difficulties
 */
export function getSongProgress(songId: string, songTitle: string): SongProgress {
  const ratings = getAllRatings();

  const easy = ratings[`${songId}_easy`];
  const normal = ratings[`${songId}_normal`];
  const hard = ratings[`${songId}_hard`];
  const expert = ratings[`${songId}_expert`];

  const allRatings = [easy, normal, hard, expert].filter(Boolean);

  const bestStars = Math.max(
    easy?.stars || 0,
    normal?.stars || 0,
    hard?.stars || 0,
    expert?.stars || 0,
  );

  const totalStars =
    (easy?.stars || 0) +
    (normal?.stars || 0) +
    (hard?.stars || 0) +
    (expert?.stars || 0);

  const completedDifficulties = allRatings.length;
  const completionPercentage = (completedDifficulties / 4) * 100;

  const firstPlayed = allRatings.reduce((earliest, r) => {
    return !earliest || r.completedAt < earliest ? r.completedAt : earliest;
  }, "");

  const lastPlayed = allRatings.reduce((latest, r) => {
    return !latest || r.completedAt > latest ? r.completedAt : latest;
  }, "");

  return {
    songId,
    songTitle,
    ratings: {
      easy,
      normal,
      hard,
      expert,
    },
    bestStars,
    totalStars,
    completionPercentage,
    firstPlayedAt: firstPlayed,
    lastPlayedAt: lastPlayed,
  };
}

/**
 * Get progress for all songs
 */
export function getAllSongProgress(): SongProgress[] {
  const ratings = getAllRatings();
  const songMap = new Map<string, string>(); // songId -> songTitle

  // Collect unique songs
  Object.values(ratings).forEach((rating) => {
    songMap.set(rating.songId, rating.songTitle);
  });

  // Build progress for each song
  const progressList: SongProgress[] = [];
  songMap.forEach((title, id) => {
    progressList.push(getSongProgress(id, title));
  });

  return progressList;
}

// ============================================================
// STATISTICS & QUERIES
// ============================================================

/**
 * Get total stars earned across all songs
 */
export function getTotalStars(): number {
  const ratings = getAllRatingsArray();
  return ratings.reduce((sum, r) => sum + r.stars, 0);
}

/**
 * Get count of completed songs (any difficulty)
 */
export function getCompletedSongsCount(): number {
  const ratings = getAllRatings();
  const uniqueSongs = new Set<string>();

  Object.values(ratings).forEach((rating) => {
    uniqueSongs.add(rating.songId);
  });

  return uniqueSongs.size;
}

/**
 * Get list of completed songs
 */
export function getCompletedSongs(): Array<{
  songId: string;
  songTitle: string;
  bestStars: number;
  totalStars: number;
}> {
  const progress = getAllSongProgress();

  return progress
    .filter((p) => p.totalStars > 0)
    .map((p) => ({
      songId: p.songId,
      songTitle: p.songTitle,
      bestStars: p.bestStars,
      totalStars: p.totalStars,
    }))
    .sort((a, b) => b.totalStars - a.totalStars);
}

/**
 * Get best scores across all songs
 */
export function getBestScores(limit: number = 10): SongRating[] {
  const ratings = getAllRatingsArray();

  return ratings
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get best scores for a specific difficulty
 */
export function getBestScoresByDifficulty(
  difficulty: GameDifficulty,
  limit: number = 10,
): SongRating[] {
  const ratings = getAllRatingsArray();

  return ratings
    .filter((r) => r.difficulty === difficulty)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get songs with 5 stars
 */
export function getPerfectSongs(): SongRating[] {
  const ratings = getAllRatingsArray();
  return ratings.filter((r) => r.stars === 5);
}

/**
 * Get recently played songs
 */
export function getRecentlyPlayed(limit: number = 10): SongRating[] {
  const ratings = getAllRatingsArray();

  return ratings
    .sort((a, b) => {
      return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    })
    .slice(0, limit);
}

/**
 * Get songs that need improvement (less than 3 stars)
 */
export function getSongsNeedingImprovement(): SongRating[] {
  const ratings = getAllRatingsArray();
  return ratings
    .filter((r) => r.stars < 3)
    .sort((a, b) => a.stars - b.stars);
}

// ============================================================
// DIFFICULTY STATISTICS
// ============================================================

/**
 * Get statistics for a specific difficulty
 */
export function getDifficultyStats(difficulty: GameDifficulty): {
  songsPlayed: number;
  averageStars: number;
  averageAccuracy: number;
  totalScore: number;
  bestCombo: number;
} {
  const ratings = getAllRatingsArray().filter((r) => r.difficulty === difficulty);

  if (ratings.length === 0) {
    return {
      songsPlayed: 0,
      averageStars: 0,
      averageAccuracy: 0,
      totalScore: 0,
      bestCombo: 0,
    };
  }

  const totalStars = ratings.reduce((sum, r) => sum + r.stars, 0);
  const totalAccuracy = ratings.reduce((sum, r) => sum + r.accuracy, 0);
  const totalScore = ratings.reduce((sum, r) => sum + r.score, 0);
  const bestCombo = Math.max(...ratings.map((r) => r.maxCombo));

  return {
    songsPlayed: ratings.length,
    averageStars: totalStars / ratings.length,
    averageAccuracy: totalAccuracy / ratings.length,
    totalScore,
    bestCombo,
  };
}

/**
 * Get overall statistics across all difficulties
 */
export function getOverallStats(): {
  totalSongs: number;
  totalPlays: number;
  averageStars: number;
  averageAccuracy: number;
  totalScore: number;
  bestCombo: number;
  perfectSongs: number;
} {
  const ratings = getAllRatingsArray();

  if (ratings.length === 0) {
    return {
      totalSongs: 0,
      totalPlays: 0,
      averageStars: 0,
      averageAccuracy: 0,
      totalScore: 0,
      bestCombo: 0,
      perfectSongs: 0,
    };
  }

  const uniqueSongs = new Set(ratings.map((r) => r.songId)).size;
  const totalPlays = ratings.reduce((sum, r) => sum + r.playCount, 0);
  const totalStars = ratings.reduce((sum, r) => sum + r.stars, 0);
  const totalAccuracy = ratings.reduce((sum, r) => sum + r.accuracy, 0);
  const totalScore = ratings.reduce((sum, r) => sum + r.score, 0);
  const bestCombo = Math.max(...ratings.map((r) => r.maxCombo));
  const perfectSongs = ratings.filter((r) => r.stars === 5).length;

  return {
    totalSongs: uniqueSongs,
    totalPlays,
    averageStars: totalStars / ratings.length,
    averageAccuracy: totalAccuracy / ratings.length,
    totalScore,
    bestCombo,
    perfectSongs,
  };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Clear all song ratings
 */
export function clearAllRatings(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SONG_RATINGS);
  } catch (error) {
    console.error("Failed to clear song ratings:", error);
  }
}

/**
 * Export ratings as JSON
 */
export function exportRatings(): string {
  const ratings = getAllRatings();
  return JSON.stringify(ratings, null, 2);
}

/**
 * Import ratings from JSON
 */
export function importRatings(json: string): boolean {
  try {
    const ratings = JSON.parse(json) as Record<string, SongRating>;
    localStorage.setItem(STORAGE_KEYS.SONG_RATINGS, JSON.stringify(ratings));
    return true;
  } catch (error) {
    console.error("Failed to import ratings:", error);
    return false;
  }
}

/**
 * Get star display string
 */
export function getStarDisplay(stars: number): string {
  return "⭐".repeat(Math.max(0, Math.min(5, stars)));
}

/**
 * Get difficulty color
 */
export function getDifficultyColor(difficulty: GameDifficulty): string {
  switch (difficulty) {
    case "easy":
      return "#10b981"; // Green
    case "normal":
      return "#3b82f6"; // Blue
    case "hard":
      return "#f59e0b"; // Orange
    case "expert":
      return "#ef4444"; // Red
    default:
      return "#6b7280"; // Gray
  }
}

/**
 * Get difficulty label
 */
export function getDifficultyLabel(difficulty: GameDifficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

// Made with Bob
