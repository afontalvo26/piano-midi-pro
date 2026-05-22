import { useState, useEffect, useCallback } from "react";

/**
 * Like useState() but persists value to localStorage under `key`.
 * Reads stored value on init; writes on every change.
 * Falls back to `defaultValue` if nothing stored or parse fails.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Lazy init: read from localStorage once
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // corrupt or missing → fall through to default
    }
    return defaultValue;
  });

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // quota exceeded or storage disabled → silently ignore
    }
  }, [key, state]);

  // Stable setter that supports functional updates
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) =>
      typeof value === "function" ? (value as (prev: T) => T)(prev) : value,
    );
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
