// Re-export of the rhythm/scoring engine. The folder currently exposes a
// single `engine.ts` module — we centralize service-layer access here so
// callers can `import { ... } from "../services"` without coupling to the
// internal layout of `game/`.
export {
  buildGameChart,
  classifyHit,
  computeAutoShiftTarget,
  getTimingWindows,
  createEmptyGameStats,
  createEnhancedGameStats,
  applyEnhancedGameHit,
  applyEnhancedGameMiss,
  calculateMaxScore,
  calculateStars,
  getComboMultiplier,
  initStarPower,
  activateStarPower,
  updateStarPower,
} from "../game/engine";

export type {
  GameMode,
  GameDifficulty,
  GameStatus,
  HitGrade,
  RhythmSourceNote,
  GameChartNote,
  TimingWindows,
  EnhancedGameStats,
  GameBestScore,
  GameRunStats,
} from "../game/engine";
