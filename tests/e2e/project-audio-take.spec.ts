import { expect, test } from "@playwright/test";

test("audio capture stages bytes then adds take and clip atomically with undo", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/audioTakeInstall.ts");
  const databaseName = `audio-take-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { addRecordedAudioTake } = await import("/src/project/audioTakeInstall.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const base = createProjectDocument({ id: "audio-project", at: 1000 });
    const track = { id: "audio-track", name: "Micrófono", kind: "audio" as const,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    const session = await ProjectSession.create(repository,
      { ...base, tracks: [track], trackOrder: [track.id] }, { autosaveDelayMs: 60_000 });
    const data = new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: "audio/wav" });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer())),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const asset = { id: "mic-asset", sha256, byteLength: data.size, mimeType: data.type,
      sourceKind: "recorded" as const, license: "user-owned", frameCount: 100,
      sampleRate: 48000, channelCount: 1 };
    const take = { id: "mic-take", kind: "audio" as const, assetId: asset.id, createdAt: 1100,
      audioCapture: { startTick: 0, startAudioTime: 2.5, frameCount: 100,
        sampleRate: 48000, channelCount: 1, deviceId: "user-mic",
        latencyOffsetFrames: -32, incomplete: false } };
    const clip = { id: "mic-clip", kind: "audio" as const, trackId: track.id,
      sourceId: asset.id, startTick: 0, lengthTicks: 3840, sourceOffsetTick: 0,
      loopMode: "none" as const, tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
      sourceStartFrame: 0, sourceEndFrame: 100, fadeInFrames: 0, fadeOutFrames: 0 };
    let badBytesRejected = false;
    try { await addRecordedAudioTake(repository, session, { asset, take, clip,
      data: new Blob([new Uint8Array(8)], { type: "audio/wav" }), at: 1100 }); }
    catch { badBytesRejected = true; }
    const before = session.getSnapshot();
    const installed = await addRecordedAudioTake(repository, session, { asset, take, clip, data, at: 1100 });
    const stored = await repository.read(base.id);
    session.undo();
    const undone = session.getSnapshot();
    session.redo();
    const redone = session.getSnapshot();
    await session.save();
    await session.close();
    const loaded = await repository.read(base.id);
    await repository.close();
    for (const database of [name, `${name}-assets`, `${name}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { badBytesRejected, before: [before.document.assets.length,
      before.document.takes.length, before.document.clips.length],
      installed: [installed.document.assets.length, installed.document.takes.length,
        installed.document.clips.length, installed.status],
      storedTake: stored?.status === "ready" ? stored.value.document.takes[0]?.audioCapture?.deviceId : null,
      undone: [undone.document.assets.length, undone.document.takes.length, undone.document.clips.length],
      redone: [redone.document.assets.length, redone.document.takes.length, redone.document.clips.length],
      loadedClipId: loaded?.status === "ready" ? loaded.value.document.clips[0]?.id : null };
  }, databaseName);
  expect(result).toEqual({ badBytesRejected: true, before: [0, 0, 0],
    installed: [1, 1, 1, "clean"], storedTake: "user-mic",
    undone: [0, 0, 0], redone: [1, 1, 1], loadedClipId: "mic-clip" });
});

test("captured WAV with new track survives a cross-tab save conflict as a copy", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/audioTakeInstall.ts");
  const databaseName = `capture-conflict-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { installAudioCapture } = await import("/src/project/audioTakeInstall.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const session = await ProjectSession.create(repository,
      createProjectDocument({ id: "mic-project", at: 1000 }), { autosaveDelayMs: 60_000 });
    const rival = await ProjectSession.open(repository, "mic-project", { autosaveDelayMs: 60_000 });
    rival.dispatch({ kind: "renameProject", name: "Rival", at: 1100 });
    await rival.save();
    const data = new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: "audio/wav" });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer())),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const ref = { id: "capture-asset", sha256, byteLength: data.size, mimeType: data.type,
      sourceKind: "recorded" as const, license: "user-controlled", frameCount: 100,
      sampleRate: 48000, channelCount: 1 };
    const capture = { data, ref, trackId: "capture-track", epoch: 1, startTick: 480,
      startAudioTime: 2.5, endAudioTime: 2.503, frameCount: 100, sampleRate: 48000,
      channelCount: 1, deviceId: "mic-1", latencyOffsetFrames: -12,
      incomplete: false, reason: "stop", clippedSamples: 0 };
    const track = { id: capture.trackId, name: "Micrófono", kind: "audio" as const,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    let badEndRejected = false;
    try { await installAudioCapture(repository, session, { capture, takeId: "capture-take",
      clipId: "capture-clip", at: 1200, endTick: 480, track }); }
    catch { badEndRejected = true; }
    let conflict = false;
    try { await installAudioCapture(repository, session, { capture, takeId: "capture-take",
      clipId: "capture-clip", at: 1200, endTick: 1920, track }); }
    catch { conflict = true; }
    const local = session.getSnapshot();
    const storedBytes = await repository.readAsset(ref);
    const copy = await session.saveAsCopy({ id: "mic-copy", at: 1300 });
    const original = await repository.read("mic-project");
    const copied = await repository.read("mic-copy");
    await rival.close();
    await copy.close();
    await repository.close();
    for (const database of [name, `${name}-assets`, `${name}-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { badEndRejected, conflict, localStatus: local.status,
      localCount: [local.document.assets.length, local.document.takes.length,
        local.document.tracks.length, local.document.clips.length],
      storedBytes: storedBytes?.size,
      original: original?.status === "ready" ? [original.value.document.name,
        original.value.document.clips.length] : null,
      copy: copied?.status === "ready" ? [copied.value.document.name,
        copied.value.document.clips[0]?.startTick,
        copied.value.document.clips[0]?.lengthTicks,
        copied.value.document.takes[0]?.audioCapture?.frameCount] : null };
  }, databaseName);
  expect(result).toEqual({ badEndRejected: true, conflict: true, localStatus: "conflict",
    localCount: [1, 1, 1, 1], storedBytes: 8,
    original: ["Rival", 0], copy: ["Proyecto sin título", 480, 1440, 100] });
});

