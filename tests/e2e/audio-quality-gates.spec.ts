import { expect, test } from "@playwright/test";

test("127 MIDI velocities retain distinct gain and monotone recorded C4 energy", async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(20_000);
  await page.goto("/src/audio/toneSampleVoiceFactory.ts", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/toneSampleVoiceFactory.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { DecodedPianoSampleBank, ToneSampleVoiceFactory } =
      await import("/src/audio/toneSampleVoiceFactory.ts");
    const { computeVelocityExpression, DEFAULT_PHYSICAL_CALIBRATION } =
      await import("/src/utils/velocity.ts");
    const { flushOfflineGraph } = await import("/src/audio/offlineGraphRetention.ts");
    const context = new OfflineAudioContext(1, 1, 48_000);
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const buffer = await context.decodeAudioData(await recorded.arrayBuffer());
    const gains = Array.from({ length: 127 }, (_, index) =>
      computeVelocityExpression(index + 1, "expressive", DEFAULT_PHYSICAL_CALIBRATION));
    let raw: BaseAudioContext | null = null;
    const rendered = await Tone.Offline(() => {
      raw = Tone.getContext().rawContext;
      const bank = new DecodedPianoSampleBank();
      bank.add({ midi: 60, buffer });
      const output = new Tone.Gain(1).toDestination();
      const factory = new ToneSampleVoiceFactory(bank, output, {
        maxShiftSemitones: 0, velocityColor: true, attackSeconds: 0,
      });
      for (let index = 0; index < gains.length; index++) {
        const at = 0.02 + index * 0.06;
        const expression = gains[index]!;
        const voice = factory.create({ attackId: index + 1, inputId: "qlt-velocity",
          channel: 0, originalNote: 60, mappedMidi: 60,
          rawVelocity: index + 1, amplitude: expression.gain, audioTime: at },
        { gain: expression.gain, bendSemitones: 0, softPedal: false,
          modulation: 0 }, () => {});
        if (!voice) throw new Error(`C4 missing at velocity ${index + 1}`);
        voice.release(at + 0.04, 0.008);
      }
    }, 7.65, 1, 48_000);
    if (raw) flushOfflineGraph(raw);
    const pcm = rendered.get()!.getChannelData(0);
    const energy = gains.map((_, index) => {
      const at = 0.02 + index * 0.06;
      const start = Math.round((at + 0.010) * 48_000);
      const end = Math.round((at + 0.030) * 48_000);
      let sum = 0;
      for (let frame = start; frame < end; frame++) sum += pcm[frame]! ** 2;
      return sum;
    });
    let drops = 0;
    let worstRatio = Infinity;
    for (let index = 1; index < energy.length; index++) {
      const ratio = energy[index]! / energy[index - 1]!;
      if (ratio < 0.98) drops++;
      worstRatio = Math.min(worstRatio, ratio);
    }
    return { distinctRaw: new Set(gains.map((item) => item.raw)).size,
      distinctGain: new Set(gains.map((item) => item.gain)).size,
      softEnergy: energy[0], mezzoEnergy: energy[63], forteEnergy: energy[126],
      drops, worstRatio, nonFinite: energy.filter((value) => !Number.isFinite(value)).length };
  });
  console.log("QLT-02 C4 127 velocities:", JSON.stringify(result));
  expect(result.distinctRaw).toBe(127);
  expect(result.distinctGain).toBe(127);
  expect(result.nonFinite).toBe(0);
  expect(result.softEnergy).toBeGreaterThan(0);
  expect(result.forteEnergy).toBeGreaterThan(result.mezzoEnergy * 2);
  expect(result.mezzoEnergy).toBeGreaterThan(result.softEnergy * 8);
  expect(result.drops).toBe(0);
});

test("recorded drum velocity layers have no missing or silent transition", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/src/audio/virtuosityCore.ts", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { fetchVirtuosityManifest, decodeVirtuosityPiece } =
      await import("/src/audio/virtuosityCore.ts");
    const { bufferRmsDb, median } = await import("/src/engine/sampleLevels.ts");
    const { recordedVelocityLayerTrims } = await import("/src/audio/recordedVelocityLayers.ts");
    const manifest = await fetchVirtuosityManifest();
    const context = new OfflineAudioContext(2, 1, 48_000);
    const pieces = ["kick", "snare", "hatClosed", "hatOpen", "cowbell"] as const;
    const reports = [];
    for (const piece of pieces) {
      const layers = await decodeVirtuosityPiece(manifest, piece, context);
      const levels = [...layers.values()].map((buffers) =>
        median(buffers.map((buffer) => bufferRmsDb(buffer, 0.5))));
      const reference = median([...layers.values()].flat().map((buffer) => bufferRmsDb(buffer, 0.5)));
      const trims = [...recordedVelocityLayerTrims(layers, reference).values()];
      const effective = Array.from({ length: 127 }, (_, index) => {
        const velocity = (index + 1) / 127;
        const layer = Math.max(0, Math.ceil(velocity * levels.length) - 1);
        return levels[layer]! + trims[layer]! + 20 * Math.log10(velocity ** 1.35);
      });
      const deltas = effective.slice(1).map((value, index) => value - effective[index]!);
      const boundarySteps = deltas.filter((_, index) =>
        Math.ceil((index + 1) * levels.length / 127) !==
        Math.ceil((index + 2) * levels.length / 127));
      reports.push({ piece, layers: layers.size,
        samples: [...layers.values()].reduce((sum, buffers) => sum + buffers.length, 0),
        levels, trims, minStepDb: Math.min(...deltas),
        maxBoundaryDb: Math.max(...boundarySteps.map(Math.abs)) });
    }
    return reports;
  });
  console.log("QLT-02 Virtuosity layers:", JSON.stringify(result));
  expect(result.map((item) => item.samples)).toEqual([8, 8, 8, 8, 6]);
  expect(result.every((item) => item.levels.every(Number.isFinite))).toBe(true);
  expect(result.every((item) => item.levels.every((level) => level > -100))).toBe(true);
  expect(result.every((item) => item.minStepDb > 0)).toBe(true);
  expect(result.every((item) => item.maxBoundaryDb < 1)).toBe(true);
});

