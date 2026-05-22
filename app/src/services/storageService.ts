// Typed wrapper around localStorage with in-memory fallback for environments
// where storage is unavailable, full, or restricted (private mode, SSR, etc.).
const memoryFallback = new Map<string, string>();

export const storageService = {
  get<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key) ?? memoryFallback.get(key);
      if (raw == null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      const raw = JSON.stringify(value);
      try {
        localStorage.setItem(key, raw);
      } catch {
        memoryFallback.set(key, raw);
      }
    } catch {
      // ignore — value cannot be serialized
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    memoryFallback.delete(key);
  },
  clear(): void {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    memoryFallback.clear();
  },
};
