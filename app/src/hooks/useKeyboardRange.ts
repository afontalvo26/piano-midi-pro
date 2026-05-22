import { useCallback } from "react";
import { useLocalStorageState } from "../utils/settings";
import {
  PIANO_MIN_MIDI,
  PIANO_MAX_MIDI,
  RANGE_KEY_COUNT,
  INITIAL_RANGE_START,
} from "../constants/piano";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Snap a MIDI note to the nearest C, clamped so the resulting 37-key window
 * stays inside the piano range.
 */
export function snapToC(n: number): number {
  return clamp(
    Math.round(n / 12) * 12,
    PIANO_MIN_MIDI,
    PIANO_MAX_MIDI - RANGE_KEY_COUNT + 1,
  );
}

export interface UseKeyboardRangeApi {
  rangeStart: number;
  rangeEnd: number;
  rangeCount: number;
  setRangeStart: (v: number | ((prev: number) => number)) => void;
  shiftBy: (delta: number) => void;
  shiftOctaveUp: () => void;
  shiftOctaveDown: () => void;
  resetRange: () => void;
}

/**
 * Manages the visible 37-key window over the 88-key piano. Persists the start
 * note in localStorage and exposes octave shift / reset helpers.
 */
export function useKeyboardRange(): UseKeyboardRangeApi {
  const [rangeStart, setRangeStart] = useLocalStorageState<number>(
    "piano_range_start",
    INITIAL_RANGE_START,
  );

  const shiftBy = useCallback(
    (delta: number) => {
      setRangeStart((prev) => snapToC(prev + delta));
    },
    [setRangeStart],
  );

  const shiftOctaveUp = useCallback(() => shiftBy(12), [shiftBy]);
  const shiftOctaveDown = useCallback(() => shiftBy(-12), [shiftBy]);

  const resetRange = useCallback(() => {
    setRangeStart(INITIAL_RANGE_START);
  }, [setRangeStart]);

  return {
    rangeStart,
    rangeEnd: rangeStart + RANGE_KEY_COUNT - 1,
    rangeCount: RANGE_KEY_COUNT,
    setRangeStart,
    shiftBy,
    shiftOctaveUp,
    shiftOctaveDown,
    resetRange,
  };
}
