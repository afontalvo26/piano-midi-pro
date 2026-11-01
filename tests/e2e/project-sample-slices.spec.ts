import { expect, test } from "@playwright/test";

test("slices, FX and lanes retain exact source bytes and data through portable import", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/sampleSliceInstall.ts");
  const databaseName = `sample-slices-${crypto.randomUUID()}`;
  const result = await page.evaluate(async (name) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { installSampleSlices } = await import("/src/project/sampleSliceInstall.ts");
    const { exportProjectBundle, importProjectBundle } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName: name });
    const base = createProjectDocument({ id: "sliced-break", at: 1000 });
    const pads = Array.from({ length: 16 }, (_, index) => ({ id: `pad-${index}`,
      name: `Pad ${index}`, color: "#123456", midiNote: 36 + index, channel: 9,
      source: null, gainDb: 0, pan: 0, pitchSemitones: 0, startFrame: 0,
      attackMs: 0, decayMs: 0, playMode: "oneShot" as const, mute: false,
      solo: false, stepTicks: 240, stepCount: 16 }));
    const track = { id: "drum", name: "Break", kind: "drum" as const,
      drumRack: { pads }, mix: { gainDb: 0, pan: 0, mute: false, solo: false,
        armed: false, sends: [], effects: [{ id: "slice-filter", kind: "filter",
          enabled: true, parameters: { type: "lowpass", cutoffHz: 8000, q: 1 } }] } };
    const pattern = { id: "break-pattern", name: "Break", version: 1, lengthTicks: 3840,
      notes: [{ id: "hit", startTick: 0, durationTick: 120, pitch: 36, velocity: 100,
        releaseVelocity: 0, channel: 9, origin: { kind: "drawn" as const } }], expression: [] };
    const clip = { id: "break-clip", kind: "pattern" as const, trackId: track.id,
      sourceId: pattern.id, sourceVersion: 1, startTick: 0, lengthTicks: 3840,
      sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false };
    const lane = { id: "drum-gain", target: { scope: "track" as const,
      ownerId: track.id, parameterId: "gainDb" }, points: [
      { id: "gain-a", tick: 0, value: -3, shape: "step" as const },
      { id: "gain-b", tick: 960, value: 0, shape: "linear" as const },
    ] };
    const session = await ProjectSession.create(repository,
      { ...base, tracks: [track], trackOrder: [track.id], patterns: [pattern],
        clips: [clip], automation: [lane] }, { autosaveDelayMs: 60_000 });
    const frames = 48_000;
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
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const asset = { id: "break-bytes", sha256, byteLength: bytes.length,
      mimeType: "audio/wav", sourceKind: "user" as const, license: "user-owned",
      frameCount: frames, sampleRate: 48_000, channelCount: 1 };
    const installed = await installSampleSlices(repository, session, { asset,
      data: new Blob([bytes], { type: "audio/wav" }), trackId: track.id,
      expectedRack: track.drumRack, slices: [
        { padId: "pad-0", startFrame: 0, endFrame: 12_345 },
        { padId: "pad-1", startFrame: 12_345, endFrame: 48_000 },
      ], at: 1100 });
    let staleRejected = false;
    try { await installSampleSlices(repository, session, { asset,
      data: new Blob([bytes], { type: "audio/wav" }), trackId: track.id,
      expectedRack: track.drumRack,
      slices: [{ padId: "pad-2", startFrame: 0, endFrame: 1 }], at: 1200 }); }
    catch { staleRejected = true; }
    session.undo();
    const undone = session.getSnapshot().document;
    session.redo();
    await session.save();
    const bundle = await exportProjectBundle(repository, base.id);
    const targetName = `${name}-imported`;
    const target = new ProjectRepository({ databaseName: targetName });
    const tampered = new Uint8Array(await bundle.arrayBuffer());
    tampered[tampered.length - 1] ^= 1;
    let tamperRejected = false;
    try { await importProjectBundle(target, new Blob([tampered]),
      { id: "tampered", at: 1250 }); }
    catch { tamperRejected = true; }
    const tamperWritten = await target.read("tampered");
    const imported = await importProjectBundle(target, bundle, { id: "slices-imported", at: 1300 });
    const restored = await target.read(imported.projectId);
    const blob = await target.readAsset(asset);
    const restoredHash = blob ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
      await blob.arrayBuffer())), (value) => value.toString(16).padStart(2, "0")).join("") : null;
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
    const restoredPads = restored?.status === "ready"
      ? restored.value.document.tracks[0]?.drumRack?.pads : null;
    return { assetId: installed.assetId, status: installed.snapshot.status,
      staleRejected, undone: [undone.assets.length,
        undone.tracks[0]?.drumRack?.pads[0]?.source],
      tamperRejected, tamperWritten: tamperWritten !== null,
      restoredSlices: restoredPads?.slice(0, 2).map((pad) => [pad.source?.kind,
        pad.source?.kind === "asset" ? pad.source.assetId : null,
        pad.startFrame, pad.endFrame]),
      untouched: restoredPads?.[2]?.source,
      restoredEffect: restored?.status === "ready"
        ? restored.value.document.tracks[0]?.mix.effects[0]?.parameters.cutoffHz : null,
      restoredLane: restored?.status === "ready"
        ? restored.value.document.automation[0]?.points.map((point) => [point.tick, point.value]) : null,
      restoredHit: restored?.status === "ready"
        ? restored.value.document.patterns[0]?.notes[0]?.pitch : null,
      exactBytes: blob?.size === bytes.length && restoredHash === sha256 };
  }, databaseName);
  expect(result).toEqual({ assetId: "break-bytes", status: "clean", staleRejected: true,
    undone: [0, null], tamperRejected: true, tamperWritten: false,
    restoredSlices: [["asset", "break-bytes", 0, 12_345],
      ["asset", "break-bytes", 12_345, 48_000]], untouched: null,
    restoredEffect: 8000, restoredLane: [[0, -3], [960, 0]], restoredHit: 36,
    exactBytes: true });
});
