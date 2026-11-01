import { expect, test } from "@playwright/test";

test("failed CAS returns only its new asset to staging and GC preserves committed history", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/repository.ts");
  const result = await page.evaluate(async (databaseName) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository, ProjectConflictError } = await import("/src/project/repository.ts");
    const firstTab = new ProjectRepository({ databaseName });
    const secondTab = new ProjectRepository({ databaseName });
    const assets = await Promise.all([1, 2, 3].map(async (number) => {
      const data = new Blob([new Uint8Array(16).fill(number)], { type: "audio/wav" });
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer())),
        (value) => value.toString(16).padStart(2, "0")).join("");
      return { ref: { id: `asset-${number}`, sha256, byteLength: data.size,
        mimeType: data.type, sourceKind: "user" as const, license: "user-owned" }, data };
    }));
    for (const asset of assets) await firstTab.stageAsset(asset.ref, asset.data);
    const base = createProjectDocument({ id: "cas-project", at: 1000 });
    await firstTab.commitRevision({ ...base, assets: [assets[0]!.ref] }, 0);
    // A remains protected after being removed from the head: an old Undo may still refer to it.
    await firstTab.commitRevision({ ...base, assets: [], updatedAt: 1100 }, 1);
    const other = createProjectDocument({ id: "other-project", at: 1200 });
    await firstTab.commitRevision({ ...other, assets: [assets[2]!.ref] }, 0);
    let conflict = false;
    try {
      await secondTab.commitRevision({ ...base, assets: [assets[0]!.ref, assets[1]!.ref],
        updatedAt: 1300 }, 1);
    } catch (error) { conflict = error instanceof ProjectConflictError; }
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${databaseName}-assets`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let flags: boolean[] = [];
    await new Promise<void>((resolve, reject) => {
      const transaction = raw.transaction("assets", "readwrite");
      const request = transaction.objectStore("assets").getAll();
      request.onsuccess = () => {
        const rows = request.result as { sha256: string; everCommitted: boolean }[];
        flags = assets.map((asset) => rows.find((row) => row.sha256 === asset.ref.sha256)!.everCommitted);
        for (const row of request.result) transaction.objectStore("assets").put({ ...row,
          stagedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    raw.close();
    const gc = await firstTab.collectStagedAssets();
    const states = (await firstTab.inspectAssets(assets.map((asset) => asset.ref)))
      .map((asset) => asset.status);
    const head = await firstTab.read(base.id);
    await firstTab.close();
    await secondTab.close();
    for (const database of [databaseName, `${databaseName}-assets`, `${databaseName}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { conflict, flags, gc, states, headRevision: head?.status === "ready" ? head.value.revision : 0 };
  }, `failed-cas-assets-${crypto.randomUUID()}`);
  expect(result).toEqual({ conflict: true, flags: [true, false, true],
    gc: { status: "completed", deletedCount: 1, deletedBytes: 16 },
    states: ["available", "missing", "available"], headRevision: 2 });
});
