import { expect, test } from "@playwright/test";

test("proyecto real y piano roll sobreviven recarga en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  const roll = page.getByRole("region", { name: "Piano roll" });
  await expect(roll).toBeVisible();
  await expect(roll.locator(".piano-roll__facts")).toContainText("0 notas");

  await roll.getByRole("button", { name: "Dibujar" }).click();
  const canvas = roll.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 105, box!.y + 120);
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");

  await roll.getByRole("button", { name: /Inspector/ }).click();
  const pitchInput = roll.getByRole("spinbutton", { name: "Nota MIDI" });
  await expect(pitchInput).toBeVisible();
  await pitchInput.fill("60");
  await roll.getByRole("spinbutton", { name: "Velocidad", exact: true }).fill("112");
  await roll.getByRole("button", { name: "Aplicar valores" }).click();
  await expect(roll.getByRole("status").filter({ hasText: "velocidad 112" })).toBeVisible();
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect(roll.getByRole("status").filter({ hasText: "velocidad 96" })).toBeVisible();
  await roll.getByRole("button", { name: "Rehacer" }).click();
  await expect(roll.getByRole("status").filter({ hasText: "velocidad 112" })).toBeVisible();
  await expect(roll.locator(".piano-roll__save")).toHaveText("Guardado", { timeout: 20_000 });

  const noWholePageOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(noWholePageOverflow).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const projects = page.getByRole("region", { name: "Tus proyectos" });
  await expect(projects.getByText("Proyecto sin título")).toBeVisible();
  await projects.getByRole("button", { name: "Abrir en Studio" }).click();
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");
  await roll.getByRole("button", { name: "Nota siguiente" }).click();
  const inspector = roll.getByRole("button", { name: /Inspector/ });
  if (await inspector.getAttribute("aria-expanded") !== "true") await inspector.click();
  await expect(roll.getByRole("spinbutton", { name: "Nota MIDI" })).toHaveValue("60");
  await expect(roll.getByRole("spinbutton", { name: "Velocidad", exact: true })).toHaveValue("112");
});
