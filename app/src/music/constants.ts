// ============================================================
// music/constants — values shared across the player module.
// ============================================================

/**
 * Fraction of a track's duration that counts as a *natural* end rather than
 * a user-driven stop. The engine's rAF loop finishes a track by resetting to
 * 0, so "did it play to the end?" is answered by comparing the last observed
 * position against the duration.
 */
export const ENDED_TOLERANCE = 0.85;

/** Seconds of playback after which "previous" restarts instead of rewinding. */
export const RESTART_THRESHOLD = 3;

/** Keyboard seek step, and the Shift+arrow step. */
export const SEEK_STEP = 5;
export const SEEK_STEP_LARGE = 30;
