import type { ScoringConfig } from "../types/gamification";
import type {
  EnhancedGameStats,
  GameDifficulty,
  GameRunStats,
  HitGrade,
} from "./types";
import { addStarPower, initStarPower } from "./starPower";

export function createEmptyGameStats(totalTargets: number): GameRunStats {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    perfectPlus: 0,
    perfect: 0,
    great: 0,
    good: 0,
    accuracy: 0,
    progress: 0,
    totalTargets,
  };
}

export function applyGameHit(
  prev: GameRunStats,
  grade: Exclude<HitGrade, "miss">,
): GameRunStats {
  const basePoints =
    grade === "perfect_plus"
      ? 110
      : grade === "perfect"
        ? 100
        : grade === "great"
          ? 70
          : 40;

  const nextCombo = prev.combo + 1;
  const mult =
    nextCombo >= 50 ? 8 : nextCombo >= 25 ? 4 : nextCombo >= 10 ? 2 : 1;
  const nextScore = prev.score + basePoints * mult;
  const nextHits = prev.hits + 1;

  const next = {
    ...prev,
    score: nextScore,
    combo: nextCombo,
    maxCombo: Math.max(prev.maxCombo, nextCombo),
    hits: nextHits,
    perfectPlus: prev.perfectPlus + (grade === "perfect_plus" ? 1 : 0),
    perfect: prev.perfect + (grade === "perfect" ? 1 : 0),
    great: prev.great + (grade === "great" ? 1 : 0),
    good: prev.good + (grade === "good" ? 1 : 0),
  };

  const judged = next.hits + next.misses;
  const accuracy = judged > 0 ? next.hits / judged : 0;
  const progress = next.totalTargets > 0 ? judged / next.totalTargets : 0;

  return {
    ...next,
    accuracy,
    progress,
  };
}

export function applyGameMiss(prev: GameRunStats): GameRunStats {
  const next = {
    ...prev,
    misses: prev.misses + 1,
    combo: 0,
  };

  const judged = next.hits + next.misses;
  const accuracy = judged > 0 ? next.hits / judged : 0;
  const progress = next.totalTargets > 0 ? judged / next.totalTargets : 0;

  return {
    ...next,
    accuracy,
    progress,
  };
}

// Enhanced Combo Multipliers (Guitar Hero style)
export function getComboMultiplier(combo: number): number {
  if (combo >= 250) return 32;
  if (combo >= 100) return 16;
  if (combo >= 50) return 8;
  if (combo >= 25) return 4;
  if (combo >= 10) return 2;
  return 1;
}

// Calculate total score multiplier (combo + star power)
export function calculateScoreMultiplier(
  combo: number,
  starPowerActive: boolean,
): number {
  const comboMult = getComboMultiplier(combo);
  const starPowerMult = starPowerActive ? 2 : 1;
  return comboMult * starPowerMult;
}

export function createEnhancedGameStats(
  totalTargets: number,
): EnhancedGameStats {
  return {
    ...createEmptyGameStats(totalTargets),
    starPower: initStarPower(),
    perfectStreak: 0,
    longestPerfectStreak: 0,
    starPowerActivations: 0,
  };
}

export function applyEnhancedGameHit(
  prev: EnhancedGameStats,
  grade: Exclude<HitGrade, "miss">,
): EnhancedGameStats {
  const basePoints =
    grade === "perfect_plus"
      ? 110
      : grade === "perfect"
        ? 100
        : grade === "great"
          ? 70
          : 40;

  const nextCombo = prev.combo + 1;
  const multiplier = calculateScoreMultiplier(nextCombo, prev.starPower.active);

  // Perfect streak tracking
  const isPerfect = grade === "perfect_plus" || grade === "perfect";
  const nextPerfectStreak = isPerfect ? prev.perfectStreak + 1 : 0;
  const nextLongestStreak = Math.max(
    prev.longestPerfectStreak,
    nextPerfectStreak,
  );

  // Perfect streak bonus (50 points per note after 10 streak)
  const streakBonus =
    nextPerfectStreak >= 10 ? (nextPerfectStreak - 9) * 50 : 0;

  const nextScore = prev.score + basePoints * multiplier + streakBonus;
  const nextHits = prev.hits + 1;

  // Update star power
  const updatedStarPower = addStarPower(prev.starPower, grade);

  const next: EnhancedGameStats = {
    ...prev,
    score: nextScore,
    combo: nextCombo,
    maxCombo: Math.max(prev.maxCombo, nextCombo),
    hits: nextHits,
    perfectPlus: prev.perfectPlus + (grade === "perfect_plus" ? 1 : 0),
    perfect: prev.perfect + (grade === "perfect" ? 1 : 0),
    great: prev.great + (grade === "great" ? 1 : 0),
    good: prev.good + (grade === "good" ? 1 : 0),
    starPower: updatedStarPower,
    perfectStreak: nextPerfectStreak,
    longestPerfectStreak: nextLongestStreak,
  };

  const judged = next.hits + next.misses;
  const accuracy = judged > 0 ? next.hits / judged : 0;
  const progress = next.totalTargets > 0 ? judged / next.totalTargets : 0;

  return {
    ...next,
    accuracy,
    progress,
  };
}

export function applyEnhancedGameMiss(
  prev: EnhancedGameStats,
): EnhancedGameStats {
  const next: EnhancedGameStats = {
    ...prev,
    misses: prev.misses + 1,
    combo: 0,
    perfectStreak: 0, // Break perfect streak
  };

  const judged = next.hits + next.misses;
  const accuracy = judged > 0 ? next.hits / judged : 0;
  const progress = next.totalTargets > 0 ? judged / next.totalTargets : 0;

  return {
    ...next,
    accuracy,
    progress,
  };
}

// Calculate stars based on score percentage
export function calculateStars(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;

  const percentage = score / maxScore;

  if (percentage >= 0.95) return 5;
  if (percentage >= 0.9) return 4;
  if (percentage >= 0.8) return 3;
  if (percentage >= 0.7) return 2;
  if (percentage >= 0.6) return 1;
  return 0;
}

// Calculate theoretical max score for a chart
export function calculateMaxScore(
  totalNotes: number,
  _difficulty: GameDifficulty,
): number {
  // Assume all perfect_plus hits with max combo
  const basePoints = 110;
  const maxMultiplier = 32; // Max combo multiplier
  const starPowerMultiplier = 2;

  // Simplified: assume star power active for 50% of notes
  const notesWithStarPower = Math.floor(totalNotes * 0.5);
  const notesWithoutStarPower = totalNotes - notesWithStarPower;

  const scoreWithStarPower =
    notesWithStarPower * basePoints * maxMultiplier * starPowerMultiplier;
  const scoreWithoutStarPower =
    notesWithoutStarPower * basePoints * maxMultiplier;

  return scoreWithStarPower + scoreWithoutStarPower;
}

// Get scoring configuration
export function getScoringConfig(): ScoringConfig {
  return {
    basePoints: {
      perfectPlus: 110,
      perfect: 100,
      great: 70,
      good: 40,
    },
    comboMultipliers: [1, 2, 4, 8, 16, 32],
    comboThresholds: [0, 10, 25, 50, 100, 250],
    starPowerMultiplier: 2,
    perfectStreakBonus: 50,
    accuracyBonusThreshold: 0.95,
    accuracyBonusMultiplier: 1.1,
  };
}
