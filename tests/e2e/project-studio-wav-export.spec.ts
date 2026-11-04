import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test("Studio guarda un beat y descarga WAV PCM audiblemente no vacío en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Batería", exact: true }).click();
  await page.getByRole("button", { name: "Preparar batería" }).click();
  const rack = page.getByRole("region", { name: "Rack de batería de 16 pads" });
  const kick = rack.getByRole("button", { name: /Kick, paso 1,/ });
  await expect(kick).toBeEnabled({ timeout: 20_000 });
  await kick.click();
  await expect(rack.getByText("1 golpes", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Exportar audio" }).click();
  const panel = page.getByRole("region", { name: "Exportar audio del proyecto" });
  await panel.getByRole("combobox", { name: "Frecuencia WAV" }).selectOption("44100");
  await panel.getByRole("combobox", { name: "Profundidad WAV" }).selectOption("pcm16");
  await panel.getByRole("spinbutton", { name: "Cola WAV en segundos" }).fill("0");
  const pendingDownload = page.waitForEvent("download", { timeout: 90_000 });
  await panel.getByRole("button", { name: "Crear WAV" }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(/master\.wav$/);
  const bytes = await readFile(await download.path());
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
  expect(bytes.readUInt32LE(24)).toBe(44_100);
  expect(bytes.readUInt16LE(34)).toBe(16);
  expect(bytes.length).toBeGreaterThan(44);
  let peak = 0;
  for (let offset = 44; offset + 1 < bytes.length; offset += 2) {
    peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
  }
  expect(peak).toBeGreaterThan(0);
  await expect(panel).toContainText("Exportación de revisión", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Studio entrega stems y manifiesto verificable en una sola descarga ZIP", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Batería", exact: true }).click();
  await page.getByRole("button", { name: "Preparar batería" }).click();
  const rack = page.getByRole("region", { name: "Rack de batería de 16 pads" });
  const kick = rack.getByRole("button", { name: /Kick, paso 1,/ });
  await expect(kick).toBeEnabled({ timeout: 20_000 });
  await kick.click();
  await page.getByRole("button", { name: "Exportar audio" }).click();
  const panel = page.getByRole("region", { name: "Exportar audio del proyecto" });
  await panel.getByRole("combobox", { name: "Stems WAV" }).selectOption("tracks");
  await panel.getByRole("spinbutton", { name: "Cola WAV en segundos" }).fill("0");
  const pendingDownload = page.waitForEvent("download", { timeout: 90_000 });
  await panel.getByRole("button", { name: "Crear WAV" }).click();
  await expect(panel.locator(".project-export__notice")).toContainText("Exportación de revisión", { timeout: 30_000 });
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(/-stems\.zip$/);
  const archive = await readFile(await download.path());
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const dataLength = archive.readUInt32LE(offset + 18);
    const name = archive.toString("utf8", offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, archive.subarray(start, start + dataLength));
    offset = start + dataLength;
  }
  expect(archive.readUInt32LE(offset)).toBe(0x02014b50);
  const manifestBytes = entries.get("manifest.json");
  expect(manifestBytes).toBeDefined();
  const manifest = JSON.parse(manifestBytes!.toString("utf8")) as {
    kind: string; files: Array<{ name: string; sha256: string; frames: number }>;
    render: { projectLimiterIncluded: boolean; stemsAdditive: boolean };
  };
  expect(manifest.kind).toBe("pmp-wav-stems");
  expect(manifest.files).toHaveLength(2);
  expect(manifest.render.projectLimiterIncluded).toBe(true);
  expect(manifest.render.stemsAdditive).toBe(false);
  for (const file of manifest.files) {
    const bytes = entries.get(file.name);
    expect(bytes).toBeDefined();
    expect(bytes!.toString("ascii", 0, 4)).toBe("RIFF");
    expect(createHash("sha256").update(bytes!).digest("hex")).toBe(file.sha256);
    expect(file.frames).toBeGreaterThan(0);
  }
  await expect(panel).toContainText("2 WAV", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
