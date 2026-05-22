import { useCallback, useState } from "react";
import type { PlayerProfile, LevelUpEvent } from "../types/gamification";
import {
  getOrCreateProfile,
  saveProfile,
  resetProfile as resetProfileUtil,
  addXP as addXPUtil,
  updateUsername as updateUsernameUtil,
  updateAvatar as updateAvatarUtil,
  updateSettings as updateSettingsUtil,
} from "../utils/profile";
import {
  unlockAchievement as unlockAchievementUtil,
  getAchievementById,
} from "../utils/achievements";

export interface AchievementToast {
  name: string;
  icon: string;
  description: string;
}

export interface UseProfileApi {
  profile: PlayerProfile;
  setProfile: (p: PlayerProfile) => void;
  addXP: (amount: number) => LevelUpEvent | null;
  unlockAchievement: (id: string) => AchievementToast | null;
  updateUsername: (name: string) => void;
  updateAvatar: (avatar: string) => void;
  updateSettings: (s: Partial<PlayerProfile["settings"]>) => void;
  resetProfile: () => void;
}

/**
 * React wrapper over `utils/profile` and `utils/achievements`. Keeps a single
 * profile in state, persists every mutation, and surfaces level-up /
 * achievement events for UI toasts.
 */
export function useProfile(): UseProfileApi {
  const [profile, setProfileState] = useState<PlayerProfile>(() =>
    getOrCreateProfile(),
  );

  const setProfile = useCallback((p: PlayerProfile) => {
    setProfileState(p);
    saveProfile(p);
  }, []);

  const addXP = useCallback((amount: number): LevelUpEvent | null => {
    let levelUp: LevelUpEvent | null = null;
    setProfileState((prev) => {
      const result = addXPUtil(prev, amount);
      levelUp = result.levelUp ?? null;
      saveProfile(result.profile);
      return result.profile;
    });
    return levelUp;
  }, []);

  const unlockAchievement = useCallback(
    (id: string): AchievementToast | null => {
      let toast: AchievementToast | null = null;
      setProfileState((prev) => {
        if (prev.achievements.includes(id)) return prev;
        const updated = unlockAchievementUtil(prev, id);
        const ach = getAchievementById(id);
        if (ach) {
          toast = {
            name: ach.name,
            icon: ach.icon,
            description: ach.description,
          };
        }
        saveProfile(updated);
        return updated;
      });
      return toast;
    },
    [],
  );

  const updateUsername = useCallback((name: string) => {
    setProfileState((prev) => updateUsernameUtil(prev, name));
  }, []);

  const updateAvatar = useCallback((avatar: string) => {
    setProfileState((prev) => updateAvatarUtil(prev, avatar));
  }, []);

  const updateSettings = useCallback(
    (s: Partial<PlayerProfile["settings"]>) => {
      setProfileState((prev) => updateSettingsUtil(prev, s));
    },
    [],
  );

  const resetProfile = useCallback(() => {
    const fresh = resetProfileUtil();
    setProfileState(fresh);
  }, []);

  return {
    profile,
    setProfile,
    addXP,
    unlockAchievement,
    updateUsername,
    updateAvatar,
    updateSettings,
    resetProfile,
  };
}
