import { expect, test } from "@playwright/test";

test("bus del mezclador persiste, rechaza borrado con rutas y permite undo", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuevo proyecto" }).click();
  await page.getByRole("button", { name: "Mezclador" }).click();
  const mixer = page.getByRole("region", { name: "Mezclador del proyecto" });
  await mixer.getByRole("textbox", { name: "Nombre del bus" }).fill("Bus QA");
  await mixer.getByRole("button", { name: "Crear bus" }).click();
  const bus = mixer.getByRole("region", { name: "Canal Bus QA" });
  await expect(bus).toBeVisible();
  const piano = mixer.getByRole("region", { name: "Canal Piano" });
  await piano.getByRole("combobox", { name: "Salida" }).selectOption({ label: "Bus QA" });
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }))
    .toContainText("Guardado", { timeout: 20_000 });

  await page.reload();
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  await page.getByRole("region", { name: "Tus proyectos" })
    .getByRole("button", { name: "Abrir en Studio" }).click();
  await page.getByRole("button", { name: "Mezclador" }).click();
  await expect(mixer.getByRole("region", { name: "Canal Bus QA" })).toBeVisible();
  await expect(piano.getByRole("combobox", { name: "Salida" })).not.toHaveValue("master");

  await bus.getByRole("button", { name: "Eliminar bus" }).click();
  await bus.getByRole("button", { name: "Confirmar eliminación del bus" }).click();
  await expect(bus).toBeVisible();
  await expect(page.getByRole("region", { name: "Proyecto de Beatmaker" }).getByRole("alert"))
    .toBeVisible();
  await piano.getByRole("combobox", { name: "Salida" }).selectOption("master");
  await bus.getByRole("button", { name: "Eliminar bus" }).click();
  await bus.getByRole("button", { name: "Confirmar eliminación del bus" }).click();
  await expect(bus).toHaveCount(0);
  await mixer.getByRole("button", { name: "Deshacer" }).click();
  await expect(mixer.getByRole("region", { name: "Canal Bus QA" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
