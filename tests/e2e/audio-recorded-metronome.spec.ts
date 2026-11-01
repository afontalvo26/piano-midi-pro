import { expect, test } from "@playwright/test";

test("el metrónomo live usa cowbell grabado y no deja dos relojes al tocar proyecto", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const source = await fetch("/src/audio/liveStudioEngine.ts").then((response) => response.text());
    const engine = new LiveStudioEngine();
    const started = await engine.setMetronome({ enabled: true, bpm: 123 });
    const graph = (engine as unknown as { graph: {
      metronome: { source: string; has(note: number): boolean;
        voiceSnapshot(): { byOwner: Array<{ ownerId: string }> } };
    } }).graph;
    const before = { source: graph.metronome.source, loaded: graph.metronome.has(56),
      timer: (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null,
      owners: graph.metronome.voiceSnapshot().byOwner.map((entry) => entry.ownerId) };
    const doc = createProjectDocument({ id: "metro-project", at: 1 });
    const playback = await engine.prepareProjectPlayback(doc, () => []);
    const afterPrepare = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null;
    const played = await engine.playProjectPlayback(0);
    const during = { liveTimer: (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null,
      liveActive: graph.metronome.voiceSnapshot().active,
      projectOwners: ((playback!.sink as unknown as {
        metronomeDrums: { voiceSnapshot(): { byOwner: Array<{ ownerId: string }> } };
      }).metronomeDrums.voiceSnapshot()).byOwner.map((entry) => entry.ownerId) };
    engine.stopProjectPlayback();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterStop = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer !== null;
    engine.dispose();
    return { started, before, afterPrepare, played, during, afterStop,
      metalSynthInSource: source.includes("MetalSynth") };
  });
  expect(result.started).toBe(true);
  expect(result.before).toMatchObject({ source: "virtuosity-core", loaded: true, timer: true });
  expect(result.before.owners.some((owner) => owner.startsWith("metronome/live/epoch-"))).toBe(true);
  expect(result.afterPrepare).toBe(true);
  expect(result.played).toBe(true);
  expect(result.during.liveTimer).toBe(false);
  expect(result.during.liveActive).toBe(0);
  expect(result.during.projectOwners.some((owner) => owner.startsWith("metronome/metro-project/"))).toBe(true);
  expect(result.afterStop).toBe(true);
  expect(result.metalSynthInSource).toBe(false);
});

test("fallo de muestra del click queda visible y no activa síntesis sustituta", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.route("**/audio/virtuosity/core/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.samples.find((sample: { articulation: string }) => sample.articulation === "cowbell")
      .sha256 = "0".repeat(64);
    await route.fulfill({ response, json: manifest });
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { LiveStudioEngine } = await import("/src/audio/liveStudioEngine.ts");
    const engine = new LiveStudioEngine();
    const started = await engine.setMetronome({ enabled: true, bpm: 120 });
    const diagnostic = engine.diagnostics();
    const timer = (engine as unknown as { metronomeTimer: unknown }).metronomeTimer;
    engine.dispose();
    return { started, timer: timer !== null, error: diagnostic.error };
  });
  expect(result.started).toBe(false);
  expect(result.timer).toBe(false);
  expect(result.error).toContain("click grabado");
  expect(result.error).toContain("SHA-256 mismatch");
});

test("la muestra de metrónomo verificada produce PCM finito en render offline", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { fetchVirtuosityManifest, decodeVirtuosityPiece } =
      await import("/src/audio/virtuosityCore.ts");
    const manifest = await fetchVirtuosityManifest();
    const context = new OfflineAudioContext(1, 48_000, 48_000);
    const layers = await decodeVirtuosityPiece(manifest, "cowbell", context);
    const sample = [...layers.values()][0]?.[0];
    if (!sample) throw new Error("Sin cowbell verificada");
    const source = context.createBufferSource();
    source.buffer = sample;
    const level = context.createGain();
    level.gain.value = 0.25;
    source.connect(level).connect(context.destination);
    source.start(0.01);
    const rendered = await context.startRendering();
    let peak = 0;
    let energy = 0;
    for (const value of rendered.getChannelData(0)) {
      if (!Number.isFinite(value)) return { peak: Infinity, energy: NaN };
      peak = Math.max(peak, Math.abs(value));
      energy += value * value;
    }
    return { peak, energy };
  });
  expect(result.peak).toBeGreaterThan(0.001);
  expect(result.peak).toBeLessThan(1);
  expect(result.energy).toBeGreaterThan(0);
});
