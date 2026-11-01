import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

test("Configuración informa cuota local y solicita persistencia sólo al pulsar", async ({ page }) => {
  page.setDefaultTimeout(20_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Configuración" }).tap();
  const storage = page.getByRole("heading", { name: "Almacenamiento local de proyectos" }).locator("..");
  await expect(storage).toContainText("Uso estimado:");
  await storage.getByRole("button", { name: "Actualizar estado" }).tap();
  await expect(storage).toContainText("Cuota estimada:");
  const request = storage.getByRole("button", { name: "Solicitar almacenamiento persistente" });
  if (await request.isEnabled()) {
    await request.tap();
    await expect(storage.getByRole("status")).toContainText(/concedido|no concedió/);
  }
  const libraries = page.getByRole("region", { name: "Bibliotecas de sonido y licencias" });
  await expect(libraries).toContainText("Salamander Grand Piano");
  await expect(libraries).toContainText("Virtuosity Drums");
  await expect(libraries).toContainText("FreePats Hand Clap");
  await expect(libraries.getByRole("link", { name: "Fuente" })).toHaveCount(3);
  await expect(libraries).toContainText("El kit 808 grabado aún no está incluido");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
