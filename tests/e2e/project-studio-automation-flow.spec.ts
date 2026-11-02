import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 780 }, hasTouch: true, isMobile: true });

test("Studio automatiza master, reproduce valor efectivo, deshace, recarga y exporta WAV", async ({ page }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).tap();
  await page.getByRole("button", { name: "Batería", exact: true }).tap();
  await page.getByRole("button", { name: "Preparar batería" }).tap();
  const rack = page.getByRole("region", { name: "Rack de batería de 16 pads" });
  const kick = rack.getByRole("button", { name: /Kick, paso 1,/ });
  await expect(kick).toBeEnabled();
  await kick.tap();
  await page.getByRole("button", { name: "Automatización", exact: true }).tap();
  const editor = page.getByRole("region", { name: "Automatización" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Crear curva" }).tap();
  await expect(editor.getByRole("combobox", { name: "Curva de automatización" })).toContainText("Master · volumen");
  for (const [tick, value] of [[0, -12], [960, -6], [1920, 0]]) {
    await editor.getByRole("spinbutton", { name: "Tick", exact: true }).fill(String(tick));
    await editor.getByRole("spinbutton", { name: "Valor · dB" }).fill(String(value));
    await editor.getByRole("button", { name: "Añadir punto" }).tap();
    await expect(editor.locator(".automation-editor__canvas"))
      .toHaveAttribute("aria-label", new RegExp(`${tick === 0 ? 1 : tick === 960 ? 2 : 3} puntos`));
  }
  await editor.getByRole("button", { name: "Deshacer" }).tap();
  await expect(editor.locator(".automation-editor__canvas")).toHaveAttribute("aria-label", /2 puntos/);
  await editor.getByRole("button", { name: "Rehacer" }).tap();
  await expect(editor.locator(".automation-editor__canvas")).toHaveAttribute("aria-label", /3 puntos/);
  await page.getByRole("button", { name: "Reproducir" }).tap();
  await expect(editor.getByText(/Valor efectivo .* dueño read/)).toBeVisible({ timeout: 20_000 });

  // AUT-03: Touch owns the parameter while held; scheduled read automation cannot steal it.
  await editor.getByRole("button", { name: "Touch" }).tap();
  const touchFader = editor.getByRole("slider", { name: "Fader Touch de automatización" });
  await touchFader.focus();
  await page.keyboard.down("ArrowRight");
  await expect(editor.getByText(/Valor efectivo .* dueño physical/)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.up("ArrowRight");
  await expect(editor.getByText(/Valor efectivo .* dueño read/)).toBeVisible({ timeout: 20_000 });
  await expect(editor.locator(".automation-editor__save")).toHaveText("Guardado", { timeout: 20_000 });

  await page.getByRole("button", { name: "Detener" }).tap();
  await expect(editor.locator(".automation-editor__save")).toHaveText("Guardado", { timeout: 20_000 });
  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).tap();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).tap();
  await page.getByRole("button", { name: "Automatización", exact: true }).tap();
  await expect(editor.locator(".automation-editor__canvas")).toHaveAttribute("aria-label", /3 puntos/);
  await page.getByRole("button", { name: "Exportar audio" }).tap();
  const panel = page.getByRole("region", { name: "Exportar audio del proyecto" });
  await panel.getByRole("spinbutton", { name: "Cola WAV en segundos" }).fill("0");
  const pending = page.waitForEvent("download", { timeout: 90_000 });
  await panel.getByRole("button", { name: "Crear WAV" }).tap();
  const download = await pending;
  const bytes = await readFile(await download.path());
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
  let peak = 0;
  for (let offset = 44; offset + 1 < bytes.length; offset += 2) {
    peak = Math.max(peak, Math.abs(bytes.readInt16LE(offset)));
  }
  expect(peak).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
