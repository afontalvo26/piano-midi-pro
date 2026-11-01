import { expect, test } from "@playwright/test";

test("post-fader send contributes to live-like offline WAV and one-track stem", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const frames = 12_000;
    const sampleRate = 48_000;
    const bytes = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(bytes);
    const ascii = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    ascii(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, "WAVE");
    ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, frames * 2, true);
    for (let frame = 0; frame < frames; frame++) {
      view.setInt16(44 + frame * 2, Math.round(Math.sin(frame * 0.052) * 3_000), true);
    }
    const analyzed = await analyzeUserSample(new Blob([bytes], { type: "audio/wav" }),
      "send-source", new OfflineAudioContext(1, 1, sampleRate));
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      effects: [], sends: [] };
    const source = { id: "source", name: "Fuente", kind: "audio" as const, mix };
    const bus = { id: "parallel", name: "Paralelo", kind: "bus" as const, mix };
    const clip = { id: "clip", trackId: source.id, kind: "audio" as const, startTick: 0,
      lengthTicks: 480, sourceOffsetTick: 0, loopMode: "none" as const,
      tailPolicy: "cut" as const, transpose: 0, gainDb: 0, muted: false,
      sourceId: analyzed.ref.id, sourceStartFrame: 0, sourceEndFrame: frames,
      fadeInFrames: 0, fadeOutFrames: 0 };
    const base = createProjectDocument({ id: "send-routing-regression", at: 1 });
    const dry = { ...base, tracks: [source, bus],
      trackOrder: [source.id, bus.id], assets: [analyzed.ref], clips: [clip] };
    const wet = { ...dry, tracks: [
      { ...source, mix: { ...mix,
        sends: [{ id: "send-parallel", busTrackId: bus.id, gainDb: 0 }] } }, bus] };
    const reader = { readAsset: async () => analyzed.data };
    const options = { startTick: 0, endTick: 480, sampleRate, tailSeconds: 0, seed: "send-e2e" };
    const dryPcm = await renderProjectPcm(dry, options, reader);
    const wetPcm = await renderProjectPcm(wet, options, reader);
    const stemPcm = await renderProjectPcm(wet, { ...options, trackId: source.id }, reader);
    const energy = (pcm: Float32Array): number => pcm.reduce((sum, sample) => sum + sample * sample, 0);
    const allFinite = (pcm: Float32Array): boolean => pcm.every(Number.isFinite);
    return {
      dryEnergy: energy(dryPcm.left), wetEnergy: energy(wetPcm.left),
      stemEnergy: energy(stemPcm.left),
      dryLength: dryPcm.left.length, wetLength: wetPcm.left.length,
      finite: allFinite(wetPcm.left) && allFinite(wetPcm.right),
      stemSources: stemPcm.report.selectedTrackIds,
    };
  });
  expect(result.dryEnergy).toBeGreaterThan(0.01);
  expect(result.wetEnergy).toBeGreaterThan(result.dryEnergy * 3);
  expect(result.stemEnergy).toBeCloseTo(result.wetEnergy, 3);
  expect(result.dryLength).toBe(12_000);
  expect(result.wetLength).toBe(12_000);
  expect(result.finite).toBe(true);
  expect(result.stemSources).toEqual(["source"]);
});

test("mobile mixer adds, edits and removes an acyclic send at 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Mezclador" }).click();
  const mixer = page.getByRole("region", { name: "Mezclador del proyecto" });
  await mixer.getByRole("textbox", { name: "Nombre del bus" }).fill("Auxiliar");
  await mixer.getByRole("button", { name: "Crear bus" }).click();
  const piano = mixer.getByRole("region", { name: "Canal Piano" });
  const sends = piano.locator(".project-mixer__sends");
  await expect(sends.getByRole("combobox", { name: "Nuevo envío de Piano" })).toBeVisible();
  await sends.getByRole("button", { name: "Añadir envío (−12 dB)" }).click();
  await expect(sends.getByRole("button", { name: "Quitar envío" })).toHaveCount(1);
  const level = sends.getByRole("spinbutton", { name: "Nivel (dB)" });
  await level.fill("-9");
  await level.blur();
  await expect(level).toHaveValue("-9");
  await mixer.getByRole("button", { name: "Deshacer" }).click();
  await expect(level).toHaveValue("-12");
  await mixer.getByRole("button", { name: "Rehacer" }).click();
  await expect(level).toHaveValue("-9");
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }))
    .toContainText("Guardado", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("button", { name: "Mezclador" }).click();
  const reopened = page.getByRole("region", { name: "Mezclador del proyecto" })
    .getByRole("region", { name: "Canal Piano" }).locator(".project-mixer__sends");
  await expect(reopened.getByRole("spinbutton", { name: "Nivel (dB)" })).toHaveValue("-9");
  await reopened.getByRole("button", { name: "Quitar envío" }).click();
  await expect(reopened.getByRole("button", { name: "Quitar envío" })).toHaveCount(0);
  await page.getByRole("region", { name: "Mezclador del proyecto" })
    .getByRole("button", { name: "Deshacer" }).click();
  await expect(reopened.getByRole("button", { name: "Quitar envío" })).toHaveCount(1);
});


test("routing graph rejects feedback, missing buses and unsafe send levels", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const checks = await page.evaluate(async () => {
    const { assertSafeAudioRouting } = await import("/src/project/mixRouting.ts");
    const mix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      effects: [], sends: [] };
    const source = { id: "source", kind: "audio" as const, name: "Source", mix };
    const bus = { id: "bus", kind: "bus" as const, name: "Bus", mix };
    const sound = { tracks: [source, bus] };
    const accepts = (doc: typeof sound): boolean => {
      try { assertSafeAudioRouting(doc); return true; } catch { return false; }
    };
    const send = (busTrackId: string, gainDb = -12) =>
      [{ id: "test-send", busTrackId, gainDb }];
    return {
      clean: accepts(sound),
      goodSend: accepts({ tracks: [{ ...source, mix: { ...mix,
        sends: send(bus.id) } }, bus] }),
      selfSend: accepts({ tracks: [source, { ...bus, mix: { ...mix,
        sends: send(bus.id) } }] }),
      missing: accepts({ tracks: [{ ...source, mix: { ...mix,
        sends: send("absent") } }, bus] }),
      cycle: accepts({ tracks: [{ ...source, mix: { ...mix,
        sends: send("bus") } }, { ...bus, mix: { ...mix,
        outputBusTrackId: "source" } }] }),
      dangerousLevel: accepts({ tracks: [{ ...source, mix: { ...mix,
        sends: send("bus", Number.POSITIVE_INFINITY) } }, bus] }),
    };
  });
  expect(checks).toEqual({ clean: true, goodSend: true, selfSend: false,
    missing: false, cycle: false, dangerousLevel: false });
});
