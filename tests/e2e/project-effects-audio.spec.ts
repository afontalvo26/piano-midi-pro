import { expect, test } from "@playwright/test";

test("recorded audio traverses enabled track/master effects with live and WAV PCM parity", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(30_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((reply) => reply.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=mix02");
    const { ProjectAudioSink } = await import("/src/audio/projectAudioSink.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { MusicalClock } = await import("/src/sequencer/musicalClock.ts");
    const { TransportScheduler } = await import("/src/sequencer/transportScheduler.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const bytes = await fetch("/audio/salamander/core/C4.ogg").then((reply) => reply.arrayBuffer());
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/ogg" }),
      "mix02-recorded-piano", new OfflineAudioContext(1, 1, 48_000));
    const effect = (id: string, kind: string, parameters: Record<string, number | string>,
      enabled = true) => ({ id, kind, enabled, parameters });
    const effects = [
      effect("eq", "eq3", { lowDb: 3, midDb: -2, highDb: 2, lowHz: 300, highHz: 3000 }),
      effect("filter", "filter", { type: "lowpass", cutoffHz: 7000, q: 0.7 }),
      effect("comp", "compressor", { thresholdDb: -24, ratio: 3, attackMs: 5,
        releaseMs: 90, kneeDb: 6 }),
      effect("sat", "saturation", { drive: 0.3, wet: 0.25 }),
      effect("delay", "delay", { timeMs: 80, feedback: 0.2, wet: 0.15 }),
      effect("reverb", "reverb", { roomSize: 0.3, dampeningHz: 7000, wet: 0.15 }),
      effect("limit", "limiter", { thresholdDb: -3 }),
    ];
    const mix = { gainDb: -2, pan: 0.15, mute: false, solo: false, armed: false,
      sends: [], effects };
    const clip = { id: "recording", trackId: "audio", kind: "audio" as const,
      sourceId: analyzed.ref.id, startTick: 0, lengthTicks: 960, sourceOffsetTick: 0,
      loopMode: "none" as const, tailPolicy: "cut" as const, transpose: 0, gainDb: 0,
      muted: false, sourceStartFrame: 0, sourceEndFrame: Math.min(22_000, analyzed.buffer.length),
      fadeInFrames: 0, fadeOutFrames: 0 };
    const document = { ...createProjectDocument({ id: "mix02-audio", at: 1 }),
      trackOrder: ["audio"], tracks: [{ id: "audio", name: "Grabación", kind: "audio" as const, mix }],
      clips: [clip], assets: [analyzed.ref], mix: { masterGainDb: -1,
        masterEffects: [effect("master-filter", "filter",
          { type: "highpass", cutoffHz: 45, q: 0.7 })] } };
    const options = { startTick: 0, endTick: 1920, sampleRate: 48_000, tailSeconds: 0.2 };
    const reader = { readAsset: async () => analyzed.data };
    const rendered = await renderProjectPcm(document, options, reader);
    const dryDocument = { ...document, tracks: document.tracks.map((track) => ({ ...track,
      mix: { ...track.mix, effects: effects.map((item) => ({ ...item, enabled: false })) } })),
      mix: { ...document.mix, masterEffects: document.mix.masterEffects.map((item) => ({
        ...item, enabled: false })) } };
    const dry = await renderProjectPcm(dryDocument, options, reader);
    const individual: { kind: string; difference: number; finite: boolean }[] = [];
    for (const item of effects) {
      const isolated = { ...dryDocument, tracks: dryDocument.tracks.map((track) => ({ ...track,
        mix: { ...track.mix, effects: [item] } })) };
      const pcm = await renderProjectPcm(isolated, options, reader);
      let difference = 0;
      let finite = true;
      for (let index = 0; index < pcm.left.length; index++) {
        difference = Math.max(difference, Math.abs(pcm.left[index]! - dry.left[index]!));
        if (!Number.isFinite(pcm.left[index]!) || !Number.isFinite(pcm.right[index]!)) finite = false;
      }
      individual.push({ kind: item.kind, difference, finite });
    }
    const reference = await Tone.Offline(async () => {
      const limiter = new Tone.Limiter(-2).toDestination();
      const sink = new ProjectAudioSink(document, limiter, new DecodedPianoSampleBank(),
        () => true, reader);
      const prepared = await sink.prepare({ metronome: false });
      if (prepared.masterError || prepared.tracks.some((track) => track.error)) {
        throw new Error(prepared.masterError ?? prepared.tracks[0]?.error ?? "mix no listo");
      }
      const audio = { currentTime: 0, state: "running" as const };
      const scheduler = new TransportScheduler({ rootOwnerId: sink.rootOwnerId,
        clock: new MusicalClock(document.tempoMap, document.meterMap), audio, sink,
        autoPump: false, startLeadSeconds: 0, horizonSeconds: 0.5,
        resolve: createArrangementResolver(document) });
      scheduler.start(0);
      for (let seconds = 0.2; seconds <= 1.2; seconds += 0.2) {
        audio.currentTime = seconds;
        scheduler.pump();
      }
    }, 1.2, 2, 48_000);
    const referenceLeft = reference.get()!.getChannelData(0);
    let maxDifference = 0;
    let dryDifference = 0;
    let peak = 0;
    let nonFinite = 0;
    let energy = 0;
    for (let index = 0; index < rendered.left.length; index++) {
      const value = rendered.left[index]!;
      maxDifference = Math.max(maxDifference, Math.abs(value - referenceLeft[index]!));
      dryDifference = Math.max(dryDifference, Math.abs(value - dry.left[index]!));
      peak = Math.max(peak, Math.abs(value));
      energy += value * value;
      if (!Number.isFinite(value) || !Number.isFinite(rendered.right[index]!)) nonFinite++;
    }
    return { maxDifference, dryDifference, peak, energy, nonFinite, individual,
      trackError: rendered.report.audio.tracks[0]?.error,
      masterError: rendered.report.audio.masterError,
      skipped: rendered.report.transport.skippedAudioClips };
  });
  console.log("MIX-02 PCM:", JSON.stringify(result));
  expect(result.trackError).toBeNull();
  expect(result.masterError).toBeNull();
  expect(result.skipped).toBe(0);
  expect(result.nonFinite).toBe(0);
  expect(result.energy).toBeGreaterThan(0.001);
  expect(result.peak).toBeLessThan(1);
  expect(result.dryDifference).toBeGreaterThan(0.0001);
  expect(result.maxDifference).toBeLessThan(0.0001);
  expect(result.individual.map((item) => item.kind)).toEqual([
    "eq3", "filter", "compressor", "saturation", "delay", "reverb", "limiter",
  ]);
  for (const item of result.individual) {
    expect(item.finite).toBe(true);
    expect(item.difference, item.kind).toBeGreaterThan(0.00001);
  }
});
