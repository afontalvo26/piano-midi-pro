import { expect, test } from "@playwright/test";

interface SavedTake {
  offsetFrames: number;
  capturedOffsetFrames: number | null;
  clipStartUs: number;
  clipEndUs: number;
  frameCount: number;
  assetSha256: string;
}

async function readSavedTake(page: import("@playwright/test").Page): Promise<SavedTake> {
  return page.evaluate(async () => {
    const projectId = localStorage.getItem("pmp_active_project_id");
    if (!projectId) throw new Error("Proyecto activo ausente");
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repository = new ProjectRepository();
    try {
      const result = await repository.read(projectId);
      if (!result || result.status !== "ready") throw new Error("Proyecto no legible");
      const { document } = result.value;
      const take = document.takes.find((item) => item.kind === "audio" && item.audioCapture);
      const clip = document.clips.find((item) => item.kind === "audio" &&
        item.sourceTakeId === take?.id && item.timeMode === "absolute");
      const asset = document.assets.find((item) => item.id === take?.assetId);
      if (!take?.audioCapture || !clip || clip.kind !== "audio" || !asset) {
        throw new Error("Toma, clip absoluto o activo ausente");
      }
      const blob = await repository.readAsset(asset);
      if (!blob) throw new Error("WAV ausente");
      const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      return {
        offsetFrames: take.audioCapture.latencyOffsetFrames,
        capturedOffsetFrames: take.audioCapture.capturedLatencyOffsetFrames ?? null,
        clipStartUs: clip.absoluteStartUs!, clipEndUs: clip.absoluteEndUs!,
        frameCount: take.audioCapture.frameCount,
        assetSha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    } finally { await repository.close(); }
  });
}

test("corrige latencia en frames de una toma WAV sin alterar su audio y permite deshacer", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Grabar audio" }).click();
  const recorder = page.getByRole("region", { name: "Grabación de audio del proyecto" });
  await recorder.getByRole("button", { name: "Armar entrada" }).click();
  await expect(recorder).toContainText("Estado: armed");
  await recorder.getByRole("button", { name: "Iniciar toma" }).click();
  await expect(recorder).toContainText(/Frames: [1-9][0-9]*/);
  await recorder.getByRole("button", { name: "Detener y guardar" }).click();
  await expect(recorder).toContainText("Toma de audio guardada");
  const original = await readSavedTake(page);
  expect(original.offsetFrames).toBe(0);
  expect(original.frameCount).toBeGreaterThan(0);

  const correction = page.getByRole("region", { name: "Corrección de latencia de tomas de audio" });
  await expect(correction).toContainText("1 clip vinculado");
  await correction.getByRole("spinbutton", { name: "Corrección de latencia en frames" }).fill("-480");
  await correction.getByRole("button", { name: "Aplicar corrección" }).click();
  await expect(correction).toContainText("Corrección guardada");
  const shifted = await readSavedTake(page);
  expect(shifted.offsetFrames).toBe(-480);
  expect(shifted.capturedOffsetFrames).toBe(0);
  expect(shifted.clipStartUs - original.clipStartUs).toBe(10_000);
  expect(shifted.clipEndUs - original.clipEndUs).toBe(10_000);
  expect(shifted.frameCount).toBe(original.frameCount);
  expect(shifted.assetSha256).toBe(original.assetSha256);

  await correction.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(() => readSavedTake(page), { timeout: 20_000 })
    .toEqual(original);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
