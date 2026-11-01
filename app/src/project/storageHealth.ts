export interface ProjectStorageHealth {
  readonly supported: boolean;
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
  readonly estimatedFreeBytes: number | null;
  readonly persistent: boolean | null;
}

export interface ImportSpaceEstimate {
  readonly allowed: boolean;
  readonly uncertain: boolean;
  readonly requiredBytes: number;
  readonly estimatedFreeBytes: number | null;
}

function storage(): StorageManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.storage;
}

/** Browser quota numbers are estimates, not a durability guarantee. QuotaExceededError remains authoritative. */
export async function getProjectStorageHealth(manager: StorageManager | undefined = storage()): Promise<ProjectStorageHealth> {
  if (!manager?.estimate) {
    return { supported: false, usageBytes: null, quotaBytes: null,
      estimatedFreeBytes: null, persistent: null };
  }
  const [estimate, persistent] = await Promise.all([
    manager.estimate(), manager.persisted?.().catch(() => null) ?? Promise.resolve(null),
  ]);
  const usageBytes = Number.isSafeInteger(estimate.usage) && (estimate.usage ?? -1) >= 0 ? estimate.usage! : null;
  const quotaBytes = Number.isSafeInteger(estimate.quota) && (estimate.quota ?? -1) >= 0 ? estimate.quota! : null;
  return { supported: true, usageBytes, quotaBytes,
    estimatedFreeBytes: usageBytes !== null && quotaBytes !== null ? Math.max(0, quotaBytes - usageBytes) : null,
    persistent };
}

/** Call only from an explicit storage/settings action; it never runs during project creation. */
export async function requestProjectStoragePersistence(manager: StorageManager | undefined = storage()): Promise<boolean> {
  if (!manager?.persist) return false;
  return manager.persist();
}

/** Adds 25% plus 1 MiB headroom for IndexedDB indexes and browser accounting. */
export function estimateImportSpace(assetBytes: number, health: ProjectStorageHealth): ImportSpaceEstimate {
  if (!Number.isSafeInteger(assetBytes) || assetBytes < 0) throw new RangeError("Tamaño de importación inválido");
  const requiredBytes = Math.ceil(assetBytes * 1.25) + 1024 * 1024;
  if (!Number.isSafeInteger(requiredBytes)) throw new RangeError("Importación fuera de tamaño seguro");
  return { allowed: health.estimatedFreeBytes === null || health.estimatedFreeBytes >= requiredBytes,
    uncertain: health.estimatedFreeBytes === null, requiredBytes,
    estimatedFreeBytes: health.estimatedFreeBytes };
}
