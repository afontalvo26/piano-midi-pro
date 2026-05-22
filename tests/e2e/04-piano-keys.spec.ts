import { test, expect } from "@playwright/test";

test.describe("Teclado Piano — teclas, rango, minimap", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("teclas blancas visibles (al menos 22)", async ({ page }) => {
    const whiteKeys = page.locator(".piano-key-element.white");
    const count = await whiteKeys.count();
    expect(count).toBeGreaterThanOrEqual(22);
  });

  test("teclas negras visibles (al menos 10)", async ({ page }) => {
    const blackKeys = page.locator(".piano-key-element.black");
    const count = await blackKeys.count();
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test("rango inicial muestra C3", async ({ page }) => {
    const badge = page.locator(".range-header-badge");
    await expect(badge).toContainText("C3");
  });

  test("rango inicial muestra C6", async ({ page }) => {
    const badge = page.locator(".range-header-badge");
    await expect(badge).toContainText("C6");
  });

  test("click en tecla blanca activa clase active-press", async ({ page }) => {
    const firstWhite = page.locator(".piano-key-element.white").first();
    await firstWhite.dispatchEvent("mousedown");
    await page.waitForTimeout(100);
    await expect(firstWhite).toHaveClass(/active-press/);
    await firstWhite.dispatchEvent("mouseup");
    await page.waitForTimeout(100);
    await expect(firstWhite).not.toHaveClass(/active-press/);
  });

  test("click en tecla negra activa clase active-press", async ({ page }) => {
    const firstBlack = page.locator(".piano-key-element.black").first();
    await firstBlack.dispatchEvent("mousedown");
    await page.waitForTimeout(100);
    await expect(firstBlack).toHaveClass(/active-press/);
    await firstBlack.dispatchEvent("mouseup");
    await page.waitForTimeout(100);
    await expect(firstBlack).not.toHaveClass(/active-press/);
  });

  test("minimap interactivo está presente", async ({ page }) => {
    const minimap = page.locator(".keyboard-minimap.minimap-interactive");
    await expect(minimap).toBeVisible();
  });

  test("minimap contiene teclas in-range", async ({ page }) => {
    const inRangeKeys = page.locator(".minimap-key.in-range");
    const count = await inRangeKeys.count();
    expect(count).toBeGreaterThan(0);
  });

  test("arrastrar minimap cambia el rango", async ({ page }) => {
    const badge = page.locator(".range-header-badge");
    const initialText = await badge.innerText();

    const minimap = page.locator(".keyboard-minimap.minimap-interactive");
    const box = await minimap.boundingBox();
    if (box) {
      // Drag from center to right
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    const newText = await badge.innerText();
    // Range should have changed
    expect(newText).not.toBe(initialText);
  });

  test("nota activa actualiza métrica 'Notas activas'", async ({ page }) => {
    const firstWhite = page.locator(".piano-key-element.white").nth(5);
    const metricCard = page.locator(".metric-card", { hasText: "Notas activas" });
    await firstWhite.dispatchEvent("mousedown");
    await page.waitForTimeout(200);
    const txt = await metricCard.locator("strong").innerText();
    expect(Number(txt)).toBeGreaterThan(0);
    await firstWhite.dispatchEvent("mouseup");
  });

  test("teclas muestran etiquetas de notas", async ({ page }) => {
    // By default showNoteNames = "name"
    const label = page.locator(".piano-key-label").first();
    await expect(label).toBeVisible();
  });
});
