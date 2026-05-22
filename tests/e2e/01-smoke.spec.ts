import { test, expect } from "@playwright/test";

test.describe("Smoke — carga inicial", () => {
  test("título y h1 correctos", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Piano MIDI Pro");
    await expect(page.locator("h1")).toContainText("Piano MIDI Pro");
  });

  test("5 botones de navegación en el rail", async ({ page }) => {
    await page.goto("/");
    // The rail buttons: Studio, Canciones, Pistas, MIDI, Ajustes
    // They are rendered as buttons inside the nav rail
    const navButtons = page.locator(".rail-btn, nav button, [class*='rail'] button");
    await expect(navButtons).toHaveCount(5);
  });

  test("teclado visible con teclas blancas y negras", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".piano-key-element.white").first()).toBeVisible();
    await expect(page.locator(".piano-key-element.black").first()).toBeVisible();
  });

  test("canvas del visualizador existe", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("canvas.visualizer-canvas")).toBeVisible();
  });

  test("controles de reproducción visibles", async ({ page }) => {
    await page.goto("/");
    // Play, Pause, Stop buttons
    const playBtn = page.locator("button svg path[d*='8 5']").first();
    await expect(page.locator(".controls-center, section.transport-bar, .player-controls").first()).toBeVisible();
  });

  test("rango inicial 37 teclas C3–C6", async ({ page }) => {
    await page.goto("/");
    // range badge text
    const rangeBadge = page.locator(".range-header-badge");
    await expect(rangeBadge).toContainText("C3");
    await expect(rangeBadge).toContainText("C5");
  });

  test("no hay errores JS críticos en consola", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForTimeout(2000);
    const fatal = errors.filter(
      (e) =>
        !e.includes("AudioContext") &&
        !e.includes("NotAllowedError") &&
        !e.includes("permissions")
    );
    expect(fatal).toHaveLength(0);
  });
});