test("piano, drum and recorded clip WAV has finite stereo PCM, DC and peak headroom", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=qlt03-mix");
    const { PROJECT_PIANO_INSTRUMENT, PROJECT_DRUM_INSTRUMENT } =
      await import("/src/audio/projectAudioSink.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qlt03-recorded-clip", new OfflineAudioContext(1, 1, 48_000));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const pianoPattern = { id: "piano-pattern", name: "C4", version: 1, lengthTicks: 960,
      notes: [{ id: "piano-note", startTick: 0, durationTick: 240, pitch: 60,
        velocity: 100, releaseVelocity: 64, channel: 0,
        origin: { kind: "drawn" as const } }], expression: [] };
    const drumPattern = { id: "drum-pattern", name: "Kick", version: 1, lengthTicks: 960,
      notes: [{ id: "drum-note", startTick: 0, durationTick: 120, pitch: 36,
        velocity: 100, releaseVelocity: 64, channel: 9,
        origin: { kind: "drawn" as const } }], expression: [] };
    const patternClip = (id: string, trackId: string, sourceId: string) => ({
      id, trackId, kind: "pattern" as const, sourceId, sourceVersion: 1,
      startTick: 0, lengthTicks: 960, sourceOffsetTick: 0,
      loopMode: "none" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false });
    const clip = { id: "audio-clip", trackId: "audio", kind: "audio" as const,
      sourceId: analyzed.ref.id, startTick: 0, lengthTicks: 960,
      sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: -12, muted: false,
      sourceStartFrame: 0, sourceEndFrame: 24_000,
      fadeInFrames: 96, fadeOutFrames: 96 };
    const document = { ...createProjectDocument({ id: "qlt03-pcm", at: 1 }),
      trackOrder: ["piano", "drum", "audio"], tracks: [
        { id: "piano", name: "Piano", kind: "instrument" as const,
          instrument: PROJECT_PIANO_INSTRUMENT, mix },
        { id: "drum", name: "Drum", kind: "drum" as const,
          instrument: PROJECT_DRUM_INSTRUMENT, mix },
        { id: "audio", name: "Audio", kind: "audio" as const, mix },
      ], patterns: [pianoPattern, drumPattern], assets: [analyzed.ref],
      clips: [patternClip("piano-clip", "piano", "piano-pattern"),
        patternClip("drum-clip", "drum", "drum-pattern"), clip] };
    const pcm = await renderProjectPcm(document,
      { startTick: 0, endTick: 1920, sampleRate: 48_000, tailSeconds: 0 },
      { readAsset: async () => analyzed.data });
    const inspect = (data: Float32Array) => {
      let peak = 0; let sum = 0; let energy = 0; let nonFinite = 0;
      for (const value of data) {
        if (!Number.isFinite(value)) nonFinite++;
        peak = Math.max(peak, Math.abs(value));
        sum += value; energy += value * value;
      }
      let truePeak = peak;
      // Four-fold windowed sinc estimate catches intersample overs between frames.
      for (let index = 8; index < data.length - 8; index++) {
        for (const fraction of [0.25, 0.5, 0.75]) {
          let interpolated = 0;
          for (let tap = -8; tap <= 8; tap++) {
            const distance = fraction - tap;
            const sinc = Math.abs(distance) < 1e-9 ? 1 :
              Math.sin(Math.PI * distance) / (Math.PI * distance);
            const window = 0.42 + 0.5 * Math.cos(Math.PI * tap / 8) +
              0.08 * Math.cos(2 * Math.PI * tap / 8);
            interpolated += data[index + tap]! * sinc * window;
          }
          truePeak = Math.max(truePeak, Math.abs(interpolated));
        }
      }
      return { peak, truePeak, dc: sum / data.length,
        rms: Math.sqrt(energy / data.length), nonFinite };
    };
    return { left: inspect(pcm.left), right: inspect(pcm.right),
      skippedNotes: pcm.report.transport.skippedNotes,
      skippedClips: pcm.report.transport.skippedAudioClips,
      missing: pcm.report.audio.missingAttacks };
  });
  console.log("QLT-03 mixed PCM:", JSON.stringify(result));
  for (const channel of [result.left, result.right]) {
    expect(channel.nonFinite).toBe(0);
    expect(channel.rms).toBeGreaterThan(0.001);
    expect(Math.abs(channel.dc)).toBeLessThan(0.02);
    expect(channel.peak).toBeLessThan(1);
    expect(channel.truePeak).toBeLessThan(1);
  }
  expect(result.skippedNotes).toBe(0);
  expect(result.skippedClips).toBe(0);
  expect(result.missing).toBe(0);
});
