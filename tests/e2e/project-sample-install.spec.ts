import { expect, test } from "@playwright/test";

test("sample installation stages bytes before one reversible project command", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/userSampleInstall.ts");
  const databaseName = `sample-install-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { installUserSample } = await import("/src/project/userSampleInstall.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const session = await ProjectSession.create(repository, createProjectDocument({ id: "sample-project", at: 1000 }),
      { autosaveDelayMs: 60_000 });
    const data = new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: "audio/wav" });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer())),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const asset = { id: "sample-1", sha256, byteLength: data.size, mimeType: data.type,
      sourceKind: "user" as const, license: "user-controlled", frameCount: 8,
      sampleRate: 44100, channelCount: 1 };
    const options = { asset, trackId: "sample-track", patternId: "sample-pattern", clipId: "sample-clip",
      at: 1100, sampleRegion: { startFrame: 1, endFrame: 7, fadeInFrames: 1, fadeOutFrames: 1,
        rootMidi: 48, cents: -12, reverse: true, loopMode: "loop" as const, playMode: "gate" as const } };
    let badBytesRejected = false;
    try { await installUserSample(repository, session, { ...options,
      data: new Blob([new Uint8Array(8)], { type: "audio/wav" }) }); }
    catch { badBytesRejected = true; }
    const before = session.getSnapshot();
    const installed = await installUserSample(repository, session, { ...options, data });
    const stored = await repository.read("sample-project");
    const storedAsset = await repository.readAsset(asset);
    const changedRegion = { ...options.sampleRegion, startFrame: 2, endFrame: 6,
      fadeInFrames: 0, fadeOutFrames: 0, reverse: false };
    session.dispatch({ kind: "replaceSampleRegion", trackId: options.trackId,
      expected: installed.document.tracks[0]!.instrument!.sampleRegion, region: changedRegion, at: 1200 });
    const changed = session.getSnapshot();
    let staleRejected = false;
    try { session.dispatch({ kind: "replaceSampleRegion", trackId: options.trackId,
      expected: installed.document.tracks[0]!.instrument!.sampleRegion,
      region: options.sampleRegion, at: 1300 }); }
    catch { staleRejected = true; }
    let outOfFramesRejected = false;
    try { session.dispatch({ kind: "replaceSampleRegion", trackId: options.trackId,
      expected: changedRegion, region: { ...changedRegion, endFrame: 9 }, at: 1300 }); }
    catch { outOfFramesRejected = true; }
    session.undo();
    const regionUndone = session.getSnapshot();
    session.undo();
    const undone = session.getSnapshot();
    await session.save();
    await session.close();
    const reopened = await repository.read("sample-project");
    await repository.close();
    for (const database of [name, `${name}-assets`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { badBytesRejected,
      before: { assets: before.document.assets.length, tracks: before.document.tracks.length, revision: before.revision },
      installed: { status: installed.status, revision: installed.revision,
        assets: installed.document.assets.length, tracks: installed.document.tracks.length,
        patterns: installed.document.patterns.length, clips: installed.document.clips.length,
        region: installed.document.tracks[0]?.instrument?.sampleRegion },
      storedAssetSize: storedAsset?.size,
      storedCount: stored?.status === "ready" ? stored.value.document.assets.length : -1,
      changedRegion: changed.document.tracks[0]?.instrument?.sampleRegion,
      regionUndone: regionUndone.document.tracks[0]?.instrument?.sampleRegion,
      staleRejected, outOfFramesRejected,
      undone: [undone.document.assets.length, undone.document.tracks.length,
        undone.document.patterns.length, undone.document.clips.length],
      reopenedCount: reopened?.status === "ready" ? reopened.value.document.assets.length : -1,
    };
  }, databaseName);
  expect(result).toEqual({ badBytesRejected: true,
    before: { assets: 0, tracks: 0, revision: 1 },
    installed: { status: "clean", revision: 2, assets: 1, tracks: 1, patterns: 1, clips: 1,
      region: { startFrame: 1, endFrame: 7, fadeInFrames: 1, fadeOutFrames: 1,
        rootMidi: 48, cents: -12, reverse: true, loopMode: "loop", playMode: "gate" } },
    storedAssetSize: 8, storedCount: 1,
    changedRegion: { startFrame: 2, endFrame: 6, fadeInFrames: 0, fadeOutFrames: 0,
      rootMidi: 48, cents: -12, reverse: false, loopMode: "loop", playMode: "gate" },
    regionUndone: { startFrame: 1, endFrame: 7, fadeInFrames: 1, fadeOutFrames: 1,
      rootMidi: 48, cents: -12, reverse: true, loopMode: "loop", playMode: "gate" },
    staleRejected: true, outOfFramesRejected: true,
    undone: [0, 0, 0, 0], reopenedCount: 0 });
});
