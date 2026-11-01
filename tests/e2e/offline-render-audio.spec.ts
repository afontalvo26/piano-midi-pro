import { expect, test } from "@playwright/test";

test("render PCM aislado usa timeline y stems sin cambiar Tone live", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`BROWSER: ${message.text()}`);
  });
  page.on("pageerror", (error) => console.log(`PAGEERROR: ${error.message}`));
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { ProjectAudioSink } = await import("/src/audio/projectAudioSink.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { MusicalClock } = await import("/src/sequencer/musicalClock.ts");
    const { TransportScheduler } = await import("/src/sequencer/transportScheduler.ts");
    const { createArrangementResolver } = await import("/src/composition/resolveProjectTimeline.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=realm-1");
    await Tone.start();
    const contextBefore = Tone.getContext();
    const frames = 12_000;
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
      Math.round(3_000 * Math.sin(frame * 0.1)), true);
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/wav" }),
      "render-hit", new OfflineAudioContext(1, 1, 48_000));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const clip = (id: string, trackId: string) => ({ id, trackId, kind: "audio" as const,
      startTick: 0, lengthTicks: 480, sourceOffsetTick: 0, loopMode: "none" as const,
      tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
      sourceId: analyzed.ref.id, sourceStartFrame: 0, sourceEndFrame: frames,
      fadeInFrames: 0, fadeOutFrames: 0 });
    const document = { ...createProjectDocument({ id: "qa-offline", at: 1 }),
      trackOrder: ["a", "b"], tracks: [
        { id: "a", name: "A", kind: "audio" as const, mix },
        { id: "b", name: "B", kind: "audio" as const, mix },
      ], clips: [clip("ca", "a"), clip("cb", "b")], assets: [analyzed.ref] };
    const options = { startTick: 0, endTick: 480, sampleRate: 48_000, tailSeconds: 0 };
    const reader = { readAsset: async () => analyzed.data };
    const progress: string[] = [];
    const full = await renderProjectPcm(document, options, reader, undefined,
      (state) => progress.push(state.phase));
    const stem = await renderProjectPcm(document, { ...options, trackId: "a" }, reader);
    const group = await renderProjectPcm(document,
      { ...options, trackIds: ["a", "b"] }, reader);
    const soloDocument = { ...document, tracks: document.tracks.map((track) => track.id === "b"
      ? { ...track, mix: { ...track.mix, solo: true } } : track) };
    const silentStem = await renderProjectPcm(soloDocument,
      { ...options, trackId: "a" }, reader);
    const reference = await Tone.Offline(async () => {
      const limiter = new Tone.Limiter(-2).toDestination();
      const sink = new ProjectAudioSink(document, limiter, new DecodedPianoSampleBank(),
        () => true, reader);
      await sink.prepare({ metronome: false });
      const audio = { currentTime: 0, state: "running" as const };
      const scheduler = new TransportScheduler({ rootOwnerId: sink.rootOwnerId,
        clock: new MusicalClock(document.tempoMap, document.meterMap), audio, sink,
        autoPump: false, startLeadSeconds: 0, horizonSeconds: 0.5,
        resolve: createArrangementResolver(document) });
      scheduler.start(0);
      audio.currentTime = 0.2;
      scheduler.pump();
    }, 0.25, 2, 48_000);
    const referenceLeft = reference.get()!.getChannelData(0);
    const firstSample = (values: Float32Array) => values.findIndex((value) => Math.abs(value) > 1e-4);
    let maxDifference = 0;
    for (let index = 0; index < full.left.length; index++) {
      maxDifference = Math.max(maxDifference, Math.abs(full.left[index]! - referenceLeft[index]!));
    }
    const energy = (values: Float32Array) => values.reduce((sum, value) => sum + value * value, 0);
    return { sameContext: Tone.getContext() === contextBefore,
      frames: full.left.length, rate: full.sampleRate,
      fullEnergy: energy(full.left), stemEnergy: energy(stem.left),
      groupEnergy: energy(group.left), silentStemEnergy: energy(silentStem.left),
      fullTracks: full.report.selectedTrackIds, stemTracks: stem.report.selectedTrackIds,
      skipped: full.report.transport.skippedAudioClips,
      missing: full.report.audio.missingAttacks, progress,
      maxDifference, onsetDifference: firstSample(full.left) - firstSample(referenceLeft) };
  });
  expect(result.sameContext).toBe(true);
  expect(result.frames).toBe(12_000);
  expect(result.rate).toBe(48_000);
  expect(result.fullEnergy).toBeGreaterThan(result.stemEnergy * 3);
  expect(result.stemEnergy).toBeGreaterThan(0);
  expect(result.groupEnergy).toBeCloseTo(result.fullEnergy, 3);
  expect(result.silentStemEnergy).toBe(0);
  expect(result.fullTracks).toEqual(["a", "b"]);
  expect(result.stemTracks).toEqual(["a"]);
  expect(result.skipped).toBe(0);
  expect(result.missing).toBe(0);
  expect(result.progress).toContain("rendering");
  expect(result.progress).toContain("done");
  expect(result.maxDifference).toBeLessThan(0.0001);
  expect(result.onsetDifference).toBe(0);
});

