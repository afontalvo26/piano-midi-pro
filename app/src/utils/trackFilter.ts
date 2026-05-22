/**
 * Centralized track filtering logic.
 *
 * Used everywhere a "should this track be heard/seen?" decision happens:
 *   - Audio scheduler (Tone.Transport.schedule)
 *   - Falling notes canvas renderer
 *   - Game chart builder
 *   - Practice mode onset detector
 *   - Live MIDI input filter
 *
 * Keeping this in one place guarantees the audio you hear, the notes you
 * see falling, and the targets the game expects you to play are ALL based
 * on the same set of active tracks. Even if the user toggles mute / solo
 * mid-playback, every consumer that reads through this function will see
 * the change on the same frame.
 */

export interface TrackState {
  /** trackIndex → muted? */
  muted: Record<number, boolean>;
  /** trackIndex → soloed? */
  solo: Record<number, boolean>;
  /** trackIndex → user-assigned instrument name (overrides song default) */
  instruments: Record<number, string>;
  /** Hide every non-piano track. */
  pianoOnlyMode: boolean;
}

export interface SongTrackLike {
  index: number;
  instrument: string;
}

/**
 * Returns true if at least one track is in solo mode.
 * When this is true, only the soloed tracks should be heard.
 */
export function hasAnySolo(solo: Record<number, boolean>): boolean {
  for (const k in solo) if (solo[k]) return true;
  return false;
}

/**
 * Identifies non-piano tracks for the "Solo Piano" feature.
 * Piano-family instruments: piano, harpsichord, clavinet.
 */
export function buildNonPianoTrackSet(
  tracks: readonly SongTrackLike[],
  instruments: Record<number, string>,
): Set<number> {
  const out = new Set<number>();
  for (const t of tracks) {
    const inst = (instruments[t.index] ?? t.instrument).toLowerCase();
    if (
      !inst.includes("piano") &&
      !inst.includes("harpsichord") &&
      !inst.includes("clavinet")
    ) {
      out.add(t.index);
    }
  }
  return out;
}

/**
 * Decides whether a single note (identified by its trackIndex) should be
 * audible / visible given the current track configuration.
 *
 *   - muted track          → hidden
 *   - any solo active and this track NOT soloed → hidden
 *   - pianoOnlyMode and this is non-piano track → hidden
 *   - otherwise            → visible
 */
export function isTrackActive(
  trackIndex: number,
  state: TrackState,
  nonPianoTrackSet?: Set<number>,
): boolean {
  if (state.muted[trackIndex]) return false;
  if (hasAnySolo(state.solo) && !state.solo[trackIndex]) return false;
  if (state.pianoOnlyMode) {
    // The set is precomputed for performance; if not provided, skip the
    // pianoOnly check (caller guarantees they handle it elsewhere).
    if (nonPianoTrackSet?.has(trackIndex)) return false;
  }
  return true;
}

/**
 * Returns a per-track gain multiplier. Used by the scheduler to scale
 * note velocity at trigger time. Mute/solo logic returns 0 (silence)
 * which is functionally equivalent to skipping the trigger.
 *
 * Volumes default to 0.8 if not explicitly set.
 */
export function getTrackGain(
  trackIndex: number,
  volumes: Record<number, number>,
  state: TrackState,
  nonPianoTrackSet?: Set<number>,
): number {
  if (!isTrackActive(trackIndex, state, nonPianoTrackSet)) return 0;
  return volumes[trackIndex] !== undefined ? volumes[trackIndex] : 0.8;
}
