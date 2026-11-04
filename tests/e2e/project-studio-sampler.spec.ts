import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("una muestra grabada se instala, edita como pista y persiste en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Sampler" }).click();
  const sampler = page.getByRole("region", { name: "Sampler de muestras propias" });
  await sampler.getByLabel("Elegir muestra propia").setInputFiles(resolve(
    "app/public/audio/freepats-handclap/core/01_02.ogg"));
  await expect(page.getByRole("status").filter({ hasText: "SHA-256 verificado" })).toBeVisible();
  await sampler.getByRole("spinbutton", { name: "Nota raíz de muestra" }).fill("64");
  await sampler.getByRole("checkbox", { name: "Reversa" }).check();
  await sampler.getByRole("button", { name: "Añadir pista de muestra" }).click();

  const roll = page.getByRole("region", { name: "Piano roll" });
  await expect(roll).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Pista del piano roll" })).toHaveValue(/.+/);
  await expect(page.getByRole("combobox", { name: "Pista del piano roll" })).toContainText("01_02");
  await roll.getByRole("button", { name: "Dibujar" }).click();
  const canvas = roll.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 105, box!.y + 120);
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");
  await expect(roll.locator(".piano-roll__save")).toHaveText("Guardado", { timeout: 20_000 });
  await page.getByRole("button", { name: "Sampler" }).click();
  await sampler.getByRole("button", { name: "Editar región" }).click();
  await expect(sampler.getByRole("spinbutton", { name: "Nota raíz de muestra" })).toHaveValue("64");
  await sampler.getByRole("spinbutton", { name: "Nota raíz de muestra" }).fill("65");
  await sampler.getByRole("button", { name: "Guardar región" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Región guardada" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("combobox", { name: "Pista del piano roll" }).selectOption({ label: "01_02" });
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");
  await page.getByRole("button", { name: "Sampler" }).click();
  await sampler.getByRole("button", { name: "Editar región" }).click();
  await expect(sampler.getByRole("spinbutton", { name: "Nota raíz de muestra" })).toHaveValue("65");
});
