import { expect, test } from "@playwright/test";

test("piano de proyecto usa las siete muestras locales verificadas", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { PROJECT_PIANO_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-verified-piano", at: 1 }),
      trackOrder: ["piano"], tracks: [{ id: "piano", name: "Piano",
        kind: "instrument" as const, instrument: PROJECT_PIANO_INSTRUMENT, mix }] };
    const engine = new LiveStudioEngine();
    const playback = await engine.prepareProjectPlayback(document, () => []);
    const projectBank = (playback?.sink as unknown as { pianoBank?: {
      pitches(): number[];
    } } | undefined)?.pianoBank;
    const liveBank = (engine as unknown as { bank: object }).bank;
    const status = engine.projectPlaybackSnapshot()?.audio.tracks[0];
    const result = { prepared: Boolean(playback), status: status?.status,
      sources: projectBank?.pitches(), independentBank: projectBank !== liveBank,
      version: PROJECT_PIANO_INSTRUMENT.packageVersion };
    engine.dispose();
    return result;
  });
  expect(result.prepared).toBe(true);
  expect(result.status).toBe("ready");
  expect(result.sources).toEqual([48, 54, 60, 66, 72, 78, 84]);
  expect(result.independentBank).toBe(true);
  expect(result.version).toBe("sha256:3554c3717e4a7f6cb343fd7c14cd515f22f735be20f67b5d75f2d93fe452ba10");
});

test("manifiesto alterado bloquea el proyecto y muestra el fallo", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route("**/audio/salamander/core/manifest.json", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { PROJECT_PIANO_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-corrupt-piano", at: 1 }),
      trackOrder: ["piano"], tracks: [{ id: "piano", name: "Piano",
        kind: "instrument" as const, instrument: PROJECT_PIANO_INSTRUMENT, mix }] };
    const engine = new LiveStudioEngine();
    const playback = await engine.prepareProjectPlayback(document, () => []);
    const result = { prepared: Boolean(playback), error: engine.diagnostics().error };
    engine.dispose();
    return result;
  });
  expect(result.prepared).toBe(false);
  expect(result.error).toContain("versión/hash del manifiesto");
});

test("WAV usa el mismo piano verificado", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { PROJECT_PIANO_INSTRUMENT } = await import("/src/audio/projectAudioSink.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts?qa=verified-piano");
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "qa-render-piano", at: 1 }),
      trackOrder: ["piano"], tracks: [{ id: "piano", name: "Piano",
        kind: "instrument" as const, instrument: PROJECT_PIANO_INSTRUMENT, mix }],
      patterns: [{ id: "pattern", name: "Una nota", version: 1, lengthTicks: 960,
        notes: [{ id: "n", startTick: 0, durationTick: 480, pitch: 60,
          velocity: 100, releaseVelocity: 64, channel: 0,
          origin: { kind: "drawn" as const } }], expression: [] }],
      clips: [{ id: "clip", trackId: "piano", kind: "pattern" as const,
        sourceId: "pattern", sourceVersion: 1, startTick: 0, lengthTicks: 960,
        sourceOffsetTick: 0, loopMode: "none" as const, tailPolicy: "cut" as const,
        transpose: 0, gainDb: 0, muted: false }] };
    const pcm = await renderProjectPcm(document,
      { startTick: 0, endTick: 960, sampleRate: 48_000, tailSeconds: 0 },
      { readAsset: async () => null });
    return { frames: pcm.left.length, peak: Math.max(...pcm.left.slice(0, 1024)),
      pianoSources: pcm.report.audio.projectPianoSources,
      skipped: pcm.report.transport.skippedNotes };
  });
  expect(result.frames).toBe(24_000);
  expect(result.peak).toBeGreaterThan(0);
  expect(result.skipped).toBe(0);
});

test("OGG de piano alterado no entra al banco del proyecto", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route("**/audio/salamander/core/C4.ogg", async (route) => {
    await route.fulfill({ status: 200, contentType: "audio/ogg", body: "OggS-corrupt" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const failure = await page.evaluate(async () => {
    const { loadVerifiedSalamanderCore } = await import("/src/audio/verifiedSalamanderCore.ts");
    try {
      await loadVerifiedSalamanderCore(new OfflineAudioContext(1, 1, 48_000));
      return "";
    } catch (error) {
      return String(error);
    }
  });
  expect(failure).toContain("C4.ogg: OGG, tamaño o SHA-256 inválido");
});