test("render bloquea activo truncado y respeta cancelación previa", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=realm-1");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const ref = { id: "missing-bytes", sha256: "0".repeat(64), byteLength: 44,
      mimeType: "audio/wav", sourceKind: "user" as const, license: "user-controlled",
      frameCount: 1, sampleRate: 48_000, channelCount: 1 };
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const clip = { id: "c", trackId: "a", kind: "audio" as const, startTick: 0,
      lengthTicks: 480, sourceOffsetTick: 0, loopMode: "none" as const,
      tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
      sourceId: ref.id, sourceStartFrame: 0, sourceEndFrame: 1,
      fadeInFrames: 0, fadeOutFrames: 0 };
    const document = { ...createProjectDocument({ id: "qa-invalid-render", at: 1 }),
      trackOrder: ["a"], tracks: [{ id: "a", name: "Audio", kind: "audio" as const, mix }],
      clips: [clip], assets: [ref] };
    const options = { startTick: 0, endTick: 480, sampleRate: 48_000, tailSeconds: 0 };
    const reader = { readAsset: async () => new Blob(["short"], { type: "audio/wav" }) };
    let corrupt = "";
    try { await renderProjectPcm(document, options, reader); }
    catch (error) { corrupt = String(error); }
    const abort = new AbortController();
    abort.abort();
    let cancelled = "";
    try { await renderProjectPcm(document, options, reader, abort.signal); }
    catch (error) { cancelled = String(error); }
    return { corrupt, cancelled };
  });
  expect(result.corrupt).toContain("tamaño");
  expect(result.cancelled).toContain("AbortError");
});

test("un clip grabado que termina antes del WAV conserva su PCM", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=short-clip");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qa-short-recording", new OfflineAudioContext(1, 1, 48_000));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-short-export", at: 1 }),
      trackOrder: ["audio"], tracks: [{ id: "audio", name: "Toma",
        kind: "audio" as const, mix }], assets: [analyzed.ref],
      clips: [{ id: "clip", trackId: "audio", kind: "audio" as const,
        startTick: 0, lengthTicks: 384, sourceOffsetTick: 0,
        loopMode: "none" as const, tailPolicy: "cut" as const,
        transpose: 0, gainDb: 0, muted: false, sourceId: analyzed.ref.id,
        sourceStartFrame: 0, sourceEndFrame: Math.round(0.2 * analyzed.buffer.sampleRate),
        fadeInFrames: 0, fadeOutFrames: 0 }] };
    const pcm = await renderProjectPcm(document,
      { startTick: 0, endTick: 1920, sampleRate: 48_000, tailSeconds: 0 },
      { readAsset: async () => analyzed.data });
    let earlyEnergy = 0;
    let lateEnergy = 0;
    for (let index = 2_400; index < 7_200; index++) earlyEnergy += pcm.left[index]! ** 2;
    for (let index = 24_000; index < 36_000; index++) lateEnergy += pcm.left[index]! ** 2;
    return { earlyEnergy, lateEnergy, skipped: pcm.report.transport.skippedAudioClips };
  });
  expect(result.earlyEnergy).toBeGreaterThan(0);
  expect(result.lateEnergy).toBe(0);
  expect(result.skipped).toBe(0);
});

test("WAV retiene piano, batería y sampler aunque sus notas acaben antes del render", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=short-voices");
    const { PROJECT_PIANO_INSTRUMENT, PROJECT_DRUM_INSTRUMENT } =
      await import("/src/audio/projectAudioSink.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qa-short-voice", new OfflineAudioContext(1, 1, 48_000));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const instruments = [
      { id: "piano", kind: "instrument" as const, instrument: PROJECT_PIANO_INSTRUMENT,
        pitch: 60, channel: 0, assets: [] },
      { id: "drum", kind: "drum" as const, instrument: PROJECT_DRUM_INSTRUMENT,
        pitch: 36, channel: 9, assets: [] },
      { id: "mono", kind: "instrument" as const,
        instrument: { instrumentId: "user-sampler", presetId: `asset:${analyzed.ref.id}`,
          packageVersion: `sha256:${analyzed.ref.sha256}`,
          sampleRegion: { startFrame: 0, endFrame: analyzed.buffer.length,
            fadeInFrames: 0, fadeOutFrames: 0, rootMidi: 60, cents: 0,
            reverse: false, loopMode: "loop" as const, playMode: "gate" as const },
          sampleVoice: { mode: "mono" as const, retrigger: "legato" as const,
            glideMs: 100, attackMs: 0, releaseMs: 0 } },
        pitch: 60, channel: 0, assets: [analyzed.ref] },
    ];
    const results: Array<{ id: string; energy: number; skipped: number }> = [];
    for (const item of instruments) {
      const document = { ...createProjectDocument({ id: `qa-short-${item.id}`, at: 1 }),
        trackOrder: [item.id], tracks: [{ id: item.id, name: item.id,
          kind: item.kind, instrument: item.instrument, mix }], assets: item.assets,
        patterns: [{ id: "pattern", name: "Una nota", version: 1, lengthTicks: 960,
          notes: [{ id: "note", startTick: 0, durationTick: 120, pitch: item.pitch,
            velocity: 100, releaseVelocity: 64, channel: item.channel,
            origin: { kind: "drawn" as const } }], expression: [] }],
        clips: [{ id: "clip", trackId: item.id, kind: "pattern" as const,
          sourceId: "pattern", sourceVersion: 1, startTick: 0, lengthTicks: 960,
          sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
          transpose: 0, gainDb: 0, muted: false }] };
      const pcm = await renderProjectPcm(document,
        { startTick: 0, endTick: 1920, sampleRate: 48_000, tailSeconds: 0 },
        { readAsset: async () => analyzed.data });
      let energy = 0;
      for (let frame = 500; frame < 2_500; frame++) energy += pcm.left[frame]! ** 2;
      results.push({ id: item.id, energy, skipped: pcm.report.transport.skippedNotes });
    }
    return results;
  });
  expect(result.map((item) => item.id)).toEqual(["piano", "drum", "mono"]);
  expect(result.every((item) => item.energy > 0)).toBe(true);
  expect(result.every((item) => item.skipped === 0)).toBe(true);
});
