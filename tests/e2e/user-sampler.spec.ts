import { expect, test } from "@playwright/test";

test("sampler verifica audio propio, reproduce región y Stop cancela ataque futuro", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderUserSampleRegion } = await import("/src/audio/userSampleEngine.ts");
    const { ProjectAudioSink } = await import("/src/audio/projectAudioSink.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    await Tone.start();
    const context = Tone.getContext().rawContext;
    const frames = 4_800;
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
    for (let frame = 0; frame < frames; frame++) {
      view.setInt16(44 + frame * 2, Math.round(8_000 * Math.sin(frame * 0.05)), true);
    }
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/wav" }),
      "user-hit", context);
    const region = { startFrame: 100, endFrame: 2_000, fadeInFrames: 0,
      fadeOutFrames: 0, rootMidi: 60, cents: 0, reverse: true,
      loopMode: "none" as const, playMode: "oneShot" as const };
    const rendered = renderUserSampleRegion(analyzed.buffer, region, context);
    const originValue = analyzed.buffer.getChannelData(0)[1_999 - 80]!;
    const reversedValue = rendered.getChannelData(0)[80]!;
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-sampler", at: 1 }),
      assets: [analyzed.ref], trackOrder: ["sample"], tracks: [{ id: "sample", name: "Propio",
        kind: "instrument" as const,
        instrument: { instrumentId: "user-sampler", packageVersion: `sha256:${analyzed.ref.sha256}`,
          presetId: "asset:user-hit", sampleRegion: region }, mix }] };
    const destination = new Tone.Gain(0).toDestination();
    const sink = new ProjectAudioSink(document, destination, new DecodedPianoSampleBank(),
      () => true, { readAsset: async () => analyzed.data });
    const before = await sink.prepare();
    const at = Tone.immediate() + 0.25;
    const event = { kind: "note" as const, eventId: "hit", sourceKind: "arrangement",
      ownerPath: "track/sample/clip/c", ownerId: "transport/qa-sampler/track/sample/clip/c/epoch-1",
      trackId: "sample", clipId: "c", tick: 0, absoluteTick: 0,
      iteration: 0, epoch: 1, audioTime: at, sequence: 0, channel: 0,
      pitch: 60, playedPitch: 60, velocity: 100, releaseVelocity: 64,
      durationTicks: 960, tailPolicy: "cut" as const };
    const handle = sink.noteOn(event);
    const allocatedBeforeStop = sink.diagnostics().tracks[0]?.allocatedVoices;
    sink.cancelEpoch(sink.rootOwnerId, 1, Tone.immediate());
    const allocatedAfterStop = sink.diagnostics().tracks[0]?.allocatedVoices;
    const preview = sink.previewSample("sample", 60, 100, "preview/own-hit");
    const previewReleased = sink.releasePreview("preview/own-hit");
    sink.dispose();
    destination.dispose();
    return { before, renderedLength: rendered.length, originValue, reversedValue,
      hasHandle: Boolean(handle), allocatedBeforeStop, allocatedAfterStop,
      preview: Boolean(preview), previewReleased };
  });
  expect(result.before.tracks[0]).toMatchObject({ status: "ready", error: null });
  expect(result.before.samplePcmBytes).toBeGreaterThan(0);
  expect(result.renderedLength).toBe(1_900);
  expect(result.reversedValue).toBeCloseTo(result.originValue, 5);
  expect(result.hasHandle).toBe(true);
  expect(result.allocatedBeforeStop).toBe(1);
  expect(result.allocatedAfterStop).toBe(0);
  expect(result.preview).toBe(true);
  expect(result.previewReleased).toBe(1);
});

test("sampler no suena con bytes truncados o hash ajeno", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { loadVerifiedUserSample } = await import("/src/audio/userSampleAsset.ts");
    const context = new AudioContext();
    const base = { id: "bad", sha256: "0".repeat(64), byteLength: 44,
      mimeType: "audio/wav", sourceKind: "user" as const, license: "user-controlled" };
    let truncated = "";
    try {
      await loadVerifiedUserSample(base, { readAsset: async () => new Blob(["short"],
        { type: "audio/wav" }) }, context);
    } catch (error) { truncated = String(error); }
    let wrongHash = "";
    const wav = new Uint8Array(44 + 2);
    wav.set([82, 73, 70, 70, 38, 0, 0, 0, 87, 65, 86, 69,
      102, 109, 116, 32, 16, 0, 0, 0, 1, 0, 1, 0, 128, 187, 0, 0,
      0, 119, 1, 0, 2, 0, 16, 0, 100, 97, 116, 97, 2, 0, 0, 0]);
    try {
      await loadVerifiedUserSample({ ...base, byteLength: wav.length },
        { readAsset: async () => new Blob([wav], { type: "audio/wav" }) }, context);
    } catch (error) { wrongHash = String(error); }
    await context.close();
    return { truncated, wrongHash };
  });
  expect(result.truncated).toContain("tamaño");
  expect(result.wrongHash).toContain("hash");
});
