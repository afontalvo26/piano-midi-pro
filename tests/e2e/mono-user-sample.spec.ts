import { expect, test } from "@playwright/test";

test("sample verificado conserva afinación, glide legato y dueños de notas", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/monoUserSampleEngine.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { MonoUserSampleEngine } = await import("/src/audio/monoUserSampleEngine.ts");
    await Tone.start();
    const raw = Tone.getContext().rawContext as AudioContext;
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qa-recorded-note", raw);
    const region = { startFrame: 0, endFrame: analyzed.buffer.length,
      fadeInFrames: 0, fadeOutFrames: 0, rootMidi: 60, cents: 50,
      reverse: false, loopMode: "loop" as const, playMode: "gate" as const };
    const destination = new Tone.Gain(0).toDestination();
    let finished = 0;
    const engine = new MonoUserSampleEngine({ ref: analyzed.ref, buffer: analyzed.buffer,
      pcmBytes: analyzed.buffer.length * analyzed.buffer.numberOfChannels * 4 }, region,
    { mode: "mono", retrigger: "legato", glideMs: 100, attackMs: 0, releaseMs: 0 },
    destination, () => { finished++; });
    const at = Tone.immediate() + 0.06;
    const first = engine.trigger({ note: 60, velocity: 100,
      ownerId: "transport/qa/track/808", epoch: 1, audioTime: at });
    const rateC4 = engine.snapshot().targetPlaybackRate;
    const second = engine.trigger({ note: 64, velocity: 100,
      ownerId: "transport/qa/track/808", epoch: 1, audioTime: at + 0.04 });
    const during = engine.snapshot();
    const current = (engine as unknown as { current: {
      source: { playbackRate: { getValueAtTime(at: number): number } };
    } }).current;
    const rateMidGlide = current.source.playbackRate.getValueAtTime(at + 0.09);
    const rateE4 = during.targetPlaybackRate;
    if (!first || !second) throw new Error("Faltó voz de muestra");
    engine.noteOffHandle(second, at + 0.16);
    const afterTopOff = engine.snapshot();
    const released = engine.releaseEpoch("transport/qa", 1, at + 0.20, true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const afterStop = engine.snapshot();
    engine.dispose();
    destination.dispose();
    return { rateC4, rateMidGlide, rateE4, during, afterTopOff,
      released, afterStop, finished };
  });
  const c4 = 2 ** (0.5 / 12);
  const e4 = 2 ** (4.5 / 12);
  expect(result.rateC4).toBeCloseTo(c4, 5);
  expect(result.rateE4).toBeCloseTo(e4, 5);
  expect(result.rateMidGlide).toBeGreaterThan(c4);
  expect(result.rateMidGlide).toBeLessThan(e4);
  expect(result.during.activeSources).toBe(1);
  expect(result.during.heldNotes).toBe(2);
  expect(result.afterTopOff.targetPlaybackRate).toBeCloseTo(c4, 5);
  expect(result.afterTopOff.heldNotes).toBe(1);
  expect(result.released).toBe(1);
  expect(result.afterStop.activeSources).toBe(0);
  expect(result.afterStop.allocated).toBe(0);
  expect(result.finished).toBe(2);
});

test("retrigger mono y Stop del proyecto preservan 37 voces live con sustain", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qa-808-input", new OfflineAudioContext(1, 1, 48_000));
    const instrument = { instrumentId: "user-sampler", presetId: `asset:${analyzed.ref.id}`,
      packageVersion: `sha256:${analyzed.ref.sha256}`,
      sampleRegion: { startFrame: 0, endFrame: analyzed.buffer.length,
        fadeInFrames: 0, fadeOutFrames: 0, rootMidi: 60, cents: 0,
        reverse: false, loopMode: "loop" as const, playMode: "gate" as const },
      sampleVoice: { mode: "mono" as const, retrigger: "always" as const,
        glideMs: 80, attackMs: 0, releaseMs: 0 } };
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-mono-stop", at: 1 }),
      trackOrder: ["sample"], tracks: [{ id: "sample", name: "Muestra propia",
        kind: "instrument" as const, instrument, mix }], assets: [analyzed.ref] };
    const engine = new LiveStudioEngine();
    const playback = await engine.prepareProjectPlayback(document, () => [], undefined,
      { readAsset: async () => analyzed.data });
    if (!playback) throw new Error(engine.diagnostics().error ?? "Proyecto no preparado");
    const first = await engine.previewProjectSample("sample", 60, 100, "preview/mono-1");
    const second = await engine.previewProjectSample("sample", 72, 100, "preview/mono-2");
    const sampleState = engine.projectPlaybackSnapshot()?.audio.tracks[0];
    engine.releaseProjectPreview("preview/mono-1");
    engine.releaseProjectPreview("preview/mono-2");
    await engine.playProjectPlayback(0);
    engine.setGlobalPedal("qa-smk", "sustain", 127);
    const attacks = await Promise.all(Array.from({ length: 37 }, (_, index) => engine.noteOn({
      inputId: "smk-37-elite", channel: 4, originalNote: 48 + index,
      mappedMidi: 48 + index, rawVelocity: 100, amplitude: 0.7,
    })));
    for (let pitch = 48; pitch <= 84; pitch++) {
      engine.noteOff({ inputId: "smk-37-elite", channel: 4, originalNote: pitch });
    }
    engine.stopProjectPlayback();
    const afterStop = engine.diagnostics().voices?.activeVoiceCount;
    engine.setGlobalPedal("qa-smk", "sustain", 0);
    const afterPedal = engine.diagnostics().voices?.activeVoiceCount;
    engine.dispose();
    return { first, second, sampleState, attackCount: attacks.filter(Boolean).length,
      afterStop, afterPedal };
  });
  expect(result.first).toBe(true);
  expect(result.second).toBe(true);
  expect(result.sampleState?.status).toBe("ready");
  expect(result.sampleState?.activeVoices).toBeLessThanOrEqual(2);
  expect(result.attackCount).toBe(37);
  expect(result.afterStop).toBe(37);
  expect(result.afterPedal).toBe(0);
});
