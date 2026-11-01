import { expect, test } from "@playwright/test";

test("versioned bundles restore project and asset bytes, reject tampering before writing", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/bundle.ts");
  const databaseName = `project-bundle-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { exportProjectBundle, importProjectBundle, ProjectBundleError } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const base = createProjectDocument({ id: "source-project", name: "Beat propio", at: 1000 });
    const document = { ...base, patterns: [{ id: "pattern-1", name: "Hook", version: 1, lengthTicks: 3840,
      notes: [{ id: "note-1", startTick: 960, durationTick: 240, pitch: 60,
        velocity: 100, releaseVelocity: 20, channel: 0, origin: { kind: "drawn" as const } }], expression: [] }] };
    await repository.commitRevision(document, 0);
    const bundle = await exportProjectBundle(repository, document.id);
    const text = await bundle.text();
    const altered = new Blob([text.replace('"name":"Beat propio"', '"name":"Beat ajeno"')], { type: bundle.type });
    let alteredRejected = false;
    try { await importProjectBundle(repository, altered, { id: "tampered", at: 2000 }); }
    catch (error) { alteredRejected = error instanceof ProjectBundleError && error.code === "invalid"; }
    const afterTamper = await repository.list();
    const restored = await importProjectBundle(repository, bundle, { id: "restored-project", at: 3000 });
    const restoredRead = await repository.read(restored.projectId);
    const originalRead = await repository.read(document.id);
    let collisionRejected = false;
    try { await importProjectBundle(repository, bundle, { id: document.id, at: 4000 }); }
    catch { collisionRejected = true; }
    const assetBytes = new Blob([new Uint8Array(100).fill(7)], { type: "audio/wav" });
    const assetHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await assetBytes.arrayBuffer())),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const withAsset = { ...base, id: "with-asset", assets: [{ id: "asset-1", sha256: assetHash,
      byteLength: 100, mimeType: "audio/wav", sourceKind: "user" as const, license: "user-owned" }] };
    await repository.stageAsset(withAsset.assets[0], assetBytes);
    await repository.commitRevision(withAsset, 0);
    const assetBundle = await exportProjectBundle(repository, withAsset.id);
    const corruptedBytes = new Uint8Array(await assetBundle.arrayBuffer());
    corruptedBytes[corruptedBytes.length - 1] ^= 1;
    let corruptedAssetRejected = false;
    try { await importProjectBundle(repository, new Blob([corruptedBytes]), { id: "bad-asset", at: 5000 }); }
    catch (error) { corruptedAssetRejected = error instanceof Error && "code" in error && error.code === "invalid"; }
    const countAfterBadAsset = (await repository.list()).length;
    const assetCopy = await importProjectBundle(repository, assetBundle, { id: "asset-copy", at: 6000 });
    const restoredAsset = await repository.readAsset(assetCopy.document.assets[0]);
    await repository.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(`${name}-assets`);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return {
      alteredRejected, countAfterTamper: afterTamper.length,
      restored: restoredRead?.status === "ready" ? {
        id: restoredRead.value.document.id, name: restoredRead.value.document.name,
        note: restoredRead.value.document.patterns[0].notes[0].pitch,
        revision: restoredRead.value.revision,
      } : null,
      originalName: originalRead?.status === "ready" ? originalRead.value.document.name : null,
      collisionRejected, bundleType: bundle.type, assetBundleType: assetBundle.type,
      corruptedAssetRejected, countAfterBadAsset, restoredAssetSize: restoredAsset?.size,
    };
  }, databaseName);
  expect(result).toEqual({ alteredRejected: true, countAfterTamper: 1,
    restored: { id: "restored-project", name: "Beat propio", note: 60, revision: 1 },
    originalName: "Beat propio", collisionRejected: true,
    bundleType: "application/vnd.piano-midi-pro.project+json",
    assetBundleType: "application/vnd.piano-midi-pro.project",
    corruptedAssetRejected: true, countAfterBadAsset: 3, restoredAssetSize: 100 });
});
