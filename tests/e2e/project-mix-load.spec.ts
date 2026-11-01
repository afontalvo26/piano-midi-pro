import { expect, test } from "@playwright/test";

test("recorded beat with inserts keeps 37 live keys through Stop and renders finite PCM", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(30_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { PROJECT_DRUM_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=mix-load");
    const effects = [
      { id: "beat-filter", kind: "filter", enabled: true,
        parameters: { type: "lowpass", cutoffHz: 9500, q: 0.7 } },
      { id: "beat-compressor", kind: "compressor", enabled: true,
        parameters: { thresholdDb: -16, ratio: 3, attackMs: 5, releaseMs: 90, kneeDb: 6 } },
    ];
    const mix = { gainDb: -3, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects };
    const pattern = { id: "kick-pattern", name: "Beat", version: 1, lengthTicks: 960,
      notes: [0, 240, 480, 720].map((tick, index) => ({ id: `kick-${index}`,
        startTick: tick, durationTick: 120, pitch: 36, velocity: 96,
        releaseVelocity: 64, channel: 9, origin: { kind: "drawn" as const } })),
      expression: [] };
    const clip = { id: "kick-clip", trackId: "drums", kind: "pattern" as const,
      sourceId: pattern.id, sourceVersion: 1, startTick: 0, lengthTicks: 1920,
      sourceOffsetTick: 0, loopMode: "loop" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false };
    const document = { ...createProjectDocument({ id: "qa-mix-load", at: 1 }),
      trackOrder: ["drums"], tracks: [{ id: "drums", name: "Drums", kind: "drum" as const,
        instrument: PROJECT_DRUM_INSTRUMENT, mix }], patterns: [pattern], clips: [clip],
      mix: { masterGainDb: -2, masterEffects: [
        { id: "master-limiter", kind: "limiter", enabled: true,
          parameters: { thresholdDb: -4 } },
      ] } };
    const engine = new LiveStudioEngine();
    const playback = await engine.prepareProjectPlayback(document, createArrangementResolver(document));
    if (!playback) throw new Error("Beat no preparado");
    const played = await engine.playProjectPlayback(0);
    engine.setGlobalPedal("qa-smk", "sustain", 127);
    const beforeAttacks = performance.now();
    const attacks = await Promise.all(Array.from({ length: 37 }, (_, index) => engine.noteOn({
      inputId: "smk-37-elite", channel: 4, originalNote: 48 + index,
      mappedMidi: 48 + index, rawVelocity: 100, amplitude: 0.7,
    })));
    const attackCallMs = performance.now() - beforeAttacks;
    for (let pitch = 48; pitch <= 84; pitch++) engine.noteOff({ inputId: "smk-37-elite",
      channel: 4, originalNote: pitch });
    await new Promise((resolve) => setTimeout(resolve, 70));
    const during = engine.projectPlaybackSnapshot();
    engine.stopProjectPlayback();
    const afterStop = engine.diagnostics().voices?.activeVoiceCount ?? null;
    engine.setGlobalPedal("qa-smk", "sustain", 0);
    const afterPedal = engine.diagnostics().voices?.activeVoiceCount ?? null;
    engine.dispose();
    const pcm = await renderProjectPcm(document,
      { startTick: 0, endTick: 1920, sampleRate: 48_000, tailSeconds: 0.2 },
      { readAsset: async () => null });
    let peak = 0;
    let energy = 0;
    let nonFinite = 0;
    for (let index = 0; index < pcm.left.length; index++) {
      const left = pcm.left[index]!;
      const right = pcm.right[index]!;
      peak = Math.max(peak, Math.abs(left), Math.abs(right));
      energy += left * left + right * right;
      if (!Number.isFinite(left) || !Number.isFinite(right)) nonFinite++;
    }
    return { played, attacks: attacks.filter(Boolean).length, attackCallMs,
      during: { transport: during?.transport,
        masterMeter: during?.audio.masterMeter, trackMeter: during?.audio.tracks[0]?.meter,
        missingAttacks: during?.audio.missingAttacks },
      afterStop, afterPedal, pcm: { peak, energy, nonFinite,
        skipped: pcm.report.transport.skippedNotes,
        missingAttacks: pcm.report.audio.missingAttacks } };
  });
  console.log("QLT live+beat+MIX:", JSON.stringify(result));
  expect(result.played).toBe(true);
  expect(result.attacks).toBe(37);
  expect(result.afterStop).toBe(37);
  expect(result.afterPedal).toBe(0);
  expect(result.during.transport?.skippedNotes).toBe(0);
  expect(result.during.missingAttacks).toBe(0);
  expect(result.during.trackMeter?.peak).toBeGreaterThan(0);
  expect(result.during.masterMeter?.peak).toBeGreaterThan(0);
  expect(result.pcm.nonFinite).toBe(0);
  expect(result.pcm.peak).toBeLessThan(1);
  expect(result.pcm.energy).toBeGreaterThan(0.001);
  expect(result.pcm.skipped).toBe(0);
  expect(result.pcm.missingAttacks).toBe(0);
});
