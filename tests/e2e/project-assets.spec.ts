import { expect, test } from "@playwright/test";

test("asset bytes must match before commit; project copy survives conflict and detects corruption", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/assets.ts");
  const databaseName = `project-assets-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository, ProjectConflictError } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { validateProjectDocument } = await import("/src/project/validate.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const other = new ProjectRepository({ databaseName: name });
    const bytes = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4])], { type: "audio/wav" });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await bytes.arrayBuffer())),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const ref = { id: "recorded-audio", sha256, byteLength: bytes.size, mimeType: bytes.type,
      sourceKind: "recorded" as const, license: "user-owned", frameCount: 8 };
    const sampleRegion = { startFrame: 0, endFrame: 8, fadeInFrames: 1, fadeOutFrames: 1,
      rootMidi: 60, cents: 0, reverse: false, loopMode: "none" as const, playMode: "oneShot" as const };
    const samplerTrack = { id: "sample-track", name: "Muestra propia", kind: "instrument" as const,
      instrument: { instrumentId: "user-sampler", packageVersion: `sha256:${sha256}`,
        presetId: `asset:${ref.id}`, sampleRegion },
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    const document = { ...createProjectDocument({ id: "original", at: 1000 }),
      assets: [ref], trackOrder: [samplerTrack.id], tracks: [samplerTrack] };
    let wrongSamplerLinkRejected = false;
    try { validateProjectDocument({ ...document, tracks: [{ ...samplerTrack,
      instrument: { ...samplerTrack.instrument, presetId: "asset:missing" } }] }); }
    catch { wrongSamplerLinkRejected = true; }
    let infiniteOneShotRejected = false;
    try { validateProjectDocument({ ...document, tracks: [{ ...samplerTrack,
      instrument: { ...samplerTrack.instrument,
        sampleRegion: { ...sampleRegion, loopMode: "loop", playMode: "oneShot" } } }] }); }
    catch { infiniteOneShotRejected = true; }
    let outOfFramesRejected = false;
    try { validateProjectDocument({ ...document, tracks: [{ ...samplerTrack,
      instrument: { ...samplerTrack.instrument, sampleRegion: { ...sampleRegion, endFrame: 9 } } }] }); }
    catch { outOfFramesRejected = true; }
    const assetErrorCode = (error: unknown) => error instanceof Error && "code" in error ? String(error.code) : "other";
    let missingCommitCode = "none";
    try { await repository.commitRevision(document, 0); }
    catch (error) { missingCommitCode = assetErrorCode(error); }
    const countBeforeStage = (await repository.list()).length;
    let wrongBytesCode = "none";
    try { await repository.stageAsset(ref, new Blob([new Uint8Array(8)], { type: "audio/wav" })); }
    catch (error) { wrongBytesCode = assetErrorCode(error); }
    const missing = await repository.inspectAssets(document.assets);
    await repository.stageAsset(ref, bytes);
    const available = await repository.inspectAssets(document.assets);
    const first = await ProjectSession.create(repository, document, { autosaveDelayMs: 60_000 });
    const second = await ProjectSession.open(other, document.id, { autosaveDelayMs: 60_000 });
    first.dispatch({ kind: "renameProject", name: "Edición remota", at: 1100 });
    await first.save();
    second.dispatch({ kind: "renameProject", name: "Edición local", at: 1200 });
    let conflictRejected = false;
    try { await second.save(); }
    catch (error) { conflictRejected = error instanceof ProjectConflictError; }
    const copy = await second.saveAsCopy({ id: "safe-copy", at: 1300 });
    const copyRead = await repository.read("safe-copy");
    const originalRead = await repository.read("original");
    const copiedBytes = await repository.readAsset(ref);
    await copy.close();
    await first.close();

    const assetDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${name}-assets`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = assetDb.transaction("assets", "readwrite");
      transaction.objectStore("assets").put({ sha256, byteLength: bytes.size, mimeType: bytes.type,
        data: new Blob([new Uint8Array(8).fill(9)], { type: "audio/wav" }) });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    assetDb.close();
    const corrupt = await repository.inspectAssets(document.assets);
    const stillOpens = await repository.read("original");
    let corruptCopyCode = "none";
    try { await repository.duplicate("original", { id: "bad-copy", name: "No", at: 1400 }); }
    catch (error) { corruptCopyCode = assetErrorCode(error); }
    await repository.stageAsset(ref, bytes);
    const repaired = await repository.inspectAssets(document.assets);
    const repairedCopy = await repository.duplicate("original", { id: "repaired-copy", name: "Sí", at: 1500 });
    await repository.close();
    await other.close();
    for (const database of [name, `${name}-assets`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return {
      missingCommitCode, countBeforeStage, wrongBytesCode, missing, available, conflictRejected,
      wrongSamplerLinkRejected, infiniteOneShotRejected, outOfFramesRejected,
      copyName: copyRead?.status === "ready" ? copyRead.value.document.name : null,
      originalName: originalRead?.status === "ready" ? originalRead.value.document.name : null,
      copiedBytes: copiedBytes?.size, corrupt, stillOpens: stillOpens?.status,
      corruptCopyCode, repaired, repairedCopyRevision: repairedCopy.revision,
    };
  }, databaseName);
  expect(result).toEqual({
    missingCommitCode: "missing", countBeforeStage: 0, wrongBytesCode: "corrupt",
    wrongSamplerLinkRejected: true, infiniteOneShotRejected: true, outOfFramesRejected: true,
    missing: [{ id: "recorded-audio", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), status: "missing" }],
    available: [{ id: "recorded-audio", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), status: "available" }],
    conflictRejected: true, copyName: "Edición local", originalName: "Edición remota", copiedBytes: 8,
    corrupt: [{ id: "recorded-audio", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), status: "corrupt" }],
    stillOpens: "ready", corruptCopyCode: "corrupt",
    repaired: [{ id: "recorded-audio", sha256: expect.stringMatching(/^[0-9a-f]{64}$/), status: "available" }],
    repairedCopyRevision: 1,
  });
});
