import { expect, test } from "@playwright/test";

test("Studio crea arreglo y escena propia, deshace y recarga en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Arreglo", exact: true }).click();
  const arrangement = page.getByRole("region", { name: "Arreglo" });
  await expect(arrangement).toBeVisible();
  await expect(arrangement.locator(".arrangement__clip")).toHaveCount(2);

  await arrangement.getByLabel("Nombre de sección").fill("Intro");
  await arrangement.getByRole("button", { name: "+ Crear sección" }).click();
  await expect(arrangement.getByRole("button", { name: "Intro" })).toBeVisible();
  await arrangement.getByRole("button", { name: "Deshacer" }).click();
  await expect(arrangement.getByRole("button", { name: "Intro" })).toHaveCount(0);
  await arrangement.getByRole("button", { name: "Rehacer" }).click();
  await expect(arrangement.getByRole("button", { name: "Intro" })).toBeVisible();

  await arrangement.getByLabel("Nombre de escena").fill("Hook");
  await arrangement.getByRole("button", { name: "Capturar clips del cabezal" }).click();
  await expect(arrangement.getByText("Hook", { exact: true })).toBeVisible();
  await expect(arrangement.locator(".arrangement__save")).toHaveText("Guardado", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("button", { name: "Arreglo", exact: true }).click();
  await expect(arrangement.getByRole("button", { name: "Intro" })).toBeVisible();
  await expect(arrangement.getByText("Hook", { exact: true })).toBeVisible();
  await arrangement.locator(".arrangement__clip").first().click();
  await arrangement.getByRole("button", { name: "Editar patrón" }).click();
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();
});
