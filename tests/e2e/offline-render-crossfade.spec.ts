import { expect, test } from "@playwright/test";

test("resolved beat/absolute crossfade renders both recorded clips without an audible gap", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=dual-audio");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const { validateProjectDocument } = await import("/src/project/validate.ts");
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qa-dual-recording", new OfflineAudioContext(1, 1, 48_000));
    const rate = analyzed.buffer.sampleRate;
    const frame = (seconds: number) => Math.round(seconds * rate);
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const clipBase = { kind: "audio" as const, trackId: "audio", sourceId: analyzed.ref.id,
      sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false, fadeInFrames: 0, fadeOutFrames: 0 };
    const outgoing = { ...clipBase, id: "outgoing", startTick: 0, lengthTicks: 768,
      sourceStartFrame: 0, sourceEndFrame: frame(0.4) };
    const incoming = { ...clipBase, id: "incoming", timeMode: "absolute" as const,
      absoluteStartUs: 200_000, absoluteEndUs: 600_000,
      startTick: 384, lengthTicks: 768,
      sourceStartFrame: frame(0.2), sourceEndFrame: frame(0.6) };
    const base = createProjectDocument({ id: "qa-dual-render", at: 1 });
    const document = { ...base, trackOrder: ["audio"],
      tracks: [{ id: "audio", name: "Audio", kind: "audio" as const, mix }],
      assets: [analyzed.ref], clips: [outgoing, incoming], audioCrossfades: [{
        id: "cross", outgoingClipId: outgoing.id, incomingClipId: incoming.id,
        curve: "linear" as const,
      }] };
    validateProjectDocument(document);
    const resolved = createArrangementResolver(document)(0, 1344, 0);
    const audioEvents = resolved.filter((item) => item.kind === "audioClip");
    const reader = { readAsset: async () => analyzed.data };
    const options = { startTick: 0, endTick: 1344, sampleRate: 48_000, tailSeconds: 0 };
    const crossed = await renderProjectPcm(document, options, reader);
    const reference = await renderProjectPcm({ ...document,
      clips: [{ ...outgoing, id: "reference", lengthTicks: 1152,
        sourceEndFrame: frame(0.6) }], audioCrossfades: [] }, options, reader);
    const bands = [[0.05, 0.15], [0.25, 0.35], [0.45, 0.55]];
    const energy = (samples: Float32Array, start: number, end: number) => {
      let sum = 0;
      for (let index = frame(start); index < frame(end); index++) sum += samples[index]! ** 2;
      return sum;
    };
    return { events: audioEvents.map((item) => ({ clipId: item.clipId,
      segmentStartUs: item.segmentStartUs, segmentEndUs: item.segmentEndUs,
      fades: item.crossfades?.map((fade) => fade.role) })),
      skipped: crossed.report.transport.skippedAudioClips,
      missing: crossed.report.audio.missingAttacks,
      ratios: bands.map(([start, end]) => energy(crossed.left, start!, end!) /
        energy(reference.left, start!, end!)) };
  });
  expect(result.events).toHaveLength(2);
  expect(result.events.map((item) => item.clipId)).toEqual(["outgoing", "incoming"]);
  expect(result.events.map((item) => item.fades)).toEqual([["out"], ["in"]]);
  expect(result.skipped).toBe(0);
  expect(result.missing).toBe(0);
  for (const ratio of result.ratios) {
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  }
});

test("absolute clip starting before export end survives rounded UI tick", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=absolute-boundary");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qa-boundary-recording", new OfflineAudioContext(1, 1, 48_000));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-absolute-export-edge", at: 1 }),
      trackOrder: ["audio"], tracks: [{ id: "audio", name: "Audio",
        kind: "audio" as const, mix }], assets: [analyzed.ref],
      clips: [{ id: "edge", kind: "audio" as const, trackId: "audio",
        sourceId: analyzed.ref.id, timeMode: "absolute" as const,
        absoluteStartUs: 499_740, absoluteEndUs: 749_740,
        startTick: 960, lengthTicks: 480, sourceOffsetTick: 0,
        loopMode: "none" as const, tailPolicy: "continue" as const,
        transpose: 0, gainDb: 0, muted: false,
        sourceStartFrame: 0, sourceEndFrame: 12_000,
        fadeInFrames: 0, fadeOutFrames: 0 }] };
    const pcm = await renderProjectPcm(document,
      { startTick: 0, endTick: 960, sampleRate: 48_000, tailSeconds: 0.05 },
      { readAsset: async () => analyzed.data });
    let tailEnergy = 0;
    for (let frame = 24_240; frame < 26_160; frame++) tailEnergy += pcm.left[frame]! ** 2;
    return { tailEnergy, skipped: pcm.report.transport.skippedAudioClips,
      selectedTracks: pcm.report.selectedTrackIds };
  });
  expect(result.selectedTracks).toEqual(["audio"]);
  expect(result.skipped).toBe(0);
  expect(result.tailEnergy).toBeGreaterThan(0);
});
