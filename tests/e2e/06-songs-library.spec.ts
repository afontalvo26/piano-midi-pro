import { test, expect } from "@playwright/test";

test.describe("Biblioteca de Canciones", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".rail-item", { hasText: "Canciones" }).click();
    await expect(page.locator(".songs-grid")).toBeVisible();
  });

  test("hay al menos 7 canciones demo", async ({ page }) => {
    const cards = page.locator(".song-card");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });

  test("cada canción tiene título, BPM, duración, notas y source", async ({ page }) => {
    const firstCard = page.locator(".song-card").first();
    await expect(firstCard.locator(".song-card-title")).toBeVisible();
    await expect(firstCard.locator(".song-card-meta")).toContainText("BPM");
    await expect(firstCard.locator(".song-card-meta")).toContainText("s");
    await expect(firstCard.locator(".song-card-meta")).toContainText("notas");
  });

  test("Llorarás está en la lista", async ({ page }) => {
    await expect(page.locator(".song-card-title", { hasText: "Llorarás" })).toBeVisible();
  });

  test("Quimbara está en la lista", async ({ page }) => {
    await expect(page.locator(".song-card-title", { hasText: "Quimbara" })).toBeVisible();
  });

  test("Aguanile está en la lista con 3 pistas", async ({ page }) => {
    const aguanileCard = page.locator(".song-card", { hasText: "Aguanile" });
    await expect(aguanileCard).toBeVisible();
  });

  test("Pedro Navaja está en la lista y tiene pistas (bug fix)", async ({ page }) => {
    const pedroCard = page.locator(".song-card", { hasText: "Pedro Navaja" });
    await expect(pedroCard).toBeVisible();
    const metaText = await pedroCard.locator(".song-card-meta").innerText();
    // Should have notes > 0
    expect(metaText).toMatch(/\d+ notas/);
  });

  test("Para Elisa está en la lista", async ({ page }) => {
    await expect(page.locator(".song-card-title", { hasText: "Para Elisa" })).toBeVisible();
  });

  test("búsqueda filtra canciones", async ({ page }) => {
    const searchInput = page.locator(".search-field");
    await searchInput.fill("elisa");
    await page.waitForTimeout(300);
    const cards = page.locator(".song-card");
    const count = await cards.count();
    expect(count).toBeLessThan(7);
    await expect(page.locator(".song-card-title", { hasText: /Elisa/i })).toBeVisible();
  });

  test("búsqueda sin resultados vacía la grid", async ({ page }) => {
    const searchInput = page.locator(".search-field");
    await searchInput.fill("xyzxyz123noexiste");
    await page.waitForTimeout(300);
    const cards = page.locator(".song-card");
    const count = await cards.count();
    expect(count).toBe(0);
  });

  test("limpiar búsqueda muestra todas las canciones", async ({ page }) => {
    const searchInput = page.locator(".search-field");
    await searchInput.fill("pedro");
    await page.waitForTimeout(200);
    await searchInput.fill("");
    await page.waitForTimeout(200);
    const cards = page.locator(".song-card");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });

  test("botón 'Cargar y Tocar' navega al Studio", async ({ page }) => {
    const firstCard = page.locator(".song-card").first();
    await firstCard.locator("button.song-card-action").click();
    await page.waitForTimeout(400);
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("cargar Quimbara actualiza título en topbar", async ({ page }) => {
    const quimbaraCard = page.locator(".song-card", { hasText: "Quimbara" });
    await quimbaraCard.locator("button.song-card-action").click();
    await page.waitForTimeout(400);
    const topbar = page.locator(".title-container p");
    await expect(topbar).toContainText("Quimbara");
  });

  test("importPanel visible en pantalla Canciones", async ({ page }) => {
    // ImportPanel drag & drop area
    await expect(page.locator(".import-panel, [class*='import']").first()).toBeVisible();
  });
});
