import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("la voz mono de una muestra grabada conserva glide y legato tras recarga en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Sampler" }).click();
  const sampler = page.getByRole("region", { name: "Sampler de muestras propias" });
  await sampler.getByLabel("Elegir muestra propia").setInputFiles(resolve(
    "app/public/audio/freepats-handclap/core/01_02.ogg"));
  await expect(page.getByRole("status").filter({ hasText: "SHA-256 verificado" })).toBeVisible();
  await sampler.getByRole("button", { name: "Añadir pista de muestra" }).click();
  await page.getByRole("button", { name: "Sampler" }).click();
  const voice = sampler.getByRole("region", { name: "Voz de la muestra" });
  await expect(voice.getByRole("combobox", { name: "Polifonía de muestra" })).toHaveValue("poly");
  await voice.getByRole("combobox", { name: "Polifonía de muestra" }).selectOption("mono");
  await expect(voice.getByRole("option", { name: "Legato (Gate + loop)" })).toHaveAttribute("disabled", "");
  await voice.getByRole("spinbutton", { name: "Glide de muestra" }).fill("80");
  await voice.getByRole("spinbutton", { name: "Ataque de muestra" }).fill("12");
  await voice.getByRole("spinbutton", { name: "Release de muestra" }).fill("90");
  await voice.getByRole("slider", { name: "Saturación de muestra" }).fill("0.4");
  await voice.getByRole("checkbox", { name: "Activar subgrave de muestra" }).check();
  await voice.getByRole("spinbutton", { name: "Nivel de subgrave de muestra" }).fill("-14");
  await voice.getByRole("button", { name: "Guardar voz" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Voz de muestra guardada" })).toBeVisible();

  await sampler.getByRole("button", { name: "Editar región" }).click();
  await sampler.getByRole("combobox", { name: "Modo de muestra" }).selectOption("gate");
  await sampler.getByRole("combobox", { name: "Loop de muestra" }).selectOption("loop");
  const durationEngine = sampler.getByRole("combobox", { name: "Motor de duración de muestra" });
  await expect(durationEngine).toHaveValue("repitch");
  await expect(durationEngine.getByRole("option", { name: "Time-stretch · no disponible" }))
    .toBeDisabled();
  await sampler.getByRole("button", { name: "Guardar región" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Región guardada" })).toBeVisible();
  await voice.getByRole("combobox", { name: "Reataque de muestra" }).selectOption("legato");
  await voice.getByRole("button", { name: "Guardar voz" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Voz de muestra guardada" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("button", { name: "Sampler" }).click();
  await expect(voice.getByRole("combobox", { name: "Polifonía de muestra" })).toHaveValue("mono");
  await expect(voice.getByRole("combobox", { name: "Reataque de muestra" })).toHaveValue("legato");
  await expect(voice.getByRole("spinbutton", { name: "Glide de muestra" })).toHaveValue("80");
  await expect(voice.getByRole("spinbutton", { name: "Ataque de muestra" })).toHaveValue("12");
  await expect(voice.getByRole("spinbutton", { name: "Release de muestra" })).toHaveValue("90");
  await expect(voice.getByRole("slider", { name: "Saturación de muestra" })).toHaveValue("0.4");
  await expect(voice.getByRole("checkbox", { name: "Activar subgrave de muestra" })).toBeChecked();
  await expect(voice.getByRole("spinbutton", { name: "Nivel de subgrave de muestra" })).toHaveValue("-14");
  await voice.getByRole("button", { name: "Restablecer polifonía" }).click();
  await expect(voice.getByRole("slider", { name: "Saturación de muestra" })).toBeDisabled();
  await expect(voice.getByRole("checkbox", { name: "Activar subgrave de muestra" })).toBeDisabled();
  await expect(voice.getByRole("combobox", { name: "Polifonía de muestra" })).toHaveValue("poly");
});
