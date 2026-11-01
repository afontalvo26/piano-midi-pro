import { expect, test } from "@playwright/test";

test("AUT step/linear: proyecto live-like y WAV tienen mismo PCM grabado", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((reply) => reply.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=aut-read");
    const { ProjectAudioSink } = await import("/src/audio/projectAudioSink.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { MusicalClock } = await import("/src/sequencer/musicalClock.ts");
    const { createBaseAutomationResolver } = await import("/src/sequencer/automationResolver.ts");
    const { TransportScheduler } = await import("/src/sequencer/transportScheduler.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const bytes = await fetch("/audio/salamander/core/C4.ogg").then((reply) => reply.arrayBuffer());
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/ogg" }),
      "aut-recorded-piano", new OfflineAudioContext(1, 1, 48_000));
    if (analyzed.buffer.length < 36_000) throw new Error("Muestra grabada demasiado corta");
    const mix = { gainDb: -3, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const base = createProjectDocument({ id: "aut-audio", at: 1 });
    const document = { ...base,
      tempoMap: [{ tick: 0, microsPerQuarter: 500_000 },
        { tick: 960, microsPerQuarter: 250_000 }],
      trackOrder: ["audio"], tracks: [{ id: "audio", name: "Grabación",
        kind: "audio" as const, mix }],
      clips: [{ id: "clip", trackId: "audio", kind: "audio" as const,
        sourceId: analyzed.ref.id, startTick: 0, lengthTicks: 1920,
        sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
        transpose: 0, gainDb: 0, muted: false, sourceStartFrame: 0,
        sourceEndFrame: Math.min(analyzed.buffer.length, 48_000),
        fadeInFrames: 0, fadeOutFrames: 0 }],
      assets: [analyzed.ref], mix: { masterGainDb: -1, masterEffects: [] },
      automation: [
        { id: "gain", target: { scope: "track" as const, ownerId: "audio",
          parameterId: "gainDb" }, points: [
          { id: "g0", tick: 0, value: -18, shape: "linear" as const },
          { id: "g1", tick: 1920, value: 0, shape: "step" as const },
        ] },
        { id: "pan", target: { scope: "track" as const, ownerId: "audio",
          parameterId: "pan" }, points: [
          { id: "p0", tick: 0, value: -0.8, shape: "linear" as const },
          { id: "p1", tick: 1920, value: 0.8, shape: "step" as const },
        ] },
        { id: "master", target: { scope: "master" as const,
          parameterId: "masterGainDb" }, points: [
          { id: "m0", tick: 0, value: -6, shape: "step" as const },
          { id: "m1", tick: 960, value: -2, shape: "step" as const },
        ] },
      ] };
    const reader = { readAsset: async () => analyzed.data };
    const options = { startTick: 0, endTick: 1920, sampleRate: 48_000, tailSeconds: 0.2 };
    const wav = await renderProjectPcm(document, options, reader);
    const dry = await renderProjectPcm({ ...document, automation: [] }, options, reader);
    const reference = await Tone.Offline(async () => {
      const limiter = new Tone.Limiter(-2).toDestination();
      const sink = new ProjectAudioSink(document, limiter, new DecodedPianoSampleBank(),
        () => true, reader);
      const status = await sink.prepare({ metronome: false });
      if (status.masterError || status.tracks.some((track) => track.error)) {
        throw new Error(status.masterError ?? status.tracks[0]?.error ?? "Audio no listo");
      }
      const clock = new MusicalClock(document.tempoMap, document.meterMap);
      const audio = { currentTime: 0, state: "running" as const };
      const transport = new TransportScheduler({ rootOwnerId: sink.rootOwnerId,
        clock, audio, sink, autoPump: false, startLeadSeconds: 0,
        horizonSeconds: 0.5, resolve: createArrangementResolver(document),
        resolveAutomation: createBaseAutomationResolver(document, clock) });
      transport.start(0);
      for (let seconds = 0.2; seconds <= 1.0; seconds += 0.2) {
        audio.currentTime = seconds;
        transport.pump();
      }
    }, 0.95, 2, 48_000);
    const left = reference.get()!.getChannelData(0);
    let maxDifference = 0;
    let dryDifference = 0;
    let nonFinite = 0;
    let peak = 0;
    for (let i = 0; i < wav.left.length; i++) {
      maxDifference = Math.max(maxDifference, Math.abs(wav.left[i]! - left[i]!));
      dryDifference = Math.max(dryDifference, Math.abs(wav.left[i]! - dry.left[i]!));
      peak = Math.max(peak, Math.abs(wav.left[i]!), Math.abs(wav.right[i]!));
      if (!Number.isFinite(wav.left[i]!) || !Number.isFinite(wav.right[i]!)) nonFinite++;
    }
    return { maxDifference, dryDifference, nonFinite, peak,
      skipped: wav.report.transport.skippedAudioClips,
      trackError: wav.report.audio.tracks[0]?.error,
      masterError: wav.report.audio.masterError };
  });
  console.log("AUT PCM:", JSON.stringify(result));
  expect(result.skipped).toBe(0);
  expect(result.trackError).toBeNull();
  expect(result.masterError).toBeNull();
  expect(result.nonFinite).toBe(0);
  expect(result.peak).toBeGreaterThan(0.001);
  expect(result.peak).toBeLessThan(1);
  expect(result.dryDifference).toBeGreaterThan(0.0001);
  expect(result.maxDifference).toBeLessThan(0.0001);
});
