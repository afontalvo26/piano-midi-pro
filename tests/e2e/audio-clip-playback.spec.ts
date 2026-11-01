import { expect, test } from "@playwright/test";

test("clip guardado se prepara, Seek reanuda por frame y Stop cancela sólo el transporte", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { analyzeUserSample, loadVerifiedUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { ProjectAudioSink } = await import("/src/audio/projectAudioSink.ts");
    const { ProjectPlayback } = await import("/src/audio/projectPlayback.ts?qa=aud-position-1");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    await Tone.start();
    const raw = Tone.getContext().rawContext;
    const frames = 48_000;
    const bytes = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(bytes);
    const ascii = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
    };
    ascii(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 48_000, true);
    view.setUint32(28, 96_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, "data"); view.setUint32(40, frames * 2, true);
    for (let frame = 0; frame < frames; frame++) view.setInt16(44 + frame * 2,
      Math.round(8_000 * Math.sin(frame * 0.05)), true);
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/wav" }),
      "take-audio", new OfflineAudioContext(1, 1, 48_000));
    const reopened = await loadVerifiedUserSample(analyzed.ref,
      { readAsset: async () => analyzed.data }, new OfflineAudioContext(1, 1, 44_100),
      { maxEncodedBytes: 64 * 1024 * 1024, maxDecodedBytes: 96 * 1024 * 1024,
        maxDurationSeconds: 180 });
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const clip = { id: "clip-audio", trackId: "audio", kind: "audio" as const,
      startTick: 0, lengthTicks: 1_920, sourceOffsetTick: 0, loopMode: "none" as const,
      tailPolicy: "cut" as const, transpose: 0, gainDb: -3, muted: false,
      sourceId: analyzed.ref.id, sourceStartFrame: 0, sourceEndFrame: analyzed.buffer.length,
      fadeInFrames: 100, fadeOutFrames: 100 };
    const document = { ...createProjectDocument({ id: "qa-audio-clip", at: 1 }),
      trackOrder: ["audio"], tracks: [{ id: "audio", name: "Take", kind: "audio" as const, mix }],
      assets: [analyzed.ref], clips: [clip] };
    const destination = new Tone.Gain(0).toDestination();
    const sink = new ProjectAudioSink(document, destination, new DecodedPianoSampleBank(),
      () => true, { readAsset: async () => analyzed.data });
    const prepared = await sink.prepare();
    const resolver = createArrangementResolver(document);
    const audio = { get currentTime() { return raw.currentTime; },
      get state() { return raw.state === "interrupted" ? "suspended" : raw.state; } };
    const playback = new ProjectPlayback(document, sink, audio, resolver);
    const scheduled: Array<{ elapsed: number; end: number; at: number }> = [];
    const original = sink.audioClip.bind(sink);
    sink.audioClip = (event) => {
      scheduled.push({ elapsed: event.elapsedSeconds, end: event.endAudioTime, at: event.audioTime });
      return original(event);
    };
    const played = playback.play(960);
    const activeAtSeek = sink.diagnostics().projectAudioClipSources;
    const position = playback.positionAtAudioTime(raw.currentTime + 0.08);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const mixBefore = sink.diagnostics();
    sink.setTrackMix("audio", { gainDb: -12, pan: 0.75 });
    sink.setMasterGainDb(-6);
    await new Promise((resolve) => setTimeout(resolve, 35));
    const mixAfter = sink.diagnostics();
    playback.stop();
    const afterStopActive = sink.diagnostics().tracks[0]?.activeVoices;
    await new Promise((resolve) => setTimeout(resolve, 35));
    const afterStop35 = sink.diagnostics().projectAudioClipSources;
    await new Promise((resolve) => setTimeout(resolve, 130));
    const afterStop = sink.diagnostics().projectAudioClipSources;
    const meterAfterStop = sink.diagnostics().tracks[0]?.meter;
    const visibleErrorSink = new ProjectAudioSink(document, destination, new DecodedPianoSampleBank(),
      () => true, { readAsset: async () => new Blob(["short"], { type: "audio/wav" }) });
    const failed = await visibleErrorSink.prepare();
    visibleErrorSink.dispose();
    playback.dispose();
    destination.dispose();
    return { prepared, played, scheduled, activeAtSeek, afterStop, afterStop35,
      afterStopActive, meterAfterStop, position,
      mixBefore: mixBefore.tracks[0], masterBefore: mixBefore.masterMeter,
      mixAfter: mixAfter.tracks[0], masterGainDb: mixAfter.masterGainDb,
      reopenedFrames: reopened.buffer.length, reopenedRate: reopened.buffer.sampleRate,
      expectedFrames: analyzed.ref.frameCount, failed: failed.tracks[0] };
  });
  expect(result.prepared.tracks[0]).toMatchObject({ status: "ready", error: null });
  expect(result.played).toBe(true);
  expect(result.scheduled).toHaveLength(1);
  expect(result.scheduled[0]?.elapsed).toBeCloseTo(0.5, 2);
  expect(result.scheduled[0]!.end).toBeGreaterThan(result.scheduled[0]!.at);
  expect(result.activeAtSeek).toBe(1);
  expect(result.afterStopActive).toBe(0);
  expect(result.afterStop).toBe(0);
  expect(result.meterAfterStop?.peak).toBe(0);
  expect(result.position.tick).toBeGreaterThan(960);
  expect(result.mixBefore?.meter.peak).toBeGreaterThan(0);
  expect(result.mixBefore?.meter.rms).toBeGreaterThan(0);
  expect(result.masterBefore.peak).toBeGreaterThan(0);
  expect(result.mixAfter).toMatchObject({ gainDb: -12, pan: 0.75 });
  expect(result.masterGainDb).toBe(-6);
  expect(result.reopenedFrames).toBe(result.expectedFrames);
  expect(result.reopenedRate).toBe(48_000);
  expect(result.failed).toMatchObject({ status: "error" });
  expect(result.failed?.error).toContain("tamaño");
});

