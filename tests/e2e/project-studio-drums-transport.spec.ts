import { expect, test } from "@playwright/test";

test("Studio carga el kit grabado, edita un paso y reproduce el proyecto en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  const projectTempo = page.getByRole("spinbutton", { name: "Tempo inicial del proyecto" });
  await projectTempo.fill("128");
  await projectTempo.blur();
  await expect(projectTempo).toHaveValue("128");
  await page.getByRole("button", { name: "Batería", exact: true }).click();

  const drums = page.getByRole("region", { name: "Rack de batería de 16 pads" });
  await expect(drums).toBeVisible();
  await expect(drums.locator(".drum-rack__row")).toHaveCount(16);
  const firstKick = drums.getByRole("button", { name: /Kick, paso 1,/ });
  await expect(firstKick).toBeDisabled();

  await page.getByRole("button", { name: "Preparar batería" }).click();
  await expect(drums.getByText("6/16 fuentes decodificadas", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(firstKick).toBeEnabled();
  await firstKick.click();
  await expect(drums.getByText("1 golpes", { exact: false })).toBeVisible();
  await expect(drums.getByText("0/16 fuentes decodificadas", { exact: false })).toBeVisible();
  await expect(drums.getByRole("button", { name: "Escuchar Kick" })).toHaveCount(0);
  await page.getByRole("button", { name: "Preparar batería" }).click();
  await expect(firstKick).toBeEnabled();
  await expect(drums.getByRole("status", { name: "" })).toContainText("Guardado", { timeout: 20_000 });

  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Pausar" }).click();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();
  await page.getByRole("button", { name: "Detener" }).click();
  await expect(page.getByRole("button", { name: "Reproducir" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await expect(projectTempo).toHaveValue("128");
  await page.getByRole("button", { name: "Batería", exact: true }).click();
  await expect(drums.getByText("1 golpes", { exact: false })).toBeVisible();
});
