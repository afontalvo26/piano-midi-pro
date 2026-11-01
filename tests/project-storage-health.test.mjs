import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateImportSpace, getProjectStorageHealth,
  requestProjectStoragePersistence } from "../app/src/project/storageHealth.ts";

test("quota estimate is conservative and persistence is requested only explicitly", async () => {
  let persistCalls = 0;
  const fake = {
    estimate: async () => ({ usage: 4_000_000, quota: 10_000_000 }),
    persisted: async () => false,
    persist: async () => { persistCalls++; return true; },
  };
  const health = await getProjectStorageHealth(fake);
  assert.deepEqual(health, { supported: true, usageBytes: 4_000_000,
    quotaBytes: 10_000_000, estimatedFreeBytes: 6_000_000, persistent: false });
  assert.equal(persistCalls, 0);
  assert.deepEqual(estimateImportSpace(1_000_000, health), { allowed: true, uncertain: false,
    requiredBytes: 2_298_576, estimatedFreeBytes: 6_000_000 });
  assert.equal(estimateImportSpace(5_000_000, health).allowed, false);
  assert.equal(await requestProjectStoragePersistence(fake), true);
  assert.equal(persistCalls, 1);
});

test("unsupported quota APIs stay explicit and never claim durability", async () => {
  const unsupported = await getProjectStorageHealth(undefined);
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.persistent, null);
  assert.deepEqual(estimateImportSpace(10_000, unsupported), { allowed: true, uncertain: true,
    requiredBytes: 1_061_076, estimatedFreeBytes: null });
  assert.equal(await requestProjectStoragePersistence(undefined), false);
  assert.throws(() => estimateImportSpace(-1, unsupported), /Tamaño/);
});
