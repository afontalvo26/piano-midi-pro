import { expect, test } from "@playwright/test";

test("bus resample installs own WAV atomically, survives Undo and portable reopen", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/project/busResampleInstall.ts");
  const result = await page.evaluate(async (databaseName) => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const { ProjectSession } = await import("/src/project/session.ts");
    const { installBusResample } = await import("/src/project/busResampleInstall.ts");
    const { encodeWavPcm } = await import("/src/export/wavPcm.ts");
    const { exportProjectBundle, importProjectBundle } = await import("/src/project/bundle.ts");
    const repository = new ProjectRepository({ databaseName });
    const importedRepository = new ProjectRepository({ databaseName: `${databaseName}-import` });
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
      armed: false, sends: [], effects: [] };
    const source = { id: "source", name: "Fuente", kind: "audio" as const,
      mix: { ...mix, outputBusTrackId: "bus" } };
    const bus = { id: "bus", name: "Bus", kind: "bus" as const, mix };
    const destination = { id: "destination", name: "Render", kind: "audio" as const, mix };
    const base = createProjectDocument({ id: "resample-source", at: 1000 });
    const document = { ...base, tracks: [source, bus, destination],
      trackOrder: [source.id, bus.id, destination.id] };
    const session = await ProjectSession.create(repository, document, { autosaveDelayMs: 60_000 });
    const confirmed = session.getSnapshot();
    const left = new Float32Array(72_000);
    const right = new Float32Array(72_000);
    for (let frame = 0; frame < 72_000; frame++) {
      left[frame] = Math.sin(frame / 20) * 0.1;
      right[frame] = left[frame]!;
    }
    const wav = encodeWavPcm({ left, right, sampleRate: 48_000 },
      { format: "pcm16", dither: false });
    const data = new Blob([wav.bytes], { type: "audio/wav" });
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", wav.bytes)),
      (value) => value.toString(16).padStart(2, "0")).join("");
    const asset = { id: "bus-render-wav", sha256, byteLength: data.size,
      mimeType: "audio/wav", sourceKind: "recorded" as const, license: "user-owned",
      sampleRate: 48_000, channelCount: 2, frameCount: 72_000 };
    const provenance = { sourceBusTrackId: bus.id, destinationTrackId: destination.id,
      sourceRevision: confirmed.revision, sourceHash: confirmed.hash,
      startTick: 1920, endTick: 3840, tap: "post-bus-pre-master" as const,
      sourceTrackIds: [source.id], includedEffectIds: [], seed: "resample-e2e",
      sampleRate: 48_000, channelCount: 2, frameCount: 72_000,
      tailFrames: 24_000, rendererVersion: "bus-resample-v1" as const };
    await installBusResample(repository, session, { asset, data, provenance,
      takeId: "bus-render-take", clipId: "bus-render-clip", at: 1100 });
    const installed = session.getSnapshot();
    let staleRejected = false;
    try { await installBusResample(repository, session, { asset, data, provenance,
      takeId: "stale-take", clipId: "stale-clip", at: 1200 }); }
    catch { staleRejected = true; }
    session.undo();
    await session.save();
    const undone = session.getSnapshot();
    session.redo();
    await session.save();
    const redone = session.getSnapshot();
    const bundle = await exportProjectBundle(repository, document.id);
    const imported = await importProjectBundle(importedRepository, bundle,
      { id: "resample-imported", at: 1300 });
    const importedBlob = await importedRepository.readAsset(imported.document.assets[0]!);
    const importedHash = importedBlob ? Array.from(new Uint8Array(await crypto.subtle.digest(
      "SHA-256", await importedBlob.arrayBuffer())),
    (value) => value.toString(16).padStart(2, "0")).join("") : null;
    await session.close();
    await repository.close();
    await importedRepository.close();
    for (const name of [databaseName, `${databaseName}-assets`, `${databaseName}-drafts`,
      `${databaseName}-import`, `${databaseName}-import-assets`, `${databaseName}-import-drafts`]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    return { installed: [installed.revision, installed.document.assets.length,
      installed.document.takes.length, installed.document.clips.length],
      undone: [undone.document.assets.length, undone.document.takes.length,
        undone.document.clips.length],
      redone: [redone.document.assets.length, redone.document.takes.length,
        redone.document.clips.length],
      staleRejected, captureAbsent: imported.document.takes[0]?.audioCapture === undefined,
      busId: imported.document.takes[0]?.audioResample?.sourceBusTrackId,
      tailFrames: imported.document.takes[0]?.audioResample?.tailFrames,
      clipFrames: imported.document.clips[0]?.kind === "audio"
        ? [imported.document.clips[0].sourceStartFrame,
          imported.document.clips[0].sourceEndFrame] : [],
      importedHash, sha256 };
  }, `bus-resample-${crypto.randomUUID()}`);
  expect(result).toEqual({ installed: [2, 1, 1, 1], undone: [0, 0, 0],
    redone: [1, 1, 1], staleRejected: true, captureAbsent: true,
    busId: "bus", tailFrames: 24_000, clipFrames: [0, 72_000],
    importedHash: result.sha256, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
});

