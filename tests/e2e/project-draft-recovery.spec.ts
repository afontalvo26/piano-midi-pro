import { expect, test } from "@playwright/test";

test("an interrupted edit journal reopens as verified copy without replacing confirmed revision", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/drafts.ts");
  const databaseName = `draft-recovery-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const originalRepo = new ProjectRepository({ databaseName: name });
    const interrupted = await ProjectSession.create(originalRepo,
      createProjectDocument({ id: "original", name: "Confirmado", at: 1000 }),
      { autosaveDelayMs: 60_000, draftDelayMs: 60_000 });
    interrupted.dispatch({ kind: "renameProject", name: "Cambio pendiente", at: 1100 });
    await interrupted.flushDraft();
    const statusAfterFlush = interrupted.getSnapshot();
    const draftRows = await originalRepo.listDrafts("original");
    // Simulate process death: the session never calls save or close.
    await originalRepo.close();
    const reopenedRepo = new ProjectRepository({ databaseName: name });
    const confirmed = await reopenedRepo.read("original");
    const recovered = await reopenedRepo.recoverDraftAsCopy("original", draftRows[0]!.sessionId,
      { id: "recovered-copy", at: 2000 });
    const originalAfter = await reopenedRepo.read("original");
    const recoveryAfter = await reopenedRepo.read("recovered-copy");
    const draftDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`${name}-drafts`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = draftDb.transaction("drafts", "readwrite");
      const request = transaction.objectStore("drafts").get(`original\0${draftRows[0]!.sessionId}`);
      request.onsuccess = () => transaction.objectStore("drafts").put({ ...request.result, hash: "0".repeat(64) });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    draftDb.close();
    const corrupted = await reopenedRepo.listDrafts("original");
    let corruptRecoveryRejected = false;
    try { await reopenedRepo.recoverDraftAsCopy("original", draftRows[0]!.sessionId,
      { id: "corrupt-copy", at: 3000 }); }
    catch { corruptRecoveryRejected = true; }
    const saved = await ProjectSession.open(reopenedRepo, "original", { autosaveDelayMs: 60_000 });
    saved.dispatch({ kind: "renameProject", name: "Guardado nuevo", at: 4000 });
    await saved.flushDraft();
    const draftsBeforeSave = await reopenedRepo.listDrafts("original");
    await saved.save();
    const draftsAfterSave = await reopenedRepo.listDrafts("original");
    await saved.close();
    await reopenedRepo.close();
    for (const database of [name, `${name}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return {
      statusAfterFlush: { save: statusAfterFlush.status, draft: statusAfterFlush.draftStatus },
      draftStatus: draftRows[0]?.status, draftBaseRevision: draftRows[0]?.baseRevision,
      confirmedName: confirmed?.status === "ready" ? confirmed.value.document.name : null,
      recoveredName: recovered.document.name,
      originalNameAfter: originalAfter?.status === "ready" ? originalAfter.value.document.name : null,
      recoveryNameAfter: recoveryAfter?.status === "ready" ? recoveryAfter.value.document.name : null,
      recoveredRevision: recovered.revision, corruptStatus: corrupted[0]?.status,
      corruptRecoveryRejected, draftsBeforeSave: draftsBeforeSave.length,
      draftsAfterSave: draftsAfterSave.length,
    };
  }, databaseName);
  expect(result).toEqual({
    statusAfterFlush: { save: "pending", draft: "ready" }, draftStatus: "verified", draftBaseRevision: 1,
    confirmedName: "Confirmado", recoveredName: "Cambio pendiente",
    originalNameAfter: "Confirmado", recoveryNameAfter: "Cambio pendiente", recoveredRevision: 1,
    corruptStatus: "corrupt", corruptRecoveryRejected: true, draftsBeforeSave: 2, draftsAfterSave: 1,
  });
});
