import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Los sliders del panel izquierdo son cuatro `.sustain-section` consecutivas:
 *   0 = Sustain, 1 = Volumen, 2 = Transponer, 3 = Velocidad click.
 *
 * Antes el spec apuntaba a `.sustain-section:nth-child(1)`, que ya no coincide
 * con nada: ese panel empieza con `.range-header-row` y el minimap, así que la
 * primera `.sustain-section` nunca es el primer hijo de su contenedor.
 */
function sectionTrack(page: Page, index: number) {
  return page.locator(".sustain-section").nth(index).locator(".sustain-track");
}

/** Arrastra un `.sustain-track` custom (DIV, no <input>) a una fracción 0..1 */
async function dragTrack(page: Page, index: number, fraction: number) {
  const track = sectionTrack(page, index);
  await expect(track).toBeVisible();
  await track.scrollIntoViewIfNeeded();
  const box = await track.boundingBox();
  if (!box) throw new Error(`Sustain track ${index} has no bounding box`);
  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
}

test.describe("Sliders — sustain, volumen, transposición, velocidad", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("slider Sustain badge muestra segundos", async ({ page }) => {
    const badge = page.locator(".sustain-badge").first();
    await expect(badge).toBeVisible();
    const text = await badge.innerText();
    expect(text).toMatch(/\d+\.\d+s/);
  });

  test("arrastrar slider Sustain cambia valor", async ({ page }) => {
    const badge = page.locator(".sustain-badge").first();
    const initial = await badge.innerText();

    await dragTrack(page, 0, 0.9);

    const updated = await badge.innerText();
    expect(updated).not.toBe(initial);
    await expect(badge).toHaveText(/[1-5]\.\d+s/);
  });

  test("slider Volumen badge muestra porcentaje", async ({ page }) => {
    // Second .sustain-section is volume
    const badges = page.locator(".sustain-badge");
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(2);
    // volume badge shows % or Mute
    const volBadge = badges.nth(1);
    await expect(volBadge).toBeVisible();
    const text = await volBadge.innerText();
    expect(text).toMatch(/\d+%|Mute/);
  });

  test("arrastrar slider Volumen a 0 muestra Mute", async ({ page }) => {
    await dragTrack(page, 1, 0);

    const volBadge = page.locator(".sustain-badge").nth(1);
    await expect(volBadge).toContainText("Mute");
  });

  test("slider Transponer badge muestra semitonos", async ({ page }) => {
    // Third .sustain-section = transpose
    const transposeBadge = page.locator(".sustain-badge").nth(2);
    await expect(transposeBadge).toBeVisible();
    const text = await transposeBadge.innerText();
    expect(text).toMatch(/[+-]?\d+\s*st/);
  });

  test("arrastrar slider Transponer cambia valor", async ({ page }) => {
    const transposeBadge = page.locator(".sustain-badge").nth(2);
    const initial = await transposeBadge.innerText();

    await dragTrack(page, 2, 0.9);

    const updated = await transposeBadge.innerText();
    expect(updated).not.toBe(initial);
    await expect(transposeBadge).toContainText("+10 st");
  });

  test("transponer actualiza métrica en panel derecho", async ({ page }) => {
    const metric = page.locator(".metric-card", { hasText: "Transponer" });
    await expect(metric).toBeVisible();
    await expect(metric).toContainText("0 st");

    await dragTrack(page, 2, 0.9);
    await expect(metric).toContainText("+10 st");
  });

  test("slider Velocidad click muestra valor 0-127", async ({ page }) => {
    // Fourth .sustain-section = mouse velocity
    const velBadge = page.locator(".sustain-badge").nth(3);
    await expect(velBadge).toBeVisible();
    const text = await velBadge.innerText();
    const num = parseInt(text);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThanOrEqual(127);
  });
});
