import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Studio reabre proyecto con muestra perdida y relocaliza sólo bytes idénticos", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Sampler" }).click();
  const original = resolve("app/public/audio/freepats-handclap/core/01_02.ogg");
  const wrong = resolve("app/public/audio/freepats-handclap/core/01_03.ogg");
  await page.getByRole("region", { name: "Sampler de muestras propias" })
    .getByLabel("Elegir muestra propia").setInputFiles(original);
  await page.getByRole("button", { name: "Añadir pista de muestra" }).click();
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" })).toContainText("Guardado", { timeout: 20_000 });
  const before = await page.evaluate(async () => {
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const projectId = localStorage.getItem("pmp_active_project_id")!;
    const repo = new ProjectRepository();
    const result = await repo.read(projectId);
    if (!result || result.status !== "ready") throw new Error("Proyecto no disponible");
    const asset = result.value.document.assets[0];
    if (!asset) throw new Error("Muestra no instalada");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("piano-midi-pro-project-assets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").delete(asset.sha256);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    await repo.close();
    return { projectId, assetId: asset.id, revision: result.value.revision, hash: result.value.hash };
  });
  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  const repair = page.getByRole("region", { name: "Reparar muestras del proyecto" });
  await expect(repair).toContainText("Archivo faltante", { timeout: 20_000 });
  const fileInput = repair.getByLabel(`Archivo original para Activo ${before.assetId.slice(0, 8)}`);
  await fileInput.setInputFiles(wrong);
  await expect(repair).toContainText(/tamaño|hash SHA-256/i);
  await fileInput.setInputFiles(original);
  await expect(repair).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" })).toContainText("Muestra restaurada con SHA-256 idéntico");
  const after = await page.evaluate(async (projectId) => {
    const { ProjectRepository } = await import("/src/project/repository.ts");
    const repo = new ProjectRepository();
    const result = await repo.read(projectId);
    await repo.close();
    if (!result || result.status !== "ready") throw new Error("Proyecto no disponible tras reparación");
    return { revision: result.value.revision, hash: result.value.hash };
  }, before.projectId);
  expect(after).toEqual({ revision: before.revision, hash: before.hash });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
