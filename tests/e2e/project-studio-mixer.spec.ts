import { expect, test } from "@playwright/test";

test("Mezclador guarda niveles y mute sin reiniciar el transporte en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  const referenceStudio = page.getByTestId("reference-studio");
  await referenceStudio.getByRole("button", { name: "Crear un proyecto" }).click();
  await referenceStudio.getByRole("button", { name: "Editor de arreglo completo" }).click();
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Mezclador" }).click();
  const mixer = page.getByRole("region", { name: "Mezclador del proyecto" });
  const piano = mixer.getByRole("region", { name: "Canal Piano" });
  await piano.getByRole("spinbutton", { name: "Ganancia (dB)" }).fill("-6");
  await piano.getByRole("spinbutton", { name: "Ganancia (dB)" }).blur();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  await piano.getByRole("spinbutton", { name: "Pan (−1 a 1)" }).fill("0.25");
  await piano.getByRole("spinbutton", { name: "Pan (−1 a 1)" }).blur();
  await piano.getByRole("button", { name: "Mute" }).click();
  await expect(piano.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  await mixer.getByRole("spinbutton", { name: "Ganancia master (dB)" }).fill("-3");
  await mixer.getByRole("spinbutton", { name: "Ganancia master (dB)" }).blur();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" })).toContainText("Guardado", { timeout: 20_000 });

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("button", { name: "Mezclador" }).click();
  const reopened = page.getByRole("region", { name: "Mezclador del proyecto" });
  const reopenedPiano = reopened.getByRole("region", { name: "Canal Piano" });
  await expect(reopenedPiano.getByRole("spinbutton", { name: "Ganancia (dB)" })).toHaveValue("-6");
  await expect(reopenedPiano.getByRole("spinbutton", { name: "Pan (−1 a 1)" })).toHaveValue("0.25");
  await expect(reopenedPiano.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");
  await expect(reopened.getByRole("spinbutton", { name: "Ganancia master (dB)" })).toHaveValue("-3");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
