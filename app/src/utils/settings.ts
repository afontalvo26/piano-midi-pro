import { useState, useEffect, useCallback } from "react";

/**
 * Like useState() but persists value to localStorage under `key`.
 *
 * Reads stored value on init; writes only when the value actually changes
 * from what was loaded. This avoids overwriting localStorage with the
 * default value on mount, which would clobber any direct localStorage
 * writes made by other code paths (e.g. async loaders that bypass React
 * state).
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

  useEffect(() => {
    try {
      const serialized = JSON.stringify(state);
      // Skip write if the value is identical to what was loaded — prevents
      // wiping fresh writes made by other code paths during the same render.
      if (serialized === initialSerialized) return;
      localStorage.setItem(key, serialized);
    } catch {
      // quota exceeded or storage disabled → silently ignore
    }
  }, [key, state, initialSerialized]);

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
