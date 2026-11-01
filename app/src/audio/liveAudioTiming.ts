import * as Tone from "tone";

/** Scheduling budget for Tone's clock; live key attacks use the immediate clock. */
export type AudioLatencyMode = "ultra" | "balanced";

const LOOK_AHEAD: Record<AudioLatencyMode, number> = {
  ultra: 0.06,
  balanced: 0.1,
};
const MIN_SCHEDULE_LEAD_SEC = 0.002;

/** Set Tone's clock window before the audio context begins running. */
export function configureAudioTiming(mode: AudioLatencyMode = "balanced"): number {
  const context = Tone.getContext() as Tone.Context;
  const windowSec = LOOK_AHEAD[mode];
  context.lookAhead = windowSec;
  context.updateInterval = windowSec / 3;
  return windowSec;
}

function currentLookAhead(): number {
  const value = Tone.getContext().lookAhead;
  return Number.isFinite(value) && value >= 0 ? value : LOOK_AHEAD.balanced;
}

/**
 * Schedule a human key against the hardware clock. Tone.now() includes the
 * scheduler window and would add that entire delay to every live note.
 */
export function liveNoteTime(eventTimestamp?: number): number {
  const elapsed = eventTimestamp !== undefined && Number.isFinite(eventTimestamp)
    ? Math.max(0, (performance.now() - eventTimestamp) / 1000) : 0;
  const pressedAt = Math.max(0, Tone.immediate() - elapsed);
  const earliest = Tone.getContext().rawContext.currentTime +
    MIN_SCHEDULE_LEAD_SEC - currentLookAhead();
  return Math.max(pressedAt, earliest);
}
