import { expect, test } from "@playwright/test";
import { clipEnvelopeGainAt, scheduleClipEnvelope } from "../../app/src/audio/audioClipEnvelope";

test("split conserva fade original y crossfades lineal/equalPower no crean hueco", () => {
  const base = { envelopeStartFrame: 0, envelopeEndFrame: 48_000,
    fadeInFrames: 1_000, fadeOutFrames: 1_000 };
  const splitGain = clipEnvelopeGainAt({ ...base, crossfades: [] }, 500, 0);
  expect(splitGain).toBeCloseTo(0.5, 6);
  for (const curve of ["linear", "equalPower"] as const) {
    for (let step = 0; step <= 100; step++) {
      const us = 100_000 + step * 1_000;
      const outgoing = clipEnvelopeGainAt({ ...base, crossfades: [{
        id: "x", role: "out", startUs: 100_000, endUs: 200_000, curve,
      }] }, 24_000, us);
      const incoming = clipEnvelopeGainAt({ ...base, crossfades: [{
        id: "x", role: "in", startUs: 100_000, endUs: 200_000, curve,
      }] }, 24_000, us);
      if (curve === "linear") expect(outgoing + incoming).toBeCloseTo(1, 6);
      else expect(outgoing ** 2 + incoming ** 2).toBeCloseTo(1, 6);
    }
  }
  const points: Array<{ value: number; at: number }> = [];
  const automation = {
    setValueAtTime(value: number, at: number) { points.push({ value, at }); },
    linearRampToValueAtTime(value: number, at: number) { points.push({ value, at }); },
  };
  scheduleClipEnvelope(automation, { ...base, fadeInFrames: 0, fadeOutFrames: 0,
    crossfades: [{ id: "x", role: "in", startUs: 100_000,
      endUs: 200_000, curve: "equalPower" }] },
  1, 1.2, 0, 48_000, 0, 1);
  expect(points[0]).toEqual({ value: 0, at: 1 });
  expect(points.some((point) => point.at > 1.1 && point.at < 1.2 &&
    point.value > 0 && point.value < 1)).toBe(true);
  expect(points.at(-1)?.value).toBe(0);
  expect(points.length).toBeLessThanOrEqual(72);
});

test("dos clips de una grabación real cruzan sin hueco PCM", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/audioClipEngine.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("Tone no disponible");
    const Tone = await import(toneUrl);
    const { AudioClipEngine } = await import("/src/audio/audioClipEngine.ts");
    const { flushOfflineGraph } = await import("/src/audio/offlineGraphRetention.ts");
    const { UserSampleCache, analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const recorded = await fetch("/audio/salamander/core/C4.ogg");
    const analyzed = await analyzeUserSample(new Blob([await recorded.arrayBuffer()],
      { type: "audio/ogg" }), "qa-crossfade-recording", new OfflineAudioContext(1, 1, 48_000));
    const rate = analyzed.buffer.sampleRate;
    const frameAt = (seconds: number) => Math.round(seconds * rate);
    const clip = (id: string, sourceStartFrame: number) => ({ id, trackId: "audio",
      kind: "audio" as const, startTick: 0, lengthTicks: 960, sourceOffsetTick: 0,
      loopMode: "none" as const, tailPolicy: "cut" as const,
      transpose: 0, gainDb: 0, muted: false, sourceId: analyzed.ref.id,
      sourceStartFrame, sourceEndFrame: frameAt(0.3),
      fadeInFrames: 0, fadeOutFrames: 0 });
    const clips = [clip("a", 0), clip("b", frameAt(0.1))];
    const event = (id: string, sourceStartFrame: number, start: number, end: number,
      role?: "in" | "out") => ({ kind: "audioClip" as const,
      eventId: `audio:${id}`, sourceKind: "arrangement", ownerPath: `track/audio/clip/${id}`,
      ownerId: `transport/qa/track/audio/clip/${id}/iteration-0/epoch-1`,
      trackId: "audio", clipId: id, tick: 0, absoluteTick: 0, iteration: 0, epoch: 1,
      sequence: 0, channel: 0, audioTime: start, endAudioTime: end,
      songTimeUs: Math.round(start * 1_000_000), elapsedSeconds: 0,
      clipStartTick: 0, clipEndTick: 960, assetId: analyzed.ref.id,
      sourceStartFrame, sourceEndFrame: frameAt(0.3),
      fadeInFrames: 0, fadeOutFrames: 0, gainDb: 0, tailPolicy: "cut" as const,
      crossfades: role ? [{ id: "cross", role, startUs: 100_000,
        endUs: 200_000, curve: "linear" as const }] : [] });
    const reader = { readAsset: async () => analyzed.data };
    const render = async (mode: "reference" | "cross" | "incoming" | "outgoing"): Promise<Float32Array> => {
      let engine: InstanceType<typeof AudioClipEngine> | null = null;
      let destination: InstanceType<typeof Tone.Gain> | null = null;
      let offlineRaw: BaseAudioContext | null = null;
      const rendered = await Tone.Offline(async () => {
        offlineRaw = Tone.getContext().rawContext;
        destination = new Tone.Gain(1).toDestination();
        engine = new AudioClipEngine("audio", clips, [analyzed.ref], destination,
          new UserSampleCache(), reader, undefined, mode === "reference" ? [] : [{
            id: "cross", outgoingClipId: "a", incomingClipId: "b", curve: "linear",
          }]);
        await engine.prepare();
        if (mode !== "incoming") engine.play(event("a", 0, 0,
          mode === "cross" || mode === "outgoing" ? 0.2 : 0.3,
          mode === "cross" || mode === "outgoing" ? "out" : undefined));
        if (mode === "cross" || mode === "incoming") {
          engine.play(event("b", frameAt(0.1), 0.1, 0.3, "in"));
        }
      }, 0.3, 1, 48_000);
      if (offlineRaw) flushOfflineGraph(offlineRaw);
      (engine as InstanceType<typeof AudioClipEngine> | null)?.dispose();
      (destination as InstanceType<typeof Tone.Gain> | null)?.dispose();
      return rendered.get()!.getChannelData(0).slice();
    };
    const reference = await render("reference");
    const crossed = await render("cross");
    const incoming = await render("incoming");
    const outgoing = await render("outgoing");
    let maxDifference = 0;
    let referenceEnergy = 0;
    let crossedEnergy = 0;
    let incomingEnergy = 0;
    let outgoingEnergy = 0;
    for (let frame = frameAt(0.12); frame < frameAt(0.18); frame++) {
      maxDifference = Math.max(maxDifference, Math.abs(reference[frame]! - crossed[frame]!));
      referenceEnergy += reference[frame]! ** 2;
      crossedEnergy += crossed[frame]! ** 2;
      incomingEnergy += incoming[frame]! ** 2;
      outgoingEnergy += outgoing[frame]! ** 2;
    }
    return { maxDifference, referenceEnergy, crossedEnergy, incomingEnergy,
      outgoingEnergy };
  });
  expect(result.referenceEnergy).toBeGreaterThan(0);
  expect(result.crossedEnergy).toBeGreaterThan(0);
  expect(result.incomingEnergy).toBeGreaterThan(0);
  expect(result.outgoingEnergy).toBeGreaterThan(0);
  expect(result.maxDifference).toBeLessThan(0.002);
  expect(result.crossedEnergy / result.referenceEnergy).toBeGreaterThan(0.98);
  expect(result.crossedEnergy / result.referenceEnergy).toBeLessThan(1.02);
});
