import { expect, test } from "@playwright/test";

test("Pistas crea, renombra, duplica, archiva y restaura proyectos", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  const browser = page.getByRole("region", { name: "Tus proyectos" });
  await browser.getByRole("textbox", { name: "Nombre del proyecto" }).fill("Beat QA");
  await browser.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("region", { name: "Piano roll" })).toBeVisible();

  await page.getByRole("button", { name: "Pistas", exact: true }).click();
  let item = browser.getByRole("article").filter({ has: page.getByRole("heading", { name: "Beat QA", exact: true }) });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Renombrar" }).click();
  await browser.getByRole("textbox", { name: "Nuevo nombre" }).fill("Beat QA editado");
  await browser.getByRole("button", { name: "Guardar nombre" }).click();
  item = browser.getByRole("article").filter({ has: page.getByRole("heading", { name: "Beat QA editado", exact: true }) });
  await expect(item).toBeVisible();

  await item.getByRole("button", { name: "Duplicar" }).click();
  const copy = browser.getByRole("article").filter({ has: page.getByRole("heading", { name: "Beat QA editado copia", exact: true }) });
  await expect(copy).toBeVisible();
  await browser.getByRole("searchbox", { name: "Buscar proyectos" }).fill("copia");
  await expect(browser.getByRole("article")).toHaveCount(1);
  await expect(copy).toBeVisible();
  await browser.getByRole("searchbox", { name: "Buscar proyectos" }).fill("");
  await browser.getByRole("combobox", { name: "Ordenar proyectos" }).selectOption("name");
  await expect(browser.getByRole("article").first()).toContainText("Beat QA editado");
  await item.getByRole("button", { name: "Archivar", exact: true }).click();
  await item.getByRole("button", { name: "Confirmar archivo" }).click();
  await expect(item).toHaveCount(0);
  await browser.getByRole("button", { name: "Mostrar archivados (1)" }).click();
  item = browser.getByRole("article").filter({ has: page.getByRole("heading", { name: "Beat QA editado", exact: true }) });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Restaurar" }).click();
  await expect(item.getByRole("button", { name: "Abrir en Studio" })).toBeVisible();
  await copy.getByRole("button", { name: "Abrir en Studio" }).click();
  await expect(page.getByRole("region", { name: "Piano roll" }).getByRole("heading", { name: "Patrón de piano" })).toBeVisible();
});
