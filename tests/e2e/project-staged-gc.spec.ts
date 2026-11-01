import { expect, test } from "@playwright/test";

test("staging GC keeps committed history and draft bytes, deletes only old orphans", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/repository.ts");
  const databaseName = `staged-gc-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const assets = await Promise.all([1, 2, 3, 4].map(async (number) => {
      const data = new Blob([new Uint8Array(12).fill(number)], { type: "audio/wav" });
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer())),
        (value) => value.toString(16).padStart(2, "0")).join("");
      return { ref: { id: `asset-${number}`, sha256, byteLength: data.size,
        mimeType: data.type, sourceKind: "user" as const, license: "user-owned" }, data };
    }));
    for (const { ref, data } of assets) await repository.stageAsset(ref, data);
    const base = createProjectDocument({ id: "gc-project", at: 1000 });
    await repository.commitRevision({ ...base, assets: [assets[0]!.ref] }, 0);
    await repository.commitRevision({ ...base, assets: [], updatedAt: 1100 }, 1);
    await repository.writeDraft({ ...base, assets: [assets[2]!.ref], updatedAt: 1200 },
      2, "crash-session", 1);
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${name}-assets`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = raw.transaction("assets", "readwrite");
      const store = transaction.objectStore("assets");
      const request = store.getAll();
      request.onsuccess = () => {
        for (const row of request.result) {
          if (row.sha256 !== assets[3]!.ref.sha256) store.put({ ...row,
            stagedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    raw.close();
    const first = await repository.collectStagedAssets();
    const afterFirst = await repository.inspectAssets(assets.map((asset) => asset.ref));
    const draftRaw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${name}-drafts`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = draftRaw.transaction("drafts", "readwrite");
      const store = transaction.objectStore("drafts");
      const request = store.get("gc-project\0crash-session");
      request.onsuccess = () => store.put({ ...request.result, hash: "0".repeat(64) });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    draftRaw.close();
    let corruptDraftBlockedGc = false;
    try { await repository.collectStagedAssets(); }
    catch { corruptDraftBlockedGc = true; }
    await repository.discardDraft("gc-project", "crash-session");
    const second = await repository.collectStagedAssets();
    const afterSecond = await repository.inspectAssets(assets.map((asset) => asset.ref));
    await repository.close();
    for (const database of [name, `${name}-assets`, `${name}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { first, afterFirst: afterFirst.map((asset) => asset.status),
      corruptDraftBlockedGc, second, afterSecond: afterSecond.map((asset) => asset.status) };
  }, databaseName);
  expect(result).toEqual({
    first: { status: "completed", deletedCount: 1, deletedBytes: 12 },
    afterFirst: ["available", "missing", "available", "available"],
    corruptDraftBlockedGc: true,
    second: { status: "completed", deletedCount: 1, deletedBytes: 12 },
    afterSecond: ["available", "missing", "missing", "available"],
  });
});
