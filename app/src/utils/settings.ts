import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Like useState() but persists value to localStorage under `key`.
 *
 * Reads stored value on init; writes only when the value changes from the
 * last successful write. This avoids overwriting localStorage on mount while
 * still persisting a later transition back to the initial value.
 *
 * Falls back to `defaultValue` if nothing stored or parse fails.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Lazy init reads localStorage once and captures the original serialized
  // form. We keep both the typed state AND the original serialized string
  // so we can later compare against it to avoid writing back identical
  // (or accidentally-default) values.
  const [{ value: state, initialSerialized }, setStateBundle] = useState<{
    value: T;
    initialSerialized: string;
  }>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        return { value: JSON.parse(stored) as T, initialSerialized: stored };
      }
    } catch {
      // corrupt or missing → fall through to default
    }
    return {
      value: defaultValue,
      initialSerialized: JSON.stringify(defaultValue),
    };
  });

  const lastPersistedRef = useRef(initialSerialized);
  useEffect(() => {
    try {
      const serialized = JSON.stringify(state);
      // The mount value is already in storage (or is the intended default).
      // Compare with the last write, not the immutable mount value: 0→1→0
      // must persist the final 0.
      if (serialized === lastPersistedRef.current) return;
      localStorage.setItem(key, serialized);
      lastPersistedRef.current = serialized;
    } catch {
      // quota exceeded or storage disabled → silently ignore
    }
  }, [key, state]);

  // Stable setter that supports functional updates
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStateBundle((prev) => {
      const next =
        typeof value === "function"
          ? (value as (prev: T) => T)(prev.value)
          : value;
      return { ...prev, value: next };
    });
  }, []);

  return [state, setValue];
}

/**
 * Removes a single setting from localStorage.
 * Does NOT affect React state — call setter with default after clearing.
 */
export function clearSetting(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // silently ignore
  }
}
