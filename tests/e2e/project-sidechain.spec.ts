import { expect, test } from "@playwright/test";

test("MIX-04 sidechain usa detector de audio y mantiene el key fuera del stem destino", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const result = await page.evaluate(async () => {
    const { analyzeUserSample } = await import("/src/audio/userSampleAsset.ts");
    const { renderProjectPcm } = await import("/src/audio/renderProjectPcm.ts");
    const { createProjectDocument } = await import("/src/project/model.ts");
    const { validateProjectDocument } = await import("/src/project/validate.ts");
    const rate = 48_000;
    const frames = 24_000;
    const wav = (sample: (frame: number) => number) => {
      const bytes = new ArrayBuffer(44 + frames * 2);
      const view = new DataView(bytes);
      const ascii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
      };
      ascii(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, "WAVE");
      ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
      view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, frames * 2, true);
      for (let frame = 0; frame < frames; frame++) {
        const value = Math.max(-1, Math.min(1, sample(frame)));
        view.setInt16(44 + frame * 2, Math.round(value * 32767), true);
      }
      return new Blob([bytes], { type: "audio/wav" });
    };
    const context = new OfflineAudioContext(1, 1, rate);
    const [kick, bass] = await Promise.all([
      analyzeUserSample(wav((frame) => frame < 3_000
        ? Math.sin(frame * 0.18) * (1 - frame / 3_000) * 0.92 : 0),
      "mix04-kick", context),
      analyzeUserSample(wav((frame) => Math.sin(frame * 0.025) * 0.22),
      "mix04-bass", context),
    ]);
    const baseMix = { gainDb: 0, pan: 0, mute: false, solo: false, armed: false,
      sends: [], effects: [] };
    const kickTrack = { id: "kick", name: "Kick", kind: "audio" as const, mix: baseMix };
    const bassTrack = { id: "bass", name: "808", kind: "audio" as const,
      mix: { ...baseMix, sidechain: { sourceTrackId: "kick", thresholdDb: -30,
        ratio: 10, attackMs: 1, releaseMs: 120, lookaheadMs: 5, maxReductionDb: 18 } } };
    const clip = (id: string, trackId: string, sourceId: string) => ({
      id, trackId, kind: "audio" as const, sourceId, startTick: 0, lengthTicks: 960,
      sourceOffsetTick: 0, sourceStartFrame: 0, sourceEndFrame: frames,
      fadeInFrames: 0, fadeOutFrames: 0, gainDb: 0, muted: false, transpose: 0,
      loopMode: "none" as const, tailPolicy: "cut" as const,
    });
    const base = createProjectDocument({ id: "mix04-sidechain", at: 1 });
    const wet = { ...base, tracks: [kickTrack, bassTrack], trackOrder: ["kick", "bass"],
      assets: [kick.ref, bass.ref], clips: [
        clip("kick-clip", "kick", kick.ref.id), clip("bass-clip", "bass", bass.ref.id)] };
    validateProjectDocument(wet);
    const dry = { ...wet, tracks: [kickTrack, { ...bassTrack, mix: baseMix }] };
    const reader = { readAsset: async (ref: { id: string }) =>
      ref.id === kick.ref.id ? kick.data : ref.id === bass.ref.id ? bass.data : null };
    const options = { startTick: 0, endTick: 960, sampleRate: rate, tailSeconds: 0,
      trackId: "bass", seed: "mix04" } as const;
    const [dryPcm, wetPcm] = await Promise.all([
      renderProjectPcm(dry, options, reader), renderProjectPcm(wet, options, reader)]);
    const energy = (samples: Float32Array) => samples.reduce((sum, value) => sum + value * value, 0);
    let selfRejected = false;
    try {
      validateProjectDocument({ ...wet, tracks: [kickTrack, { ...bassTrack,
        mix: { ...bassTrack.mix, sidechain: { ...bassTrack.mix.sidechain,
          sourceTrackId: "bass" } } }] });
    } catch { selfRejected = true; }
    return { dry: energy(dryPcm.left), wet: energy(wetPcm.left),
      selected: wetPcm.report.selectedTrackIds,
      lookaheadMs: wetPcm.report.audio.tracks.find((track) => track.trackId === "bass")
        ?.sidechainLookaheadMs ?? -1,
      finite: wetPcm.left.every(Number.isFinite) && wetPcm.right.every(Number.isFinite),
      selfRejected };
  });
  expect(result.dry).toBeGreaterThan(0.01);
  expect(result.wet).toBeGreaterThan(0.001);
  expect(result.wet).toBeLessThan(result.dry * 0.94);
  expect(result.selected).toEqual(["bass"]);
  expect(result.lookaheadMs).toBe(5);
  expect(result.finite).toBe(true);
  expect(result.selfRejected).toBe(true);
});

test("mezclador móvil configura sidechain y conserva parámetros", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const studio = page.getByTestId("reference-studio");
  await studio.getByRole("button", { name: "Crear un proyecto" }).click();
  await studio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Mezclador", exact: true }).click();
  const mixer = page.getByRole("region", { name: "Mezclador del proyecto" });
  const piano = mixer.getByRole("region", { name: "Canal Piano" });
  const sidechain = piano.getByRole("region", { name: "Sidechain de Piano" });
  await sidechain.getByRole("button", { name: "Activar" }).click();
  await expect(sidechain.getByRole("button", { name: "Activo" })).toBeVisible();
  await sidechain.getByRole("spinbutton", { name: "Umbral sidechain de Piano" }).fill("-32");
  await sidechain.getByRole("spinbutton", { name: "Ratio sidechain de Piano" }).fill("6");
  await sidechain.getByRole("spinbutton", { name: "Lookahead sidechain de Piano" }).fill("7.5");
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }))
    .toContainText("Guardado", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.locator(".ref-project-select").click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByTestId("reference-studio")
    .getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Mezclador", exact: true }).click();
  const reopened = page.getByRole("region", { name: "Mezclador del proyecto" })
    .getByRole("region", { name: "Sidechain de Piano" });
  await expect(reopened.getByRole("spinbutton", { name: "Umbral sidechain de Piano" })).toHaveValue("-32");
  await expect(reopened.getByRole("spinbutton", { name: "Ratio sidechain de Piano" })).toHaveValue("6");
  await expect(reopened.getByRole("spinbutton", { name: "Lookahead sidechain de Piano" })).toHaveValue("7.5");
});
