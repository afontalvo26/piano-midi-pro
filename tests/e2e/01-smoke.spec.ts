import { test, expect } from "@playwright/test";

// The demo library (117 MIDI files) is fetched and parsed on cold start. Tests
// that wait for it need more than the default 45s budget under parallel load.
test.describe.configure({ timeout: 180_000 });

test.describe("Smoke — carga inicial", () => {
  test("título y h1 correctos", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Piano MIDI Pro");
    await expect(page.locator("h1")).toContainText("Piano MIDI Pro");
  });

  test("8 botones de navegación en el rail", async ({ page }) => {
    await page.goto("/");
    // The rail buttons: Studio, Juego, Música, Canciones, Pistas, MIDI,
    // Ajustes, Partitura.
    const railItems = page.locator(".rail-item");
    await expect(railItems).toHaveCount(8);
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

  test("la barra del reproductor está visible al arrancar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".pm-bar")).toBeVisible();
    await expect(page.locator(".pm-bar__transport .pm-tbtn--solid")).toBeVisible();
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
    // The transport lives in section.playback-bar: play, stop and metronome
    const bar = page.locator("section.playback-bar");
    await expect(bar).toBeVisible();
    await expect(bar.locator(".btn.primary").first()).toContainText("Reproducir");
    await expect(bar.locator("button", { hasText: "Detener" })).toBeVisible();
    await expect(bar.locator("button", { hasText: "Metrónomo" })).toBeVisible();
  });

  test("rango inicial 37 teclas C3–C6", async ({ page }) => {
    await page.goto("/");
    // range badge text
    const rangeBadge = page.locator(".range-header-badge");
    await expect(rangeBadge).toContainText("C3");
    await expect(rangeBadge).toContainText("C6");
    // 37 keys = 22 white + 15 black for the C3–C6 range
    await expect(page.locator(".piano-key-element")).toHaveCount(37);
    await expect(page.locator(".piano-key-element.white")).toHaveCount(22);
    await expect(page.locator(".piano-key-element.black")).toHaveCount(15);
  });

  test("no hay errores JS críticos en consola", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");

    // Wait for the demo library to finish parsing (117 MIDI files) so that
    // crashes during the heavy parse path are caught too — not just the
    // initial paint.
    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await expect(page.locator(".lib-card").first()).toBeVisible({
      timeout: 120_000,
    });
    await expect
      .poll(
        async () => {
          const total = Number(await page.locator(".lib-hero__count").innerText());
          const cards = await page.locator(".lib-card").count();
          return total > 0 && total === cards ? total : -1;
        },
        { timeout: 45_000 },
      )
      .toBeGreaterThan(0);

    const fatal = errors.filter(
      (e) =>
        !e.includes("AudioContext") &&
        !e.includes("NotAllowedError") &&
        !e.includes("permissions"),
    );
    expect(fatal).toHaveLength(0);
  });
});
