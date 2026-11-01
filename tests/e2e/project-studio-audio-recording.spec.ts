import { expect, test } from "@playwright/test";

test("Studio graba WAV en un clip propio, lo reabre y lo reproduce a 320 px", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Grabar audio" }).click();
  const panel = page.getByRole("region", { name: "Grabación de audio del proyecto" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Armar entrada" }).click();
  await expect(panel).toContainText("Estado: armed", { timeout: 20_000 });
  await expect(panel).toContainText("El monitor está apagado");
  await panel.getByRole("button", { name: "Iniciar toma" }).click();
  await expect(panel).toContainText("Estado: recording", { timeout: 20_000 });
  await expect(page.getByRole("spinbutton", { name: "Tempo inicial del proyecto" })).toBeDisabled();
  await expect(panel).toContainText(/Frames: [1-9][0-9]*/, { timeout: 20_000 });
  await panel.getByRole("button", { name: "Detener y guardar" }).click();
  await expect(panel).toContainText("Toma de audio guardada", { timeout: 20_000 });
  await expect(page.getByRole("spinbutton", { name: "Tempo inicial del proyecto" })).toBeEnabled();

  const saved = await page.evaluate(async () => {
    const id = localStorage.getItem("pmp_active_project_id");
    if (!id) throw new Error("Proyecto activo ausente");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository();
    const result = await repository.read(id);
    if (!result || result.status !== "ready") throw new Error("Proyecto no legible");
    const { document } = result.value;
    const asset = document.assets.find((entry) => entry.sourceKind === "recorded");
    const clip = document.clips.find((entry) => entry.kind === "audio");
    const take = document.takes.find((entry) => entry.kind === "audio");
    const bytes = asset ? await repository.readAsset(asset) : null;
    await repository.close();
    return { audioTracks: document.tracks.filter((track) => track.kind === "audio").length,
      audioClips: document.clips.filter((clip) => clip.kind === "audio").length,
      audioTakes: document.takes.filter((take) => take.kind === "audio").length,
      clipMode: clip?.kind === "audio" ? clip.timeMode : null,
      sourceTakeLinked: clip?.kind === "audio" && clip.sourceTakeId === take?.id,
      anchorUs: take?.audioCapture?.startProjectUs,
      clipStartUs: clip?.kind === "audio" ? clip.absoluteStartUs : null,
      frames: asset?.frameCount ?? 0, bytes: bytes?.size ?? 0 };
  });
  expect(saved.audioTracks).toBe(1);
  expect(saved.audioClips).toBe(1);
  expect(saved.audioTakes).toBe(1);
  expect(saved.clipMode).toBe("absolute");
  expect(saved.sourceTakeLinked).toBe(true);
  expect(saved.anchorUs).toBe(saved.clipStartUs);
  expect(saved.frames).toBeGreaterThan(0);
  expect(saved.bytes).toBeGreaterThan(44);
  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("button", { name: "Grabar audio" }).click();
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Detener" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("grabación durante transporte conserva el inicio preciso del mismo AudioContext", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }))
    .toContainText(/tick [1-9][0-9]*/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Grabar audio" }).click();
  const panel = page.getByRole("region", { name: "Grabación de audio del proyecto" });
  await panel.getByRole("button", { name: "Armar entrada" }).click();
  await expect(panel).toContainText("Estado: armed", { timeout: 20_000 });
  await panel.getByRole("button", { name: "Iniciar toma" }).click();
  await expect(panel).toContainText(/Frames: [1-9][0-9]*/, { timeout: 20_000 });
  await panel.getByRole("button", { name: "Detener y guardar" }).click();
  await expect(panel).toContainText("Toma de audio guardada", { timeout: 20_000 });

  const placement = await page.evaluate(async () => {
    const id = localStorage.getItem("pmp_active_project_id")!;
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository();
    const result = await repository.read(id);
    if (!result || result.status !== "ready") throw new Error("Proyecto no legible");
    const clip = result.value.document.clips.find((entry) => entry.kind === "audio");
    const take = result.value.document.takes.find((entry) => entry.kind === "audio");
    await repository.close();
    return { clipStart: clip?.startTick ?? -1,
      clipMode: clip?.kind === "audio" ? clip.timeMode : null,
      clipStartUs: clip?.kind === "audio" ? clip.absoluteStartUs : null,
      takeStartUs: take?.audioCapture?.startProjectUs,
      takeStart: take?.audioCapture?.startTick ?? -1,
      frames: take?.audioCapture?.frameCount ?? 0 };
  });
  expect(placement.clipStart).toBeGreaterThan(0);
  expect(placement.takeStart).toBe(placement.clipStart);
  expect(placement.clipMode).toBe("absolute");
  expect(placement.clipStartUs).toBe(placement.takeStartUs);
  expect(placement.frames).toBeGreaterThan(0);
});

test("cambiar proyecto cierra y guarda la toma activa antes del cambio", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pmp_active_project_id")))
    .not.toBeNull();
  const firstId = await page.evaluate(() => localStorage.getItem("pmp_active_project_id"));
  await page.getByRole("button", { name: "Grabar audio" }).click();
  const panel = page.getByRole("region", { name: "Grabación de audio del proyecto" });
  await panel.getByRole("button", { name: "Armar entrada" }).click();
  await expect(panel).toContainText("Estado: armed", { timeout: 20_000 });
  await panel.getByRole("button", { name: "Iniciar toma" }).click();
  await expect(panel).toContainText(/Frames: [1-9][0-9]*/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pmp_active_project_id")))
    .not.toBe(firstId);
  const oldProject = await page.evaluate(async (id) => {
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository();
    const result = await repository.read(id!);
    if (!result || result.status !== "ready") throw new Error("Proyecto anterior no legible");
    const { document } = result.value;
    await repository.close();
    return { audioClips: document.clips.filter((clip) => clip.kind === "audio").length,
      audioTakes: document.takes.filter((take) => take.kind === "audio").length };
  }, firstId);
  expect(oldProject).toEqual({ audioClips: 1, audioTakes: 1 });
});
