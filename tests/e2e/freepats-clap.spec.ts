import { expect, test } from "@playwright/test";

test("FreePats clap opcional verifica nueve grabaciones y GM39 sin cambiar Virtuosity", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/engine/DrumKitEngine.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { DrumKitEngine } = await import("/src/engine/DrumKitEngine.ts");
    const { PROJECT_CLAP_INSTRUMENT, PROJECT_DRUM_INSTRUMENT } =
      await import("/src/audio/projectAudioSink.ts");
    const { FREEPATS_HANDCLAP_VERSION, fetchFreePatsHandClapManifest } =
      await import("/src/audio/freePatsHandClap.ts");
    await Tone.start();
    const manifest = await fetchFreePatsHandClapManifest();
    const destination = new Tone.Gain(0).toDestination();
    const clap = new DrumKitEngine(destination, { source: "freepats-clap" });
    await clap.load(39);
    const at = Tone.immediate() + 0.1;
    const handle = clap.triggerOwned(39, 0.8, "transport/qa/clip/clap", 3, at);
    const active = clap.voiceSnapshot().active;
    const stopped = clap.releaseEpoch("transport/qa", 3, Tone.immediate(), true);
    let unknown = "";
    try { await clap.load(36); } catch (error) { unknown = String(error); }
    clap.dispose();
    destination.dispose();
    return { manifest, source: clap.source, version: FREEPATS_HANDCLAP_VERSION,
      clapRef: PROJECT_CLAP_INSTRUMENT, drumRef: PROJECT_DRUM_INSTRUMENT,
      loaded: clap.loadedCount(), handle: Boolean(handle), active, stopped, unknown };
  });
  expect(result.manifest).toMatchObject({ packId: "freepats-handclap", license: "CC0-1.0",
    sourceMidiNote: 59, projectGmNote: 39, version: result.version });
  expect(result.manifest.samples).toHaveLength(9);
  expect(result.source).toBe("freepats-clap");
  expect(result.clapRef).toMatchObject({ instrumentId: "freepats-handclap",
    packageVersion: result.version, presetId: "core" });
  expect(result.drumRef.instrumentId).toBe("virtuosity-core");
  expect(result.drumRef.packageVersion).not.toBe(result.version);
  expect(result.handle).toBe(true);
  expect(result.active).toBe(1);
  expect(result.stopped).toBe(1);
  expect(result.unknown).toContain("sólo incluye nota GM 39");
});

test("clap con hash incorrecto falla de forma visible y no usa kit GM", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route("**/audio/freepats-handclap/core/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.samples[0].sha256 = "0".repeat(64);
    await route.fulfill({ response, json: manifest });
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/engine/DrumKitEngine.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { DrumKitEngine } = await import("/src/engine/DrumKitEngine.ts");
    await Tone.start();
    const destination = new Tone.Gain(0).toDestination();
    const clap = new DrumKitEngine(destination, { source: "freepats-clap" });
    let message = "";
    try { await clap.load(39); } catch (error) { message = String(error); }
    const error = clap.loadError(39);
    const has = clap.has(39);
    const handle = clap.triggerOwned(39, 0.8, "transport/qa", 1);
    clap.dispose();
    destination.dispose();
    return { message, error, has, handle };
  });
  expect(result.message).toContain("SHA-256 mismatch");
  expect(result.error).toContain("SHA-256 mismatch");
  expect(result.has).toBe(false);
  expect(result.handle).toBeNull();
});

test("pista clap opt-in muestra procedencia y no modifica los cinco pads core", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/audio/projectAudioSink.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { ProjectAudioSink, PROJECT_CLAP_INSTRUMENT, PROJECT_DRUM_INSTRUMENT } =
      await import("/src/audio/projectAudioSink.ts");
    const { DecodedPianoSampleBank } = await import("/src/audio/toneSampleVoiceFactory.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    await Tone.start();
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const document = { ...createProjectDocument({ id: "clap-opt-in", at: 1 }),
      trackOrder: ["core", "clap"], tracks: [
        { id: "core", name: "Core", kind: "drum" as const, instrument: PROJECT_DRUM_INSTRUMENT, mix },
        { id: "clap", name: "Clap", kind: "drum" as const, instrument: PROJECT_CLAP_INSTRUMENT, mix },
      ] };
    const destination = new Tone.Gain(0).toDestination();
    const sink = new ProjectAudioSink(document, destination, new DecodedPianoSampleBank(), () => true);
    const diagnostics = await sink.prepare();
    const corePads = sink.padStatus("core");
    const clapPads = sink.padStatus("clap");
    const preview = sink.previewPad("clap", 39, 0.8, "preview/clap-opt-in");
    sink.releasePreview("preview/clap-opt-in");
    sink.dispose();
    destination.dispose();
    return { diagnostics, corePads, clapPads, preview: Boolean(preview) };
  });
  expect(result.diagnostics.tracks.map((track) => track.status)).toEqual(["ready", "ready"]);
  expect(result.corePads.map((pad) => pad.note)).toEqual([36, 38, 42, 46, 56]);
  expect(result.clapPads).toEqual([{ note: 39, label: "Clap", assetStatus: "ready",
    sourceLabel: "FreePats World Percussion · Roberto · CC0", error: null }]);
  expect(result.preview).toBe(true);
});
