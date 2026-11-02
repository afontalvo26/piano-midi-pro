import { expect, test } from "@playwright/test";

test("saved arrangement exports aligned master and stems from the isolated audio graph", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { PROJECT_PIANO_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const { hashProjectDocument } = await import("/src/project/canonical.ts");
    const { exportProjectWav } = await import("/src/export/projectWav.ts");
    const { zipProjectWavAsync } = await import("/src/export/projectWavZip.ts");
    const { validateWavPcm } = await import("/src/export/wavPcm.ts");
    const frames = 6_000;
    const source = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(source);
    const ascii = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
    };
    ascii(0, "RIFF"); view.setUint32(4, source.byteLength - 8, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 48_000, true);
    view.setUint32(28, 96_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, frames * 2, true);
    for (let frame = 0; frame < frames; frame++) {
      view.setInt16(44 + frame * 2, Math.round(3_000 * Math.sin(frame * 0.1)), true);
    }
    const analyzed = await analyzeUserSample(new Blob([source], { type: "audio/wav" }),
      "export-hit", new OfflineAudioContext(1, 1, 48_000));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false,
      armed: false, sends: [], effects: [] };
    const clip = (id: string, trackId: string) => ({ id, trackId, kind: "audio" as const,
      startTick: 0, lengthTicks: 240, sourceOffsetTick: 0, loopMode: "none" as const,
      tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
      sourceId: analyzed.ref.id, sourceStartFrame: 0, sourceEndFrame: frames,
      fadeInFrames: 0, fadeOutFrames: 0 });
    const document = { ...createProjectDocument({ id: "qa-project-wav", name: "Beat prueba", at: 1 }),
      trackOrder: ["piano-empty", "audio-a", "audio-b"], tracks: [
        { id: "piano-empty", name: "Piano vacío", kind: "instrument" as const,
          instrument: PROJECT_PIANO_INSTRUMENT, mix },
        { id: "audio-a", name: "Voz A", kind: "audio" as const, mix },
        { id: "audio-b", name: "Voz B", kind: "audio" as const, mix },
      ], patterns: [{ id: "piano-pattern", name: "Patrón vacío", version: 1,
        lengthTicks: 240, notes: [], expression: [] }],
      clips: [{ id: "piano-clip", trackId: "piano-empty", kind: "pattern" as const,
        startTick: 0, lengthTicks: 240, sourceOffsetTick: 0, loopMode: "none" as const,
        tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
        sourceId: "piano-pattern", sourceVersion: 1 },
      clip("clip-a", "audio-a"), clip("clip-b", "audio-b")],
      assets: [analyzed.ref] };
    const hash = await hashProjectDocument(document);
    const revision = { projectId: document.id, revision: 1, hash, committedAt: 1, document };
    const reader = { readAsset: async () => analyzed.data };
    const progress: string[] = [];
    const exported = await exportProjectWav(revision, reader,
      { sampleRate: 48_000, stems: "tracks", format: "pcm16", tailSeconds: 0,
        dither: false }, undefined,
      (state) => progress.push(`${state.phase}:${state.stemId}`));
    const details = exported.files.map((file) => {
      const header = validateWavPcm(file.bytes);
      const pcm = new DataView(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
      return { name: file.name, kind: file.kind, header, bytes: file.bytes.byteLength,
        sample100: pcm.getInt16(44 + 100 * 4, true), peak: file.pcm.outputPeak,
        selected: file.render.selectedTrackIds };
    });
    const controller = new AbortController();
    controller.abort();
    let cancelled = false;
    try {
      await exportProjectWav(revision, reader,
        { sampleRate: 48_000, stems: "none", format: "pcm24", tailSeconds: 0 },
      controller.signal);
    } catch (error) { cancelled = error instanceof DOMException && error.name === "AbortError"; }
    const rejected = async (candidate: typeof revision, options: Parameters<typeof exportProjectWav>[2]) => {
      try { await exportProjectWav(candidate, reader, options); return ""; }
      catch (error) { return error instanceof Error ? error.message : String(error); }
    };
    const blockedFx = await rejected({ ...revision, document: { ...document,
      mix: { ...document.mix, masterEffects: [{ id: "fx", kind: "reverb", enabled: true,
        parameters: {} }] } } },
    { sampleRate: 48_000, stems: "none", format: "pcm16", tailSeconds: 0 });
    const filteredDocument = { ...document, tracks: document.tracks.map((track) =>
      track.id === "audio-a" ? { ...track, mix: { ...track.mix, effects: [
        { id: "fx-filter", kind: "filter", enabled: true,
          parameters: { type: "lowpass", cutoffHz: 100, q: 1 } },
      ] } } : track) };
    const filtered = await exportProjectWav({ ...revision,
      document: filteredDocument, hash: await hashProjectDocument(filteredDocument) }, reader,
    { sampleRate: 48_000, stems: "none", format: "pcm16", tailSeconds: 0,
      dither: false });
    const fxAccepted = filtered.files.length === 1 &&
      validateWavPcm(filtered.files[0]!.bytes).frames === frames;
    const fxDiff = filtered.files[0]!.bytes.some((byte, index) =>
      byte !== exported.files[0]!.bytes[index]);
    const masterFxDocument = { ...document, mix: { ...document.mix, masterEffects: [
      { id: "master-filter", kind: "filter", enabled: true,
        parameters: { type: "lowpass", cutoffHz: 180, q: 0.7 } },
    ] } };
    const masterFxExport = await exportProjectWav({ ...revision,
      document: masterFxDocument, hash: await hashProjectDocument(masterFxDocument) }, reader,
      { sampleRate: 48_000, stems: "tracks", format: "pcm16", tailSeconds: 0,
        dither: false });
    const sameBytes = (left: Uint8Array, right: Uint8Array) =>
      left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
    const trackStemsExcludeMasterFx = masterFxExport.files.filter((file) => file.kind === "track")
      .every((file, index) => sameBytes(file.bytes,
        exported.files.filter((candidate) => candidate.kind === "track")[index]!.bytes));
    const masterFxChangesMaster = !sameBytes(masterFxExport.files[0]!.bytes, exported.files[0]!.bytes);
    const blockedNormalize = await rejected(revision,
      { sampleRate: 48_000, stems: "tracks", format: "pcm16", tailSeconds: 0,
        normalizePeakDbfs: -1 });
    const zipped = await zipProjectWavAsync(exported);
    const zipBytes = new Uint8Array(await zipped.blob.arrayBuffer());
    const zipView = new DataView(zipBytes.buffer);
    const manifestLength = zipView.getUint32(18, true);
    const manifestNameLength = zipView.getUint16(26, true);
    const manifest = JSON.parse(new TextDecoder().decode(zipBytes.subarray(
      30 + manifestNameLength, 30 + manifestNameLength + manifestLength)));
    return { details, cancelled, blockedFx, blockedNormalize, fxAccepted, fxDiff,
      trackStemsExcludeMasterFx, masterFxChangesMaster,
      masterFxIncluded: masterFxExport.masterEffectsIncluded, progress,
      revisionHash: exported.revisionHash, additive: exported.stemsAdditive,
      studioChainIncluded: exported.studioGlobalChainIncluded,
      omitted: exported.plan.omittedSourceTrackIds,
      zipName: zipped.name, zipMime: zipped.mimeType,
      zipSignature: zipView.getUint32(0, true), zipManifest: manifest,
      zipDetached: exported.files.every((file) => file.bytes.byteLength === 0) };
  });
  expect(result.details.map((file) => file.kind)).toEqual(["master", "track", "track"]);
  expect(result.details.map((file) => file.header)).toEqual(Array(3).fill({
    frames: 6_000, sampleRate: 48_000, format: "pcm16",
  }));
  expect(result.details.every((file) => file.bytes === 44 + 6_000 * 4)).toBe(true);
  expect(result.details[0]!.sample100).toBeCloseTo(result.details[1]!.sample100 * 2, 0);
  expect(result.details[0]!.peak).toBeGreaterThan(result.details[1]!.peak * 1.9);
  expect(result.details[0]!.selected).toEqual(["piano-empty", "audio-a", "audio-b"]);
  expect(result.details[1]!.selected).toEqual(["audio-a"]);
  expect(result.details[2]!.selected).toEqual(["audio-b"]);
  expect(new Set(result.details.map((file) => file.name)).size).toBe(3);
  expect(result.details.every((file) => file.name.includes(result.revisionHash.slice(0, 12)))).toBe(true);
  expect(result.progress).toContain("done:master");
  expect(result.progress).toContain("done:audio-b");
  expect(result.cancelled).toBe(true);
  expect(result.blockedFx).toMatch(/parámetros no coinciden/);
  expect(result.fxAccepted).toBe(true);
  expect(result.fxDiff).toBe(true);
  expect(result.trackStemsExcludeMasterFx).toBe(true);
  expect(result.masterFxChangesMaster).toBe(true);
  expect(result.masterFxIncluded).toBe(true);
  expect(result.blockedNormalize).toMatch(/normalización individual/);
  expect(result.additive).toBe(false);
  expect(result.studioChainIncluded).toBe(false);
  expect(result.omitted).toEqual(["piano-empty"]);
  expect(result.zipName).toMatch(/-stems\.zip$/);
  expect(result.zipMime).toBe("application/zip");
  expect(result.zipSignature).toBe(0x04034b50);
  expect(result.zipManifest.files).toHaveLength(3);
  expect(result.zipManifest.project.revisionHash).toBe(result.revisionHash);
  expect(result.zipDetached).toBe(true);
});
