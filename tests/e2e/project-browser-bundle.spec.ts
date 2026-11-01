import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("Pistas exporta, restaura y rechaza un respaldo alterado", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const browser = page.getByRole("region", { name: "Tus proyectos" });
  await browser.getByRole("textbox", { name: "Nombre del proyecto" }).fill("Respaldo QA");
  await browser.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" })).toContainText("Respaldo QA");
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await expect(browser.getByRole("article")).toHaveCount(1);

  const downloadPromise = page.waitForEvent("download");
  await browser.getByRole("button", { name: "Exportar proyecto" }).click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe("Respaldo-QA.pmp");
  const buffer = await readFile(await downloaded.path());
  await browser.getByRole("button", { name: "Restaurar respaldo del proyecto" }).setInputFiles({
    name: "respaldo.pmp", mimeType: "application/vnd.piano-midi-pro.project+json", buffer,
  });
  const preview = browser.getByRole("region", { name: "Previsualización del respaldo" });
  await expect(preview).toContainText("Respaldo verificado");
  await expect(preview).toContainText("Respaldo QA");
  await expect(browser.getByRole("article")).toHaveCount(1);
  await preview.getByRole("button", { name: "Cancelar restauración" }).click();
  await expect(preview).toHaveCount(0);
  await browser.getByRole("button", { name: "Restaurar respaldo del proyecto" }).setInputFiles({
    name: "respaldo.pmp", mimeType: "application/vnd.piano-midi-pro.project+json", buffer,
  });
  await expect(preview).toContainText("Respaldo QA");
  await preview.getByRole("button", { name: "Restaurar como copia" }).click();
  await expect(browser.getByRole("article")).toHaveCount(2);

  await browser.getByRole("button", { name: "Restaurar respaldo del proyecto" }).setInputFiles({
    name: "alterado.pmp", mimeType: "application/vnd.piano-midi-pro.project+json", buffer: Buffer.from("{\"format\":\"alterado\"}"),
  });
  await expect(browser.getByRole("alert")).toContainText(/manifiesto|versión|respaldo/i);
  await expect(browser.getByRole("article")).toHaveCount(2);
});
