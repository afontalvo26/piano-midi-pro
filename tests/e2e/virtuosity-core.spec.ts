import { expect, test } from "@playwright/test";

test("Virtuosity core carga muestras locales verificadas, capas y RR sin fallback", async ({ page }) => {
  page.setDefaultTimeout(25_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const transformed = await fetch("/src/engine/DrumKitEngine.ts").then((response) => response.text());
    const toneUrl = transformed.match(/from "([^"]*\/tone\.js\?v=[^"]+)"/)?.[1];
    if (!toneUrl) throw new Error("No se encontró Tone");
    const Tone = await import(toneUrl);
    const { DrumKitEngine } = await import("/src/engine/DrumKitEngine.ts");
    await Tone.start();
    const destination = new Tone.Gain(0).toDestination();
    const drums = new DrumKitEngine(destination, { source: "virtuosity-core" });
    for (const note of [36, 38, 42, 46, 56]) await drums.load(note);
    const layers = [36, 38, 42, 46, 56].map((note) => ({
      note, count: (drums as unknown as { layeredVariants: Map<number, Map<number, AudioBuffer[]>> })
        .layeredVariants.get(note)?.size ?? 0,
      loaded: drums.has(note), error: drums.loadError(note),
    }));
    const at = Tone.immediate() + 0.02;
    const kick = drums.triggerOwned(36, 0.2, "transport/p/kick", 1, at);
    const snare = drums.triggerOwned(38, 0.8, "transport/p/snare", 1, at);
    const cowbell = drums.triggerOwned(56, 0.6, "transport/p/cowbell", 1, at);
    const active = drums.voiceSnapshot();
    const stopped = drums.releaseEpoch("transport/p", 1, at + 0.01, true);
    let missing = "";
    try { await drums.load(39); } catch (error) { missing = String(error); }
    const missingState = { has: drums.has(39), error: drums.loadError(39),
      triggered: drums.triggerOwned(39, 0.8, "transport/p/clap", 1, at) };
    drums.dispose();
    destination.dispose();
    return { source: drums.source, layers, loadedCount: drums.loadedCount(),
      handles: [Boolean(kick), Boolean(snare), Boolean(cowbell)], active, stopped,
      missing, missingState };
  });
  expect(result.source).toBe("virtuosity-core");
  expect(result.layers).toEqual([
    { note: 36, count: 4, loaded: true, error: null },
    { note: 38, count: 8, loaded: true, error: null },
    { note: 42, count: 4, loaded: true, error: null },
    { note: 46, count: 4, loaded: true, error: null },
    { note: 56, count: 3, loaded: true, error: null },
  ]);
  expect(result.handles).toEqual([true, true, true]);
  expect(result.active).toMatchObject({ active: 3 });
  expect(result.stopped).toBe(3);
  expect(result.missing).toContain("no incluye la nota GM 39");
  expect(result.missingState).toMatchObject({ has: false, triggered: null });
});

test("hash alterado bloquea el kit y expone error sin cambiar de fuente", async ({ page }) => {
  await page.route("**/audio/virtuosity/core/manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.samples.find((sample: { articulation: string }) => sample.articulation === "kick").sha256 = "0".repeat(64);
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
    const drums = new DrumKitEngine(destination, { source: "virtuosity-core" });
    let message = "";
    try { await drums.load(36); } catch (error) { message = String(error); }
    const result = { message, error: drums.loadError(36), has: drums.has(36),
      handle: drums.triggerOwned(36, 0.8, "transport/p", 1) };
    drums.dispose();
    destination.dispose();
    return result;
  });
  expect(result.message).toContain("SHA-256 mismatch");
  expect(result.error).toContain("SHA-256 mismatch");
  expect(result.has).toBe(false);
  expect(result.handle).toBeNull();
});
