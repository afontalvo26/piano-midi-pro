import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("una toma MIDI propia entra al piano roll con undo, recarga y bytes originales intactos", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Interpretar" }).click();
  await page.getByRole("button", { name: "Grabar MIDI" }).click();
  await page.getByRole("region", { name: "Teclado desplazable de 37 teclas" }).focus();
  await page.keyboard.down("z");
  await page.waitForTimeout(80);
  await page.keyboard.up("z");
  await page.getByRole("button", { name: "Detener grabación" }).click();

  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const tracks = page.getByRole("region", { name: "Pistas de tus grabaciones MIDI" });
  await expect(tracks.getByRole("article")).toHaveCount(1, { timeout: 20_000 });
  const firstDownload = page.waitForEvent("download");
  await tracks.getByRole("button", { name: "Exportar .mid" }).click();
  const before = await readFile(await (await firstDownload).path());
  const sourceHash = createHash("sha256").update(before).digest("hex");

  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: "Piano roll", exact: true }).click();
  const roll = page.getByRole("region", { name: "Piano roll" });
  await expect(roll.locator(".piano-roll__facts")).toContainText("0 notas");
  const overdub = page.getByRole("region", { name: "Agregar toma al patrón" });
  await expect(overdub).toContainText("1 toma");
  await expect(overdub.getByRole("spinbutton", { name: "Inicio del overdub · tick" })).toHaveValue("0");
  await overdub.getByRole("button", { name: "Previsualizar destino" }).click();
  await expect(overdub).toContainText("1 notas");
  await overdub.getByRole("button", { name: "Confirmar toma en patrón" }).click();
  await expect(overdub.getByRole("status").filter({ hasText: "Toma añadida" })).toBeVisible();
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");
  await roll.getByRole("button", { name: "Deshacer" }).click();
  await expect(roll.locator(".piano-roll__facts")).toContainText("0 notas");
  await roll.getByRole("button", { name: "Rehacer" }).click();
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");

  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const secondDownload = page.waitForEvent("download");
  await tracks.getByRole("button", { name: "Exportar .mid" }).click();
  const after = await readFile(await (await secondDownload).path());
  expect(createHash("sha256").update(after).digest("hex")).toBe(sourceHash);
  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await expect(roll.locator(".piano-roll__facts")).toContainText("1 notas");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
