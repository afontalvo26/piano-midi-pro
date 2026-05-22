// Re-exports profile and achievement utilities behind the services facade.
export {
  getOrCreateProfile,
  saveProfile,
  loadProfile,
  resetProfile,
  calculateXPReward,
  addXP,
  updateStats,
  enhancedToExtendedStats,
  formatPlaytime,
  getRankTitle,
  getLevelProgress,
  getXPForLevel,
  calculateLevel,
  updateUsername,
  updateAvatar,
  updateSettings,
  exportProfile,
  importProfile,
} from "../utils/profile";

export {
  checkAchievements,
  unlockAchievement,
  getAchievementById,
} from "../utils/achievements";
