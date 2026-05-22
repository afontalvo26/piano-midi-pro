// ============================================================
// PROFILE PANEL COMPONENT
// Comprehensive player profile viewing and management
// ============================================================

import { useState, useMemo } from "react";
import type { PlayerProfile } from "../../types/gamification";
import {
  formatPlaytime,
  getRankTitle,
  getLevelProgress,
  getXPForLevel,
  updateUsername,
  updateAvatar,
} from "../../utils/profile";
import {
  getAchievementDefinitions,
  getUnlockedAchievements,
  getLockedAchievements,
  getAchievementProgress,
} from "../../utils/achievements";
import {
  getAllSongProgress,
  getStarDisplay,
  getDifficultyColor,
  getDifficultyLabel,
} from "../../utils/songRatings";

interface ProfilePanelProps {
  profile: PlayerProfile;
  onProfileUpdate: (profile: PlayerProfile) => void;
  onClose: () => void;
}

export function ProfilePanel({
  profile,
  onProfileUpdate,
  onClose,
}: ProfilePanelProps) {
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(profile.username);
  const [selectedTab, setSelectedTab] = useState<
    "stats" | "achievements" | "songs"
  >("stats");

  const levelProgress = getLevelProgress(profile);
  const nextLevelXP = getXPForLevel(profile.level + 1);
  const currentLevelXP = getXPForLevel(profile.level);
  const xpNeeded = nextLevelXP - profile.totalXP;

  const unlockedAchievements = useMemo(
    () => getUnlockedAchievements(profile),
    [profile],
  );
  const lockedAchievements = useMemo(
    () => getLockedAchievements(profile),
    [profile],
  );
  const allAchievements = useMemo(
    () => getAchievementDefinitions(),
    [],
  );

  const songProgress = useMemo(() => getAllSongProgress(), []);

  const handleSaveUsername = () => {
    const updated = updateUsername(profile, usernameInput);
    onProfileUpdate(updated);
    setIsEditingUsername(false);
  };

  const handleCancelEdit = () => {
    setUsernameInput(profile.username);
    setIsEditingUsername(false);
  };

  const avatarOptions = ["🎹", "🎵", "🎼", "🎸", "🎺", "🎷", "🎻", "🥁", "🎤", "🎧"];

  return (
    <div className="profile-panel-overlay" onClick={onClose}>
      <div className="profile-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="profile-header">
          <button className="profile-close-btn" onClick={onClose}>
            ✕
          </button>

          <div className="profile-avatar-section">
            <div className="profile-avatar-large">{profile.avatar}</div>
            <div className="profile-avatar-picker">
              {avatarOptions.map((emoji) => (
                <button
                  key={emoji}
                  className={`avatar-option ${profile.avatar === emoji ? "active" : ""}`}
                  onClick={() => {
                    const updated = updateAvatar(profile, emoji);
                    onProfileUpdate(updated);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="profile-info">
            {isEditingUsername ? (
              <div className="username-edit">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  maxLength={20}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveUsername();
                    if (e.key === "Escape") handleCancelEdit();
                  }}
                />
                <button onClick={handleSaveUsername}>✓</button>
                <button onClick={handleCancelEdit}>✕</button>
              </div>
            ) : (
              <h2 className="profile-username">
                {profile.username}
                <button
                  className="edit-username-btn"
                  onClick={() => setIsEditingUsername(true)}
                >
                  ✏️
                </button>
              </h2>
            )}

            <div className="profile-rank">{getRankTitle(profile.level)}</div>

            <div className="profile-level-badge">
              <span className="level-number">Level {profile.level}</span>
            </div>

            <div className="profile-xp-bar">
              <div className="xp-bar-bg">
                <div
                  className="xp-bar-fill"
                  style={{ width: `${levelProgress * 100}%` }}
                />
              </div>
              <div className="xp-bar-text">
                {profile.currentXP.toLocaleString()} /{" "}
                {(nextLevelXP - currentLevelXP).toLocaleString()} XP
                <span className="xp-needed">
                  ({xpNeeded.toLocaleString()} to next level)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            className={`profile-tab ${selectedTab === "stats" ? "active" : ""}`}
            onClick={() => setSelectedTab("stats")}
          >
            📊 Statistics
          </button>
          <button
            className={`profile-tab ${selectedTab === "achievements" ? "active" : ""}`}
            onClick={() => setSelectedTab("achievements")}
          >
            🏆 Achievements ({unlockedAchievements.length}/{allAchievements.length})
          </button>
          <button
            className={`profile-tab ${selectedTab === "songs" ? "active" : ""}`}
            onClick={() => setSelectedTab("songs")}
          >
            🎵 Songs ({songProgress.length})
          </button>
        </div>

        {/* Content */}
        <div className="profile-content">
          {selectedTab === "stats" && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">🎮</div>
                <div className="stat-value">
                  {profile.stats.totalGamesPlayed}
                </div>
                <div className="stat-label">Games Played</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">💯</div>
                <div className="stat-value">
                  {profile.stats.totalScore.toLocaleString()}
                </div>
                <div className="stat-label">Total Score</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🔥</div>
                <div className="stat-value">{profile.stats.bestCombo}</div>
                <div className="stat-label">Best Combo</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🎯</div>
                <div className="stat-value">
                  {(profile.stats.averageAccuracy * 100).toFixed(1)}%
                </div>
                <div className="stat-label">Avg Accuracy</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">⭐</div>
                <div className="stat-value">{profile.stats.totalStarsEarned}</div>
                <div className="stat-label">Total Stars</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🎵</div>
                <div className="stat-value">{profile.stats.songsCompleted}</div>
                <div className="stat-label">Songs Completed</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">⏱️</div>
                <div className="stat-value">
                  {formatPlaytime(profile.stats.totalPlaytimeSeconds)}
                </div>
                <div className="stat-label">Playtime</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">🏆</div>
                <div className="stat-value">
                  {profile.stats.achievementsUnlocked}
                </div>
                <div className="stat-label">Achievements</div>
              </div>

              {/* Hit Distribution */}
              <div className="stat-card-wide">
                <h3>Hit Distribution</h3>
                <div className="hit-distribution">
                  <div className="hit-bar">
                    <span className="hit-label perfect-plus">Perfect+</span>
                    <div className="hit-bar-bg">
                      <div
                        className="hit-bar-fill perfect-plus"
                        style={{
                          width: `${(profile.stats.perfectPlusCount / Math.max(1, profile.stats.totalNotesHit)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="hit-count">
                      {profile.stats.perfectPlusCount}
                    </span>
                  </div>
                  <div className="hit-bar">
                    <span className="hit-label perfect">Perfect</span>
                    <div className="hit-bar-bg">
                      <div
                        className="hit-bar-fill perfect"
                        style={{
                          width: `${(profile.stats.perfectCount / Math.max(1, profile.stats.totalNotesHit)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="hit-count">
                      {profile.stats.perfectCount}
                    </span>
                  </div>
                  <div className="hit-bar">
                    <span className="hit-label great">Great</span>
                    <div className="hit-bar-bg">
                      <div
                        className="hit-bar-fill great"
                        style={{
                          width: `${(profile.stats.greatCount / Math.max(1, profile.stats.totalNotesHit)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="hit-count">{profile.stats.greatCount}</span>
                  </div>
                  <div className="hit-bar">
                    <span className="hit-label good">Good</span>
                    <div className="hit-bar-bg">
                      <div
                        className="hit-bar-fill good"
                        style={{
                          width: `${(profile.stats.goodCount / Math.max(1, profile.stats.totalNotesHit)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="hit-count">{profile.stats.goodCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTab === "achievements" && (
            <div className="achievements-section">
              <h3>Unlocked ({unlockedAchievements.length})</h3>
              <div className="achievements-grid">
                {unlockedAchievements.map((achievement) => (
                  <div key={achievement.id} className="achievement-card unlocked">
                    <div className="achievement-icon">{achievement.icon}</div>
                    <div className="achievement-info">
                      <div className="achievement-name">{achievement.name}</div>
                      <div className="achievement-desc">
                        {achievement.description}
                      </div>
                      <div className="achievement-reward">
                        +{achievement.reward.xp} XP
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <h3>Locked ({lockedAchievements.length})</h3>
              <div className="achievements-grid">
                {lockedAchievements.map((achievement) => {
                  const progress = getAchievementProgress(achievement, profile);
                  return (
                    <div key={achievement.id} className="achievement-card locked">
                      <div className="achievement-icon grayscale">
                        {achievement.icon}
                      </div>
                      <div className="achievement-info">
                        <div className="achievement-name">{achievement.name}</div>
                        <div className="achievement-desc">
                          {achievement.description}
                        </div>
                        <div className="achievement-progress">
                          <div className="progress-bar-bg">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${progress * 100}%` }}
                            />
                          </div>
                          <span className="progress-text">
                            {(progress * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedTab === "songs" && (
            <div className="songs-section">
              {songProgress.length === 0 ? (
                <div className="empty-state">
                  <p>No songs played yet. Start playing to see your progress!</p>
                </div>
              ) : (
                <div className="songs-list">
                  {songProgress
                    .sort((a, b) => b.totalStars - a.totalStars)
                    .map((song) => (
                      <div key={song.songId} className="song-progress-card">
                        <div className="song-title">{song.songTitle}</div>
                        <div className="song-stars">
                          {getStarDisplay(song.bestStars)}
                          <span className="star-count">
                            {song.totalStars} / 20 stars
                          </span>
                        </div>
                        <div className="song-difficulties">
                          {(["easy", "normal", "hard", "expert"] as const).map(
                            (diff) => {
                              const rating = song.ratings[diff];
                              return (
                                <div
                                  key={diff}
                                  className={`difficulty-badge ${rating ? "completed" : "locked"}`}
                                  style={{
                                    borderColor: getDifficultyColor(diff),
                                  }}
                                >
                                  <span className="diff-label">
                                    {getDifficultyLabel(diff)}
                                  </span>
                                  {rating && (
                                    <>
                                      <span className="diff-stars">
                                        {getStarDisplay(rating.stars)}
                                      </span>
                                      <span className="diff-score">
                                        {rating.score.toLocaleString()}
                                      </span>
                                    </>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Made with Bob
