import { expect, test } from "@playwright/test";

test("Studio lanza escena grabada, detiene y vuelca actuación reversible al arreglo", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Arreglo" }).click();
  const arrangement = page.getByRole("region", { name: "Arreglo" });
  await arrangement.getByLabel("Nombre de escena").fill("Hook móvil");
  await arrangement.getByRole("button", { name: "Capturar clips del cabezal" }).click();
  await expect(arrangement.getByText("1 escenas", { exact: false })).toBeVisible();
  const initialClips = Number((await arrangement.locator(".arrangement__header p").textContent())?.match(/^(\d+)/)?.[1]);
  expect(initialClips).toBeGreaterThan(0);
  await arrangement.getByRole("button", { name: "Lanzar" }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible({ timeout: 20_000 });
  await expect(arrangement.getByText("Autoridad: Hook móvil")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => {
    const text = await page.getByRole("region", { name: "Proyecto de Beatmaker" }).textContent();
    return Number(text?.match(/tick (\d+)/)?.[1] ?? 0);
  }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Detener" }).click();
  await expect(arrangement.getByRole("button", { name: /Volcar actuación al arreglo/ })).toBeVisible();
  await arrangement.getByRole("button", { name: /Volcar actuación al arreglo/ }).click();
  await expect.poll(async () => Number((await arrangement.locator(".arrangement__header p").textContent())
    ?.match(/^(\d+)/)?.[1])).toBeGreaterThan(initialClips);
  await expect(arrangement.getByRole("button", { name: /Volcar actuación al arreglo/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" })).toContainText("Guardado", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