test("bus resample renders its routed sources post-bus and before master", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectBusPcm } = await import("/src/audio/renderProjectBusPcm.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const frames = 12_000;
    const bytes = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(bytes);
    const ascii = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index++) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    ascii(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 48_000, true);
    view.setUint32(28, 96_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, frames * 2, true);
    for (let frame = 0; frame < frames; frame++) {
      view.setInt16(44 + frame * 2, Math.round(5_000 * Math.sin(frame * 0.08)), true);
    }
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/wav" }),
      "bus-render-source", new OfflineAudioContext(1, 1, 48_000));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const source = { id: "source", name: "Fuente", kind: "audio" as const,
      mix: { ...mix, outputBusTrackId: "bus" } };
    const busEffect = { id: "bus-filter", kind: "filter", enabled: true,
      parameters: { type: "lowpass", cutoffHz: 8_000, q: 0.7 } };
    const bus = { id: "bus", name: "Bus", kind: "bus" as const,
      mix: { ...mix, gainDb: -6, effects: [busEffect] } };
    const destination = { id: "destination", name: "Render", kind: "audio" as const, mix };
    const clip = (id: string, trackId: string) => ({ id, trackId, kind: "audio" as const,
      startTick: 0, lengthTicks: 480, sourceOffsetTick: 0, loopMode: "none" as const,
      tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
      sourceId: analyzed.ref.id, sourceStartFrame: 0, sourceEndFrame: frames,
      fadeInFrames: 0, fadeOutFrames: 0 });
    const base = createProjectDocument({ id: "qa-bus-render", at: 1 });
    const document = { ...base, tracks: [source, bus, destination],
      trackOrder: [source.id, bus.id, destination.id], assets: [analyzed.ref],
      clips: [clip("source-clip", source.id), clip("destination-clip", destination.id)],
      mix: { masterGainDb: -60, masterEffects: [{ id: "master-limit", kind: "limiter",
        enabled: true, parameters: { thresholdDb: -24 } }] } };
    const rendered = await renderProjectBusPcm({ projectId: document.id, revision: 7,
      hash: "a".repeat(64), committedAt: 2, document }, {
      sourceBusTrackId: bus.id, destinationTrackId: destination.id,
      startTick: 0, endTick: 480, sampleRate: 48_000, tailSeconds: 0,
      seed: "bus-render-e2e", assetId: "rendered-bus-wav",
    }, { readAsset: async () => analyzed.data });
    const context = new AudioContext({ sampleRate: 48_000 });
    const decoded = await context.decodeAudioData(await rendered.data.arrayBuffer());
    const left = decoded.getChannelData(0);
    let energy = 0;
    let peak = 0;
    for (const value of left) { energy += value * value; peak = Math.max(peak, Math.abs(value)); }
    await context.close();
    return { energy, peak, frames: decoded.length, selected: rendered.render.selectedTrackIds,
      sources: rendered.provenance.sourceTrackIds,
      effects: rendered.provenance.includedEffectIds,
      tap: rendered.provenance.tap, destination: rendered.provenance.destinationTrackId,
      hash: rendered.asset.sha256, bytes: rendered.asset.byteLength,
      frameCount: rendered.provenance.frameCount };
  });
  expect(result.energy).toBeGreaterThan(1);
  expect(result.peak).toBeGreaterThan(0.01);
  expect(result.frames).toBe(12_000);
  expect(result.frameCount).toBe(12_000);
  expect(result.selected).toEqual(["source"]);
  expect(result.sources).toEqual(["source"]);
  expect(result.effects).toEqual(["bus-filter"]);
  expect(result.tap).toBe("post-bus-pre-master");
  expect(result.destination).toBe("destination");
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.bytes).toBeGreaterThan(44);
});
