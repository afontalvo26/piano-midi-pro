import { expect, test } from "@playwright/test";

test("Mezclador guarda, reordena y omite efectos por pista y master en móvil", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Mezclador" }).click();
  const mixer = page.getByRole("region", { name: "Mezclador del proyecto" });
  await expect(mixer.getByLabel("Nivel master antes de efectos")).toBeVisible();
  await expect(mixer.getByLabel("Nivel master después de efectos")).toBeVisible();
  const piano = mixer.getByRole("region", { name: "Efectos de Piano" });
  await piano.getByRole("combobox", { name: "Nuevo efecto" }).selectOption("filter");
  await piano.getByRole("button", { name: "Añadir efecto" }).click();
  await piano.getByRole("spinbutton", { name: "Filtro Frecuencia de corte" }).fill("2400");
  await piano.getByRole("spinbutton", { name: "Filtro Frecuencia de corte" }).blur();
  await piano.getByRole("combobox", { name: "Nuevo efecto" }).selectOption("eq3");
  await piano.getByRole("button", { name: "Añadir efecto" }).click();
  await piano.getByRole("spinbutton", { name: "EQ de 3 bandas Graves" }).fill("4");
  await piano.getByRole("spinbutton", { name: "EQ de 3 bandas Graves" }).blur();
  await piano.getByRole("button", { name: "Subir EQ de 3 bandas" }).click();
  await expect(piano.locator(".project-effects__effect").first()).toContainText("EQ de 3 bandas");
  await piano.getByRole("button", { name: "Activo" }).nth(1).click();
  await expect(piano.getByRole("button", { name: "Bypass" })).toBeVisible();

  const master = mixer.getByRole("region", { name: "Efectos de master" });
  await master.getByRole("combobox", { name: "Nuevo efecto" }).selectOption("limiter");
  await master.getByRole("button", { name: "Añadir efecto" }).click();
  await expect(master.getByRole("spinbutton", { name: "Limitador Umbral" })).toHaveValue("-1");
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }))
    .toContainText("Guardado", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const smallTargets = await mixer.evaluate((root) => [...root.querySelectorAll("button,input,select")]
    .filter((control) => !(control as HTMLButtonElement).disabled)
    .filter((control) => { const box = control.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44); })
    .map((control) => control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName));
  expect(smallTargets).toEqual([]);

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("button", { name: "Mezclador" }).click();
  await expect(piano.locator(".project-effects__effect")).toHaveCount(2);
  await expect(piano.locator(".project-effects__effect").first()).toContainText("EQ de 3 bandas");
  await expect(piano.getByRole("spinbutton", { name: "EQ de 3 bandas Graves" })).toHaveValue("4");
  await expect(piano.getByRole("spinbutton", { name: "Filtro Frecuencia de corte" })).toHaveValue("2400");
  await expect(piano.getByRole("button", { name: "Bypass" })).toBeVisible();
  await expect(master.getByRole("spinbutton", { name: "Limitador Umbral" })).toHaveValue("-1");
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toBeVisible();
  const comparison = mixer.getByRole("region", { name: "Comparación A/B de Piano" });
  await comparison.getByRole("button", { name: "B · Procesada" }).click();
  await expect(comparison.getByRole("button", { name: "B · Procesada" })).toHaveAttribute("aria-pressed", "true");
  await expect(comparison).toContainText("Nunca se amplifica para igualar");
  await comparison.getByRole("button", { name: "A · Original" }).click();
  await expect(comparison.getByRole("button", { name: "A · Original" })).toHaveAttribute("aria-pressed", "true");
  await comparison.getByRole("button", { name: "Salir A/B" }).click();
  await expect(comparison.getByRole("button", { name: "Salir A/B" })).toBeDisabled();
  await piano.getByRole("button", { name: "Restaurar parámetros" }).first().click();
  await expect(page.getByRole("button", { name: "Reproducir" })).toBeVisible();
  await expect(piano.getByRole("spinbutton", { name: "EQ de 3 bandas Graves" })).toHaveValue("0");
  await mixer.getByRole("button", { name: "Deshacer" }).click();
  await expect(piano.getByRole("spinbutton", { name: "EQ de 3 bandas Graves" })).toHaveValue("4");
  await piano.getByRole("button", { name: "Bajar EQ de 3 bandas" }).click();
  await expect(piano.locator(".project-effects__effect").first()).toContainText("Filtro");
  await mixer.getByRole("button", { name: "Deshacer" }).click();
  await expect(piano.locator(".project-effects__effect").first()).toContainText("EQ de 3 bandas");
  await piano.getByRole("button", { name: "Quitar Filtro" }).click();
  await expect(piano.locator(".project-effects__effect")).toHaveCount(1);
  await mixer.getByRole("button", { name: "Deshacer" }).click();
  await expect(piano.locator(".project-effects__effect")).toHaveCount(2);
});
