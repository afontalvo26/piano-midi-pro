import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("beat propio de cuatro compases conserva notas, batería, secciones, WAV, MIDI y respaldo", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const studio = page.getByTestId("reference-studio");
  await studio.getByRole("button", { name: "Crear un proyecto" }).click();
  await studio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Piano roll", exact: true }).click();
  const roll = page.getByRole("region", { name: "Piano roll" });
  await roll.getByRole("button", { name: "Dibujar" }).click();
  const canvas = roll.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  for (const x of [105, 151, 197]) await page.mouse.click(box!.x + x, box!.y + 120);
  await expect(roll.locator(".piano-roll__facts")).toContainText("3 notas");
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }))
    .toContainText("Guardado", { timeout: 20_000 });

  await page.getByRole("button", { name: "Batería", exact: true }).click();
  await page.getByRole("button", { name: "Preparar batería" }).click();
  const rack = page.getByRole("region", { name: "Rack de batería de 16 pads" });
  for (const name of [/Kick, paso 1,/, /Snare, paso 5,/, /Hi-hat cerrado, paso 9,/]) {
    const step = rack.getByRole("button", { name });
    await expect(step).toBeEnabled({ timeout: 20_000 });
    await step.click();
  }
  await expect(rack.getByText("3 golpes", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Arreglo", exact: true }).click();
  const arrangement = page.getByRole("region", { name: "Arreglo" });
  for (const [name, tick] of [["Intro", "0"], ["Verso", "3840"], ["Hook", "7680"]]) {
    await arrangement.getByLabel("Nombre de sección").fill(name);
    await arrangement.getByLabel("Inicio de sección").fill(tick);
    await arrangement.getByRole("button", { name: "+ Crear sección" }).click();
    await expect(arrangement.locator(".arrangement__save")).toHaveText("Guardado", { timeout: 20_000 });
    if (name !== "Hook") await expect(arrangement.getByRole("button", { name })).toBeVisible();
  }
  const timeline = arrangement.getByLabel("Línea de tiempo desplazable");
  await timeline.evaluate((element) => { element.scrollLeft = 400; });
  await expect(arrangement.getByRole("button", { name: "Hook" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await page.locator(".ref-project-select").click();
  const browser = page.getByRole("region", { name: "Tus proyectos" });
  await browser.getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByTestId("reference-studio")
    .getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Piano roll", exact: true }).click();
  await expect(roll.locator(".piano-roll__facts")).toContainText("3 notas");
  await page.getByRole("button", { name: "Arreglo", exact: true }).click();
  await timeline.evaluate((element) => { element.scrollLeft = 400; });
  for (const name of ["Intro", "Verso", "Hook"]) {
    await expect(arrangement.getByRole("button", { name })).toBeVisible();
  }

  const midiDownload = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Exportar MIDI" }).click();
  const midiBytes = await readFile(await (await midiDownload).path());
  expect(midiBytes.toString("ascii", 0, 4)).toBe("MThd");
  expect(midiBytes.readUInt16BE(12)).toBe(960);

  await page.getByRole("button", { name: "Exportar audio" }).click();
  const exportPanel = page.getByRole("region", { name: "Exportar audio del proyecto" });
  await exportPanel.getByRole("spinbutton", { name: "Cola WAV en segundos" }).fill("0");
  const wavDownload = page.waitForEvent("download", { timeout: 60_000 });
  await exportPanel.getByRole("button", { name: "Crear WAV" }).click();
  const wavBytes = await readFile(await (await wavDownload).path());
  expect(wavBytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wavBytes.toString("ascii", 8, 12)).toBe("WAVE");
  expect(wavBytes.length).toBeGreaterThan(44);
  let nonzero = false;
  for (let index = 44; index + 1 < wavBytes.length; index += 2) {
    if (wavBytes.readInt16LE(index) !== 0) { nonzero = true; break; }
  }
  expect(nonzero).toBe(true);

  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const bundleDownload = page.waitForEvent("download", { timeout: 30_000 });
  await browser.getByRole("button", { name: "Exportar proyecto" }).click();
  const bundleBytes = await readFile(await (await bundleDownload).path());
  await browser.getByRole("button", { name: "Restaurar respaldo del proyecto" }).setInputFiles({
    name: "beat.pmp", mimeType: "application/vnd.piano-midi-pro.project+json", buffer: bundleBytes,
  });
  const preview = browser.getByRole("region", { name: "Previsualización del respaldo" });
  await expect(preview).toContainText("Respaldo verificado");
  await preview.getByRole("button", { name: "Restaurar como copia" }).click();
  await expect(browser.getByRole("article")).toHaveCount(2);
  const restored = browser.getByRole("article").first();
  await expect(restored).toContainText("revisión 1");
  await restored.getByRole("button", { name: "Abrir en Studio" }).click();
  await expect(roll.locator(".piano-roll__facts")).toContainText("3 notas");
  await page.getByRole("button", { name: "Arreglo", exact: true }).click();
  await timeline.evaluate((element) => { element.scrollLeft = 400; });
  await expect(arrangement.getByRole("button", { name: "Hook" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