test("mix rechaza parámetros de efecto inválidos con diagnóstico visible", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { ProjectAudioSink } = await import("/src/audio/projectAudioSink.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const effect = { id: "fx-1", kind: "reverb", enabled: true, parameters: {} };
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [effect] };
    const document = { ...createProjectDocument({ id: "qa-fx", at: 1 }),
      trackOrder: ["bus"], tracks: [{ id: "bus", name: "Bus", kind: "bus" as const, mix }],
      mix: { masterGainDb: 0, masterEffects: [effect] } };
    const destination = new Tone.Gain(0).toDestination();
    const sink = new ProjectAudioSink(document, destination, new DecodedPianoSampleBank(), () => true);
    const diagnostics = sink.diagnostics();
    const owns = sink.hasAudioOwnership();
    sink.dispose();
    const unknown = { id: "future-fx", kind: "future-v3", enabled: false,
      parameters: { custom: 1 } };
    const bypassDocument = { ...document,
      tracks: document.tracks.map((track) => ({ ...track,
        mix: { ...track.mix, effects: [unknown] } })),
      mix: { ...document.mix, masterEffects: [unknown] } };
    const bypassSink = new ProjectAudioSink(bypassDocument, destination,
      new DecodedPianoSampleBank(), () => true);
    const bypassDiagnostics = bypassSink.diagnostics();
    const bypassOwns = bypassSink.hasAudioOwnership();
    bypassSink.dispose();
    const activeUnknown = { ...unknown, enabled: true };
    const activeDocument = { ...document,
      tracks: document.tracks.map((track) => ({ ...track,
        mix: { ...track.mix, effects: [activeUnknown] } })),
      mix: { ...document.mix, masterEffects: [activeUnknown] } };
    const activeSink = new ProjectAudioSink(activeDocument, destination,
      new DecodedPianoSampleBank(), () => true);
    const activeDiagnostics = activeSink.diagnostics();
    activeSink.dispose();
    destination.dispose();
    return { diagnostics, owns, bypassDiagnostics, bypassOwns, activeDiagnostics };
  });
  expect(result.diagnostics.tracks[0]).toMatchObject({ status: "error" });
  expect(result.diagnostics.tracks[0]?.error).toContain("parámetros no coinciden");
  expect(result.diagnostics.masterError).toContain("parámetros no coinciden");
  expect(result.owns).toBe(false);
  expect(result.bypassDiagnostics.tracks[0]).toMatchObject({ status: "ready", error: null });
  expect(result.bypassDiagnostics.masterError).toBeNull();
  expect(result.bypassOwns).toBe(true);
  expect(result.activeDiagnostics.tracks[0]?.error).toContain("no disponible");
  expect(result.activeDiagnostics.masterError).toContain("no disponible");
});
