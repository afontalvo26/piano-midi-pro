import { test, expect } from "@playwright/test";

test.describe("Navegación — 8 secciones", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("hay 8 botones en el sidebar rail", async ({ page }) => {
    const railItems = page.locator(".rail-item");
    await expect(railItems).toHaveCount(8);
    // Orden esperado: Studio, Juego, Música, Canciones, Pistas, MIDI, Ajustes,
    // Partitura. "Música" es el reproductor; "Canciones" la biblioteca clásica.
    await expect(railItems).toHaveText([
      /Studio/,
      /Juego/,
      /Música/,
      /Canciones/,
      /Pistas/,
      /MIDI/,
      /Ajustes/,
      /Partitura/,
    ]);
  });

  test("navegar a Música (el reproductor)", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Música" }).click();
    await expect(page.locator(".pm-screen")).toBeVisible();
    await expect(page.locator(".pm-nav__brand-text")).toHaveText("Mi música");
  });

  test("Studio activo por defecto", async ({ page }) => {
    const studioBtn = page.locator(".rail-item", { hasText: "Studio" });
    await expect(studioBtn).toHaveClass(/active/);
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("navegar a Juego", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Juego" }).click();
    await expect(page.locator(".game-panel-card h3")).toHaveText(
      "Modo Juego 37 teclas",
    );
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("navegar a Canciones", async ({ page }) => {
    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await expect(page.locator(".lib-root")).toBeVisible();
    // The library hero title replaced the old "Biblioteca de Canciones" h2
    await expect(page.locator(".lib-hero__title")).toHaveText(
      "Biblioteca de Canciones",
    );
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
    const screens = [
      "Juego",
      "Música",
      "Canciones",
      "Pistas",
      "MIDI",
      "Ajustes",
      "Partitura",
      "Studio",
    ];
    for (const s of screens) {
      await page.locator(".rail-item", { hasText: s }).click();
      await expect(page.locator("h1", { hasText: "Piano MIDI Pro" })).toBeVisible();
      await expect(page.locator(".playback-bar")).toBeVisible();
    }
  });

  test("la barra del reproductor sobrevive al cambio de pantalla", async ({
    page,
  }) => {
    await expect(page.locator(".pm-bar")).toBeVisible();
    for (const s of ["Música", "Juego", "Partitura", "Studio"]) {
      await page.locator(".rail-item", { hasText: s }).click();
      await expect(page.locator(".pm-bar")).toBeVisible();
    }
  });
});
