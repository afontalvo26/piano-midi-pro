import { expect, test } from "@playwright/test";

test("clip automation duplicate persists owner, local points and one undo through bundle", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/commands.ts");
  const databaseName = `duplicate-automation-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { exportProjectBundle, importProjectBundle } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const base = createProjectDocument({ id: "automation-clip", at: 1000 });
    const track = { id: "drums", name: "Batería", kind: "drum" as const,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false,
        armed: false, sends: [], effects: [] } };
    const pattern = { id: "pattern", name: "Beat", version: 1, lengthTicks: 960,
      notes: [], expression: [] };
    const clip = { id: "source", kind: "pattern" as const, trackId: track.id,
      sourceId: pattern.id, sourceVersion: 1, startTick: 0, lengthTicks: 960,
      sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false };
    const lane = { id: "clip-gain", target: { scope: "clip" as const,
      ownerId: clip.id, parameterId: "gainDb" }, points: [
      { id: "point-one", tick: 0, value: -12, shape: "step" as const },
      { id: "point-two", tick: 480, value: -3, shape: "linear" as const },
    ] };
    const session = await ProjectSession.create(repository, { ...base,
      tracks: [track], trackOrder: [track.id], patterns: [pattern],
      clips: [clip], automation: [lane] }, { autosaveDelayMs: 60_000 });
    session.dispatch({ kind: "duplicateClipWithAutomation", clipId: clip.id,
      expectedClip: clip, expectedLanes: [lane], newClipId: "copy", startTick: 1920,
      newLaneIds: ["copy-gain"], newPointIds: [["copy-one", "copy-two"]], at: 1100 });
    const applied = session.getSnapshot().document;
    session.undo();
    const undone = session.getSnapshot().document;
    session.redo();
    await session.save();
    const bundle = await exportProjectBundle(repository, base.id);
    const targetName = `${name}-imported`;
    const target = new ProjectRepository({ databaseName: targetName });
    const imported = await importProjectBundle(target, bundle,
      { id: "automation-imported", at: 1200 });
    const restored = await target.read(imported.projectId);
    await session.close();
    await repository.close();
    await target.close();
    for (const database of [name, `${name}-assets`, `${name}-drafts`,
      targetName, `${targetName}-assets`, `${targetName}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return {
      applied: [applied.clips.length, applied.automation.length],
      undone: [undone.clips.length, undone.automation.length],
      restored: restored?.status === "ready" ? {
        clipStart: restored.value.document.clips[1]?.startTick,
        owner: restored.value.document.automation[1]?.target.ownerId,
        points: restored.value.document.automation[1]?.points.map((point) =>
          [point.id, point.tick, point.value]),
      } : null,
      bundleType: bundle.type,
    };
  }, databaseName);
  expect(result).toEqual({ applied: [2, 2], undone: [1, 1],
    restored: { clipStart: 1920, owner: "copy", points: [
      ["copy-one", 0, -12], ["copy-two", 480, -3],
    ] }, bundleType: "application/vnd.piano-midi-pro.project+json" });
});
