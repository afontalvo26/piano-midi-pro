import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("Studio exporta el arreglo editado como SMF tipo 1 a 960 PPQ", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  const roll = page.getByRole("region", { name: "Piano roll" });
  await roll.getByRole("button", { name: "Dibujar" }).click();
  const canvas = roll.locator("canvas").first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 105, box!.y + 120);
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar MIDI" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.mid$/);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
  expect(bytes.readUInt16BE(8)).toBe(1);
  expect(bytes.readUInt16BE(12)).toBe(960);
  await expect(page.getByRole("status").filter({ hasText: "SMF tipo 1: 1 notas" })).toBeVisible();
});
