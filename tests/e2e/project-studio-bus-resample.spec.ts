import { expect, test } from "@playwright/test";

test("Studio resamplea un bus a WAV propio desde móvil y lo instala en destino", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const studio = page.getByTestId("reference-studio");
  await studio.getByRole("button", { name: "Crear un proyecto" }).click();
  await expect(studio.locator(".ref-track-row").first()).toBeVisible({ timeout: 20_000 });
  await studio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Piano roll", exact: true }).click();
  const roll = page.getByRole("region", { name: "Piano roll" });
  await roll.getByRole("button", { name: "Dibujar notas" }).click();
  const canvas = roll.locator(".piano-roll__canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 105, box!.y + 120);
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");

  await page.getByRole("button", { name: "Mezclador", exact: true }).click();
  const mixer = page.getByRole("region", { name: "Mezclador del proyecto" });
  await mixer.getByRole("textbox", { name: "Nombre del bus" }).fill("Bus resample QA");
  await mixer.getByRole("button", { name: "Crear bus" }).click();
  await mixer.getByRole("region", { name: "Canal Piano" })
    .getByRole("combobox", { name: "Salida" }).selectOption({ label: "Bus resample QA" });

  await page.getByRole("button", { name: "Grabar audio" }).click();
  const panel = page.getByRole("region", { name: "Resampling de bus" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Crear pista destino" }).click();
  await expect(panel.getByRole("combobox", { name: "Pista destino del resampling" }))
    .toHaveValue(/.+/);
  await panel.getByRole("spinbutton", { name: "Tick final del resampling" }).fill("960");
  await panel.getByRole("button", { name: "Renderizar e instalar WAV" }).click();
  await expect(panel).toContainText(/WAV instalado: [\d.]+ frames/, { timeout: 20_000 });

  const saved = await page.evaluate(async () => {
    const id = localStorage.getItem("pmp_active_project_id");
    if (!id) throw new Error("Proyecto activo ausente");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository();
    const result = await repository.read(id);
    if (!result || result.status !== "ready") throw new Error("Proyecto no legible");
    const take = result.value.document.takes.find((entry) => entry.audioResample);
    const clip = result.value.document.clips.find((entry) => entry.kind === "audio" &&
      entry.sourceTakeId === take?.id);
    const asset = result.value.document.assets.find((entry) => entry.id === take?.assetId);
    const blob = asset ? await repository.readAsset(asset) : null;
    await repository.close();
    return { bus: take?.audioResample?.sourceBusTrackId,
      destination: take?.audioResample?.destinationTrackId,
      sources: take?.audioResample?.sourceTrackIds.length,
      tap: take?.audioResample?.tap, frames: asset?.frameCount,
      bytes: blob?.size, clipTrack: clip?.trackId, clipFrames: clip?.kind === "audio"
        ? [clip.sourceStartFrame, clip.sourceEndFrame] : [] };
  });
  expect(saved.bus).toBeTruthy();
  expect(saved.destination).toBeTruthy();
  expect(saved.sources).toBe(1);
  expect(saved.tap).toBe("post-bus-pre-master");
  expect(saved.frames).toBeGreaterThan(0);
  expect(saved.bytes).toBeGreaterThan(44);
  expect(saved.clipTrack).toBe(saved.destination);
  expect(saved.clipFrames).toEqual([0, saved.frames]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