test("new captured WAV is compensated once and survives latency edit plus portable roundtrip", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/audioTakeInstall.ts");
  const databaseName = `capture-absolute-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { installAudioCapture } = await import("/src/project/audioTakeInstall.ts");
    const { exportProjectBundle, importProjectBundle } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const base = createProjectDocument({ id: "absolute-audio", at: 1000 });
    const track = { id: "recording-track", name: "Micrófono", kind: "audio" as const,
      mix: { gainDb: 0, pan: 0, mute: false, solo: false, armed: false, sends: [], effects: [] } };
    const session = await ProjectSession.create(repository,
      { ...base, tracks: [track], trackOrder: [track.id] }, { autosaveDelayMs: 60_000 });
    const frames = 96_000;
    const bytes = new Uint8Array(44 + frames * 2);
    const view = new DataView(bytes.buffer);
    const fourcc = (at: number, value: string) => value.split("").forEach((char, index) =>
      { bytes[at + index] = char.charCodeAt(0); });
    fourcc(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); fourcc(8, "WAVE");
    fourcc(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 48_000, true);
    view.setUint32(28, 96_000, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); fourcc(36, "data"); view.setUint32(40, frames * 2, true);
    for (let index = 0; index < frames; index++) view.setInt16(44 + index * 2, 800, true);
    const data = new Blob([bytes], { type: "audio/wav" });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const ref = { id: "recorded-asset", sha256, byteLength: bytes.length,
      mimeType: "audio/wav", sourceKind: "recorded" as const, license: "user-owned",
      frameCount: frames, sampleRate: 48_000, channelCount: 1 };
    const capture = { data, ref, trackId: track.id, epoch: 1, startTick: 1920,
      startProjectUs: 1_000_250,
      startAudioTime: 2.5, endAudioTime: 4.5, frameCount: frames, sampleRate: 48_000,
      channelCount: 1, deviceId: "mic-1", latencyOffsetFrames: 480,
      incomplete: false, reason: "stop", clippedSamples: 0 };
    const installed = await installAudioCapture(repository, session, { capture,
      takeId: "recorded-take", clipId: "recorded-clip", at: 1100 });
    const firstClip = installed.document.clips[0];
    const firstTake = installed.document.takes[0];
    session.dispatch({ kind: "setAudioTakeLatency", takeId: "recorded-take",
      expectedOffsetFrames: 480, offsetFrames: 960, at: 1200 });
    const moved = session.getSnapshot().document.clips[0];
    session.undo();
    const undone = session.getSnapshot().document.clips[0];
    session.redo();
    await session.save();
    const bundle = await exportProjectBundle(repository, base.id);
    const targetName = `${name}-imported`;
    const target = new ProjectRepository({ databaseName: targetName });
    const imported = await importProjectBundle(target, bundle,
      { id: "absolute-imported", at: 1300 });
    const restored = await target.read(imported.projectId);
    const storedBytes = await target.readAsset(ref);
    const restoredHash = storedBytes ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
      await storedBytes.arrayBuffer())), (value) => value.toString(16).padStart(2, "0")).join("") : null;
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
      installed: firstClip?.kind === "audio" ? [firstClip.timeMode, firstClip.sourceTakeId,
        firstClip.absoluteStartUs, firstClip.absoluteEndUs, firstClip.startTick] : null,
      baseline: firstTake?.audioCapture?.capturedLatencyOffsetFrames,
      moved: moved?.kind === "audio" ? [moved.absoluteStartUs, moved.absoluteEndUs] : null,
      undone: undone?.kind === "audio" ? undone.absoluteStartUs : null,
      restored: restored?.status === "ready" ? [restored.value.document.clips[0]?.kind === "audio"
        ? restored.value.document.clips[0].absoluteStartUs : null,
      restored.value.document.takes[0]?.audioCapture?.latencyOffsetFrames,
      restored.value.document.takes[0]?.audioCapture?.startProjectUs] : null,
      exactBytes: storedBytes?.size === bytes.byteLength && restoredHash === sha256,
      bundleType: bundle.type,
    };
  }, databaseName);
  expect(result).toEqual({ installed: ["absolute", "recorded-take", 990_250, 2_990_250, 1901],
    baseline: 480, moved: [980_250, 2_980_250], undone: 990_250,
    restored: [980_250, 960, 1_000_250], exactBytes: true,
    bundleType: "application/vnd.piano-midi-pro.project" });
});
