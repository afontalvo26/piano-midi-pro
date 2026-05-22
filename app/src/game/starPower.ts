import type { StarPowerState } from "../types/gamification";
import type { HitGrade } from "./types";

export function initStarPower(): StarPowerState {
  return {
    available: 0,
    active: false,
    duration: 0,
    maxDuration: 10, // 10 seconds
    multiplier: 2, // 2x score when active
    activationThreshold: 50, // Need 50% to activate
  };
}

export function addStarPower(
  state: StarPowerState,
  grade: HitGrade,
): StarPowerState {
  if (state.active) return state; // Don't accumulate while active

  const gain =
    grade === "perfect_plus"
      ? 5
      : grade === "perfect"
        ? 3
        : grade === "great"
          ? 1
          : 0;

  const newAvailable = Math.min(100, state.available + gain);

  return {
    ...state,
    available: newAvailable,
  };
}

export function activateStarPower(state: StarPowerState): StarPowerState {
  if (state.active || state.available < state.activationThreshold) {
    return state;
  }

  return {
    ...state,
    active: true,
    duration: state.maxDuration,
    available: 0, // Consume all star power
  };
}

export function updateStarPower(
  state: StarPowerState,
  deltaTime: number,
): StarPowerState {
  if (!state.active) return state;

  const newDuration = Math.max(0, state.duration - deltaTime);

  if (newDuration <= 0) {
    return {
      ...state,
      active: false,
      duration: 0,
    };
  }

  return {
    ...state,
    duration: newDuration,
  };
}
