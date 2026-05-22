import { test, expect } from "@playwright/test";

test.describe("Navegación — 6 pantallas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hay 6 botones en el sidebar rail", async ({ page }) => {
    const railItems = page.locator(".rail-item");
    await expect(railItems).toHaveCount(6);
  });

  test("Studio activo por defecto", async ({ page }) => {
    const studioBtn = page.locator(".rail-item", { hasText: "Studio" });
    await expect(studioBtn).toHaveClass(/active/);
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("navegar a Canciones", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await expect(page.locator("h2", { hasText: "Biblioteca de Canciones" })).toBeVisible();
    await expect(page.locator(".songs-grid")).toBeVisible();
  });

  test("navegar a Pistas", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Pistas" }).click();
    await expect(page.locator("h2", { hasText: "Gestor de Pistas" })).toBeVisible();
  });

  test("navegar a MIDI", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "MIDI" }).click();
    await expect(page.locator("h2", { hasText: "MIDI" })).toBeVisible();
    await expect(page.locator("text=Buscar entradas MIDI")).toBeVisible();
  });

  test("navegar a Ajustes", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Ajustes" }).click();
    await expect(page.locator("h2", { hasText: "Configuraciones Generales" })).toBeVisible();
  });

  test("navegar a Partitura", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Partitura" }).click();
    await expect(page.locator("h3", { hasText: "Importar Partitura" })).toBeVisible();
  });

  test("volver a Studio desde Canciones", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await page.locator(".rail-item", { hasText: "Studio" }).click();
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("topbar header siempre visible en todas las pantallas", async ({ page }) => {
    const screens = ["Canciones", "Pistas", "MIDI", "Ajustes", "Partitura", "Studio"];
    for (const s of screens) {
      await page.locator(".rail-item", { hasText: s }).click();
      await expect(page.locator("h1", { hasText: "Piano MIDI Pro" })).toBeVisible();
      await expect(page.locator(".playback-bar")).toBeVisible();
    }
  });
});
