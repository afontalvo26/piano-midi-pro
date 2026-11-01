import { expect, test } from "@playwright/test";

test("gesture undo/redo, save, reopen and autosave keep one project document", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/session.ts");
  const databaseName = `project-session-e2e-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const session = await ProjectSession.create(repository,
      createProjectDocument({ id: "session-project", at: 1000 }), { autosaveDelayMs: 60_000 });
    const seenStates: string[] = [];
    const unsubscribe = session.subscribe(() => { seenStates.push(session.getSnapshot().status); });
    const track = { id: "track-1", name: "Piano", kind: "instrument" as const,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    const pattern = { id: "pattern-1", name: "Beat", version: 1, lengthTicks: 3840, notes: [], expression: [] };
    const clip = { id: "clip-1", kind: "pattern" as const, trackId: track.id, sourceId: pattern.id,
      sourceVersion: 1, startTick: 0, lengthTicks: 3840, sourceOffsetTick: 0,
      loopMode: "none" as const, tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false };
    session.dispatch({ kind: "createTrack", track, at: 1100 }, "gesture-one");
    session.dispatch({ kind: "createPattern", pattern, at: 1200 }, "gesture-one");
    session.dispatch({ kind: "createClip", clip, at: 1300 }, "gesture-one");
    const pending = session.getSnapshot();
    session.undo();
    const afterUndo = session.getSnapshot();
    session.redo();
    const afterRedo = session.getSnapshot();
    const saved = await session.save();
    const savedStatus = session.getSnapshot().status;
    unsubscribe();
    await session.close();
    await repository.close();

    const reopenedRepository = new ProjectRepository({ databaseName: name });
    const reopened = await ProjectSession.open(reopenedRepository, "session-project", { autosaveDelayMs: 10 });
    const loaded = reopened.getSnapshot();
    const autosaveFinished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Autosave no terminó")), 3000);
      const unsubscribeAuto = reopened.subscribe(() => {
        const state = reopened.getSnapshot();
        if (state.status === "clean" && state.revision === 3) {
          clearTimeout(timer); unsubscribeAuto(); resolve();
        }
      });
    });
    reopened.dispatch({ kind: "renameProject", name: "Guardado automático", at: 1400 });
    await autosaveFinished;
    const autosaved = reopened.getSnapshot();
    await reopened.close();
    await reopenedRepository.close();

    const finalRepository = new ProjectRepository({ databaseName: name });
    const final = await finalRepository.read("session-project");
    await finalRepository.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return {
      pending: { status: pending.status, canUndo: pending.canUndo, trackCount: pending.document.tracks.length,
        clipCount: pending.document.clips.length },
      afterUndo: { trackCount: afterUndo.document.tracks.length, patternCount: afterUndo.document.patterns.length,
        clipCount: afterUndo.document.clips.length, canRedo: afterUndo.canRedo },
      afterRedo: { trackCount: afterRedo.document.tracks.length, clipCount: afterRedo.document.clips.length },
      savedRevision: saved.revision, savedStatus, loadedRevision: loaded.revision,
      loadedClipCount: loaded.document.clips.length, autosavedRevision: autosaved.revision,
      finalName: final?.status === "ready" ? final.value.document.name : null,
      seenStates,
    };
  }, databaseName);
  expect(result.pending).toEqual({ status: "pending", canUndo: true, trackCount: 1, clipCount: 1 });
  expect(result.afterUndo).toEqual({ trackCount: 0, patternCount: 0, clipCount: 0, canRedo: true });
  expect(result.afterRedo).toEqual({ trackCount: 1, clipCount: 1 });
  expect(result.savedRevision).toBe(2);
  expect(result.savedStatus).toBe("clean");
  expect(result.loadedRevision).toBe(2);
  expect(result.loadedClipCount).toBe(1);
  expect(result.autosavedRevision).toBe(3);
  expect(result.finalName).toBe("Guardado automático");
  expect(result.seenStates).toContain("saving");
});

test("transient save failure retries and a real CAS conflict never overwrites local edits", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/session.ts");
  const databaseName = `project-session-errors-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository, ProjectConflictError } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const created = await ProjectSession.create(repository,
      createProjectDocument({ id: "conflict-project", at: 1000 }), { autosaveDelayMs: 60_000 });
    await created.close();
    let failOnce = true;
    const flaky = {
      read: (id: string) => repository.read(id),
      commitRevision: (document: Parameters<typeof repository.commitRevision>[0], revision: number) => {
        if (failOnce) { failOnce = false; return Promise.reject(new Error("fallo temporal")); }
        return repository.commitRevision(document, revision);
      },
    };
    const retrying = await ProjectSession.open(flaky, "conflict-project", { autosaveDelayMs: 60_000 });
    retrying.dispatch({ kind: "renameProject", name: "Conservado", at: 1100 });
    let saveFailed = false;
    try { await retrying.save(); } catch { saveFailed = true; }
    const afterFailure = retrying.getSnapshot();
    const retried = await retrying.retrySave();
    await retrying.close();

    const secondRepository = new ProjectRepository({ databaseName: name });
    const firstSession = await ProjectSession.open(repository, "conflict-project", { autosaveDelayMs: 60_000 });
    const secondSession = await ProjectSession.open(secondRepository, "conflict-project", { autosaveDelayMs: 60_000 });
    firstSession.dispatch({ kind: "renameProject", name: "Primera pestaña", at: 1200 });
    await firstSession.save();
    secondSession.dispatch({ kind: "renameProject", name: "Segunda pestaña local", at: 1200 });
    let conflictRejected = false;
    try { await secondSession.save(); }
    catch (error) { conflictRejected = error instanceof ProjectConflictError; }
    const local = secondSession.getSnapshot();
    const remote = await repository.read("conflict-project");
    let retryConflictRejected = false;
    try { await secondSession.retrySave(); } catch { retryConflictRejected = true; }
    const copySession = await secondSession.saveAsCopy({ id: "conflict-copy", at: 1300 });
    const localCopy = copySession.getSnapshot();
    const remoteCopy = await repository.read("conflict-copy");
    await copySession.close();
    await firstSession.close();
    await repository.close();
    await secondRepository.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return {
      saveFailed, afterFailure: { status: afterFailure.status, name: afterFailure.document.name },
      retriedRevision: retried.revision, conflictRejected,
      local: { status: local.status, name: local.document.name, revision: local.revision },
      remote: remote?.status === "ready" ? { name: remote.value.document.name, revision: remote.value.revision } : null,
      retryConflictRejected,
      localCopy: { id: localCopy.document.id, name: localCopy.document.name, status: localCopy.status },
      remoteCopy: remoteCopy?.status === "ready" ? { id: remoteCopy.value.document.id,
        name: remoteCopy.value.document.name, revision: remoteCopy.value.revision } : null,
    };
  }, databaseName);
  expect(result.saveFailed).toBe(true);
  expect(result.afterFailure).toEqual({ status: "error", name: "Conservado" });
  expect(result.retriedRevision).toBe(2);
  expect(result.conflictRejected).toBe(true);
  expect(result.local).toEqual({ status: "conflict", name: "Segunda pestaña local", revision: 2 });
  expect(result.remote).toEqual({ name: "Primera pestaña", revision: 3 });
  expect(result.retryConflictRejected).toBe(true);
  expect(result.localCopy).toEqual({ id: "conflict-copy", name: "Segunda pestaña local", status: "clean" });
  expect(result.remoteCopy).toEqual({ id: "conflict-copy", name: "Segunda pestaña local", revision: 1 });
});
