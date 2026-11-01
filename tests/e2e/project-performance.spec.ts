import { expect, test } from "@playwright/test";

test("10,000-note command and save cost is measured in Chromium", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/src/project/commands.ts");
  const databaseName = `project-performance-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { validateProjectDocument, validateFocusedPatternEdit } = await import("/src/project/validate.ts");
    const { hashProjectDocument } = await import("/src/project/canonical.ts");
    const { applyCommand, applySessionCommand } = await import("/src/project/commands.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSerializationClient } = await import("/src/project/serializationClient.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const base = createProjectDocument({ id: "perf-10k", at: 1000 });
    const notes = Array.from({ length: 10_000 }, (_, index) => ({
      id: `note-${index}`, startTick: index, durationTick: 1, pitch: 36 + index % 48,
      velocity: 1 + index % 127, releaseVelocity: 0, channel: 0, origin: { kind: "drawn" as const },
    }));
    const pattern = { id: "pattern-10k", name: "Performance", version: 1,
      lengthTicks: 10_000, notes, expression: [] };
    const document = { ...base, patterns: [pattern] };
    const validationStart = performance.now();
    validateProjectDocument(document);
    const validateMs = performance.now() - validationStart;
    const repository = new ProjectRepository({ databaseName: name });
    const session = await ProjectSession.create(repository, document, { autosaveDelayMs: 60_000 });
    const currentPattern = session.getSnapshot().document.patterns[0];
    const changedPattern = { ...currentPattern, version: 2,
      notes: currentPattern.notes.map((note, index) => index === 5000 ? { ...note, velocity: 127 } : note) };
    const frameBefore = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const editStart = performance.now();
    const edited = session.dispatch({ kind: "replacePattern", expectedVersion: 1, pattern: changedPattern, at: 2000 });
    const editMs = performance.now() - editStart;
    const frameAfter = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const editedPattern = edited.document.patterns[0];
    const nextPattern = { ...editedPattern, version: 3,
      notes: editedPattern.notes.map((note, index) => index === 5001 ? { ...note, velocity: 126 } : note) };
    const nextCommand = { kind: "replacePattern" as const, expectedVersion: 2,
      pattern: nextPattern, at: 3000 };
    const focusedStart = performance.now();
    const focusedValid = validateFocusedPatternEdit(editedPattern, nextPattern);
    const focusedMs = performance.now() - focusedStart;
    const focusedReducerStart = performance.now();
    const focusedResult = applySessionCommand(edited.document, nextCommand);
    const focusedReducerMs = performance.now() - focusedReducerStart;
    const deepFreeze = (value: unknown): void => {
      if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
      }
    };
    const focusedFreezeStart = performance.now();
    deepFreeze(focusedResult.document);
    const focusedFreezeMs = performance.now() - focusedFreezeStart;
    const bulkPattern = { ...editedPattern, version: 3,
      notes: editedPattern.notes.map((note, index) => index < 128 ? { ...note, velocity: 125 } : note) };
    const bulkCommand = { kind: "replacePattern" as const, expectedVersion: 2,
      pattern: bulkPattern, at: 3000 };
    const bulkStart = performance.now();
    const bulkValid = validateFocusedPatternEdit(editedPattern, bulkPattern);
    const bulkFocusedMs = performance.now() - bulkStart;
    const bulkReducerStart = performance.now();
    applySessionCommand(edited.document, bulkCommand);
    const bulkReducerMs = performance.now() - bulkReducerStart;
    const bulkFullStart = performance.now();
    applyCommand(edited.document, bulkCommand);
    const bulkFullMs = performance.now() - bulkFullStart;
    const drawnNote = { ...editedPattern.notes[0], id: "drawn-note", startTick: 9999 };
    const drawnPattern = { ...editedPattern, version: 3,
      notes: [...editedPattern.notes, drawnNote] };
    const drawCommand = { kind: "replacePattern" as const, expectedVersion: 2,
      pattern: drawnPattern, at: 3000 };
    const drawStart = performance.now();
    applySessionCommand(edited.document, drawCommand);
    const drawFocusedMs = performance.now() - drawStart;
    const drawFullStart = performance.now();
    applyCommand(edited.document, drawCommand);
    const drawFullMs = performance.now() - drawFullStart;
    const deletedPattern = { ...editedPattern, version: 3,
      notes: editedPattern.notes.filter((note) => note.id !== "note-5000") };
    const deleteCommand = { kind: "replacePattern" as const, expectedVersion: 2,
      pattern: deletedPattern, at: 3000 };
    const deleteStart = performance.now();
    applySessionCommand(edited.document, deleteCommand);
    const deleteFocusedMs = performance.now() - deleteStart;
    const deleteFullStart = performance.now();
    applyCommand(edited.document, deleteCommand);
    const deleteFullMs = performance.now() - deleteFullStart;
    const fullStart = performance.now();
    applyCommand(document, { kind: "replacePattern", expectedVersion: 1,
      pattern: { ...pattern, version: 2, notes: notes.map((note, index) =>
        index === 5000 ? { ...note, velocity: 127 } : note) }, at: 2000 });
    const fullMs = performance.now() - fullStart;
    const hashStart = performance.now();
    const hash = await hashProjectDocument(edited.document);
    const hashMs = performance.now() - hashStart;
    const cloneStart = performance.now();
    structuredClone(edited.document);
    const cloneMs = performance.now() - cloneStart;
    const hashClient = new ProjectSerializationClient();
    await hashClient.hash(createProjectDocument({ id: "worker-warmup", at: 1000 }));
    const workerEnqueueStart = performance.now();
    const workerHash = hashClient.hash(edited.document);
    const workerEnqueueMs = performance.now() - workerEnqueueStart;
    await workerHash;
    hashClient.close();
    let lastFrame = 0;
    let maxSaveFrameGapMs = 0;
    let trackingFrames = true;
    const trackFrame = (time: number) => {
      if (lastFrame !== 0) maxSaveFrameGapMs = Math.max(maxSaveFrameGapMs, time - lastFrame);
      lastFrame = time;
      if (trackingFrames) requestAnimationFrame(trackFrame);
    };
    requestAnimationFrame(trackFrame);
    await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const saveStart = performance.now();
    const revision = await session.save();
    const saveMs = performance.now() - saveStart;
    trackingFrames = false;
    const serializationMode = repository.serializationMode;
    const rawDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const putTransaction = rawDatabase.transaction("projectRevisions", "readwrite");
    const putStart = performance.now();
    putTransaction.objectStore("projectRevisions").put({ id: "scratch", schemaVersion: 1, revision: 1,
      hash, committedAt: 1000, document: edited.document });
    const putEnqueueMs = performance.now() - putStart;
    await new Promise<void>((resolve, reject) => {
      putTransaction.oncomplete = () => resolve();
      putTransaction.onabort = () => reject(putTransaction.error);
    });
    rawDatabase.close();
    await session.close();
    await repository.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return { validateMs, editMs, focusedValid, focusedMs, focusedReducerMs,
      bulkValid, bulkFocusedMs, bulkReducerMs, bulkFullMs,
      drawFocusedMs, drawFullMs, deleteFocusedMs, deleteFullMs,
      focusedFreezeMs, fullMs, frameGapMs: frameAfter - frameBefore, hashMs, saveMs,
      maxSaveFrameGapMs, serializationMode, cloneMs, workerEnqueueMs, putEnqueueMs,
      noteCount: edited.document.patterns[0].notes.length, hashMatches: hash === revision.hash,
      changedVelocity: edited.document.patterns[0].notes[5000].velocity };
  }, databaseName);
  expect(result.noteCount).toBe(10_000);
  expect(result.hashMatches).toBe(true);
  expect(result.changedVelocity).toBe(127);
  expect(result.focusedValid).toBe(true);
  expect(result.bulkValid).toBe(true);
  expect(result.serializationMode).toBe("worker");
  console.log(`PRJ Chromium 390x844 desktop CPU: validate=${result.validateMs.toFixed(1)}ms, session.replacePattern=${result.editMs.toFixed(1)}ms, focusedCheck=${result.focusedMs.toFixed(1)}ms, focusedReducer=${result.focusedReducerMs.toFixed(1)}ms, focusedFreeze=${result.focusedFreezeMs.toFixed(1)}ms, full reducer=${result.fullMs.toFixed(1)}ms, adjacent rAF=${result.frameGapMs.toFixed(1)}ms, direct hash=${result.hashMs.toFixed(1)}ms, clone=${result.cloneMs.toFixed(1)}ms, Worker enqueue=${result.workerEnqueueMs.toFixed(1)}ms, IDB put enqueue=${result.putEnqueueMs.toFixed(1)}ms, Worker save=${result.saveMs.toFixed(1)}ms, max save rAF=${result.maxSaveFrameGapMs.toFixed(1)}ms`);
  console.log(`PRJ 10k/128-note gesture: focusedCheck=${result.bulkFocusedMs.toFixed(1)}ms, focusedReducer=${result.bulkReducerMs.toFixed(1)}ms, fullReducer=${result.bulkFullMs.toFixed(1)}ms`);
  console.log(`PRJ 10k structural edits: draw focused=${result.drawFocusedMs.toFixed(1)}ms/full=${result.drawFullMs.toFixed(1)}ms, delete focused=${result.deleteFocusedMs.toFixed(1)}ms/full=${result.deleteFullMs.toFixed(1)}ms`);
});
