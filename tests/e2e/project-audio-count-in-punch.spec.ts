import { expect, test } from "@playwright/test";

test("cuenta cancelada no crea toma y punch guarda sólo los frames del compás", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Grabar audio" }).click();
  const panel = page.getByRole("region", { name: "Grabación de audio del proyecto" });

  await panel.getByRole("button", { name: "Armar entrada" }).click();
  await expect(panel).toContainText("Estado: armed");
  await panel.getByLabel("Cuenta de entrada").selectOption("1");
  await panel.getByRole("button", { name: "Iniciar toma" }).click();
  await expect(panel).toContainText("Estado: starting");
  await panel.getByRole("button", { name: "Cancelar cuenta" }).click();
  await expect(panel).toContainText("Cuenta cancelada antes de capturar audio");
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }))
    .toContainText("Transporte: stopped");

  await panel.getByRole("button", { name: "Armar entrada" }).click();
  await expect(panel).toContainText("Estado: armed");
  await panel.getByLabel("Cuenta de entrada").selectOption("1");
  await panel.getByLabel("Salida automática").check();
  await panel.getByRole("spinbutton", { name: "Duración de punch (compases)" }).fill("1");
  await panel.getByRole("button", { name: "Iniciar toma" }).click();
  await expect(panel).toContainText("Estado: starting");
  await expect(panel).toContainText("Estado: stopping", { timeout: 12_000 });
  await expect(panel).toContainText("Toma de audio guardada", { timeout: 12_000 });

  const saved = await page.evaluate(async () => {
    const id = localStorage.getItem("pmp_active_project_id");
    if (!id) throw new Error("Proyecto activo ausente");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository();
    const result = await repository.read(id);
    if (!result || result.status !== "ready") throw new Error("Proyecto no legible");
    const document = result.value.document;
    const takes = document.takes.filter((take) => take.kind === "audio");
    const clips = document.clips.filter((clip) => clip.kind === "audio");
    const capture = takes[0]?.audioCapture;
    const asset = document.assets.find((entry) => entry.id === takes[0]?.assetId);
    await repository.close();
    return { takeCount: takes.length, clipCount: clips.length,
      punch: capture?.punch, frames: capture?.frameCount ?? 0,
      sampleRate: capture?.sampleRate ?? 0, startUs: capture?.startProjectUs,
      clipStartUs: clips[0]?.kind === "audio" ? clips[0].absoluteStartUs : undefined,
      assetFrames: asset?.frameCount ?? 0 };
  });
  expect(saved.takeCount).toBe(1);
  expect(saved.clipCount).toBe(1);
  expect(saved.punch?.endTick).toBe(3840);
  expect(saved.punch?.startTick).toBeGreaterThanOrEqual(0);
  expect(saved.punch!.endAudioTime).toBeGreaterThan(saved.punch!.startAudioTime);
  expect(saved.frames).toBe(saved.assetFrames);
  expect(saved.frames).toBeGreaterThan(saved.sampleRate * 1.7);
  expect(saved.frames).toBeLessThan(saved.sampleRate * 2.15);
  expect(saved.startUs).toBe(saved.clipStartUs);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
