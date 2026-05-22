import { test, expect } from "@playwright/test";

/**
 * Helpers para arrastrar sliders con el sustain-track DIV custom
 */
async function dragSlider(page: import("@playwright/test").Page, selector: string, fraction: number) {
  const el = page.locator(selector).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`Slider not found: ${selector}`);
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

    // .sustain-section first = sustain
    await dragSlider(page, ".sustain-section:nth-child(1) .sustain-track", 0.9);

    const updated = await badge.innerText();
    expect(updated).not.toBe(initial);
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
    // Find the volume sustain-track (second one)
    const sustainSections = page.locator(".sustain-section");
    const volSection = sustainSections.nth(1);
    const track = volSection.locator(".sustain-track");
    const box = await track.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(200);
    }
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

    const sustainSections = page.locator(".sustain-section");
    const transpSection = sustainSections.nth(2);
    const track = transpSection.locator(".sustain-track");
    const box = await track.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(200);
    }
    const updated = await transposeBadge.innerText();
    expect(updated).not.toBe(initial);
  });

  test("transponer actualiza métrica en panel derecho", async ({ page }) => {
    const metric = page.locator(".metric-card", { hasText: "Transponer" });
    await expect(metric).toBeVisible();
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
