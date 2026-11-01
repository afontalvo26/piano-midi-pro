import { expect, test } from "@playwright/test";

test("project revisions survive reopen, reject stale commits and keep future schemas read-only", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/repository.ts");
  const databaseName = `project-repository-e2e-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { applyCommand } = await import("/src/project/commands.ts");
    const { ProjectRepository, ProjectConflictError, FutureProjectVersionError } = await import("/src/project/repository.ts");
    const first = new ProjectRepository({ databaseName: name });
    const second = new ProjectRepository({ databaseName: name });
    const document = createProjectDocument({ id: "own-project", name: "Beat original", at: 1000 });
    const initial = await first.commitRevision(document, 0);
    const secondRead = await second.read(document.id);
    const renamed = applyCommand(document, { kind: "renameProject", name: "Beat editado", at: 2000 });
    const updated = await first.commitRevision(renamed.document, 1);
    let staleCommitRejected = false;
    try {
      await second.commitRevision(document, 1);
    } catch (error) {
      staleCommitRejected = error instanceof ProjectConflictError;
    }
    const afterConflict = await second.read(document.id);
    const indexAfterConflict = await second.list();
    await first.close();
    await second.close();

    const reopened = new ProjectRepository({ databaseName: name });
    const afterReopen = await reopened.read(document.id);
    const copied = await reopened.duplicate(document.id, { id: "own-project-copy", name: "Beat copia", at: 2500 });
    const copyRead = await reopened.read(copied.projectId);
    await reopened.close();

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = upgraded.transaction(["projectRevisions", "projectIndex"], "readwrite");
      tx.objectStore("projectRevisions").put({
        id: document.id, schemaVersion: 2, revision: 3, hash: "future-hash",
        committedAt: 3000, document: { id: document.id, schemaVersion: 2 },
      });
      tx.objectStore("projectIndex").put({
        id: document.id, name: "Proyecto futuro", schemaVersion: 2, revision: 3, updatedAt: 3000,
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    upgraded.close();

    const futureRepository = new ProjectRepository({ databaseName: name });
    const future = await futureRepository.read(document.id);
    const futureList = await futureRepository.list();
    let futureWriteRejected = false;
    try {
      await futureRepository.commitRevision(renamed.document, 2);
    } catch (error) {
      futureWriteRejected = error instanceof FutureProjectVersionError;
    }
    await futureRepository.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return {
      initialRevision: initial.revision,
      initialHash: initial.hash,
      secondReadStatus: secondRead?.status,
      updatedRevision: updated.revision,
      staleCommitRejected,
      afterConflict: afterConflict?.status === "ready" ?
        { revision: afterConflict.value.revision, name: afterConflict.value.document.name } : null,
      indexAfterConflict,
      afterReopen: afterReopen?.status === "ready" ?
        { revision: afterReopen.value.revision, hash: afterReopen.value.hash } : null,
      copy: copyRead?.status === "ready" ? {
        id: copyRead.value.document.id, name: copyRead.value.document.name,
        revision: copyRead.value.revision,
      } : null,
      future,
      futureList,
      futureWriteRejected,
    };
  }, databaseName);

  expect(result.initialRevision).toBe(1);
  expect(result.initialHash).toMatch(/^[0-9a-f]{64}$/);
  expect(result.secondReadStatus).toBe("ready");
  expect(result.updatedRevision).toBe(2);
  expect(result.staleCommitRejected).toBe(true);
  expect(result.afterConflict).toEqual({ revision: 2, name: "Beat editado" });
  expect(result.indexAfterConflict).toMatchObject([{ id: "own-project", revision: 2, readOnly: false }]);
  expect(result.afterReopen).toEqual({ revision: 2, hash: result.afterReopen?.hash });
  expect(result.copy).toEqual({ id: "own-project-copy", name: "Beat copia", revision: 1 });
  expect(result.future).toMatchObject({ status: "future-version", projectId: "own-project", schemaVersion: 2 });
  expect(result.futureList).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "own-project", schemaVersion: 2, readOnly: true }),
  ]));
  expect(result.futureWriteRejected).toBe(true);
});

test("a full project fixture round-trips structurally and rejects a corrupted stored hash", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/repository.ts");
  const databaseName = `project-fixture-e2e-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { canonicalizeProjectDocument } = await import("/src/project/canonical.ts");
    const { ProjectRepository, ProjectIntegrityError } = await import("/src/project/repository.ts");
    const base = createProjectDocument({ id: "fixture-1000", at: 1000 });
    const track = { id: "track-1", name: "Piano", kind: "instrument" as const,
      mix: { gainDb: -6, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    const assetData = Array.from({ length: 10 }, (_, index) =>
      new Blob([new Uint8Array(100).fill(index + 1)], { type: "audio/wav" }));
    const assets = await Promise.all(assetData.map(async (data, index) => ({
      id: `asset-${index}`,
      sha256: Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer())),
        (value) => value.toString(16).padStart(2, "0")).join(""),
      byteLength: data.size, mimeType: data.type, sourceKind: "user" as const, license: "user-owned",
    })));
    const document = {
      ...base, trackOrder: [track.id], tracks: [track],
      patterns: [{ id: "pattern-1", name: "Compás", version: 1, lengthTicks: 3840,
        notes: Array.from({ length: 1000 }, (_, index) => ({
          id: `note-${index}`, startTick: index * 3, durationTick: 120, pitch: 36 + index % 48,
          velocity: 1 + index % 127, releaseVelocity: 0, channel: 0,
          origin: { kind: "drawn" as const },
        })), expression: [] }],
      clips: Array.from({ length: 20 }, (_, index) => ({
        id: `clip-${index}`, kind: "pattern" as const, trackId: track.id, sourceId: "pattern-1", sourceVersion: 1,
        startTick: index * 3840, lengthTicks: 3840, sourceOffsetTick: 0,
        loopMode: "none" as const, tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
      })),
      assets,
      automation: [{ id: "lane-1", target: { scope: "track" as const, ownerId: track.id, parameterId: "volume" },
        points: Array.from({ length: 10 }, (_, index) => ({
          id: `point-${index}`, tick: index * 960, value: index - 6, shape: "linear" as const,
        })) }],
    };
    const originalJson = canonicalizeProjectDocument(document);
    const first = new ProjectRepository({ databaseName: name });
    for (let index = 0; index < assets.length; index += 1) await first.stageAsset(assets[index]!, assetData[index]!);
    const written = await first.commitRevision(document, 0);
    const copied = await first.duplicate(document.id, { id: "verified-copy", name: "Copia", at: 2000 });
    const assetCopyVerified = copied.document.assets.length === 10 &&
      (await first.readAsset(assets[0]!))?.size === 100;
    await first.close();
    const reopened = new ProjectRepository({ databaseName: name });
    const loaded = await reopened.read(document.id);
    const sameJson = loaded?.status === "ready" && canonicalizeProjectDocument(loaded.value.document) === originalJson;
    const sameHash = loaded?.status === "ready" && loaded.value.hash === written.hash;
    await reopened.close();

    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = raw.transaction("projectRevisions", "readwrite");
      const request = tx.objectStore("projectRevisions").get(document.id);
      request.onsuccess = () => tx.objectStore("projectRevisions").put({ ...request.result, hash: "0".repeat(64) });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    raw.close();
    const corruptReader = new ProjectRepository({ databaseName: name });
    let corruptionRejected = false;
    try { await corruptReader.read(document.id); }
    catch (error) { corruptionRejected = error instanceof ProjectIntegrityError; }
    await corruptReader.close();
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
    return { sameJson, sameHash, corruptionRejected, assetCopyVerified, noteCount: document.patterns[0].notes.length,
      clipCount: document.clips.length, assetCount: document.assets.length };
  }, databaseName);
  expect(result).toEqual({ sameJson: true, sameHash: true, corruptionRejected: true, assetCopyVerified: true,
    noteCount: 1000, clipCount: 20, assetCount: 10 });
});
