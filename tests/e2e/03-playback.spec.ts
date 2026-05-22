import { test, expect } from "@playwright/test";

test.describe("Reproducción — play / pause / stop / BPM / seek", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("botón play visible y habilitado inicialmente", async ({ page }) => {
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    await expect(playBtn).toBeVisible();
    await expect(playBtn).not.toBeDisabled();
    await expect(playBtn).toContainText("Reproducir");
  });

  test("play → botón cambia a Pausa", async ({ page }) => {
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    await playBtn.click();
    await page.waitForTimeout(600);
    await expect(playBtn).toContainText("Pausa");
    await page.locator("button", { hasText: "Detener" }).click();
  });

  test("pausa → botón vuelve a Reproducir", async ({ page }) => {
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    await playBtn.click();
    await page.waitForTimeout(400);
    await playBtn.click(); // pause
    await page.waitForTimeout(300);
    await expect(playBtn).toContainText("Reproducir");
  });

  test("Detener → tiempo vuelve a 0:00", async ({ page }) => {
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    await playBtn.click();
    await page.waitForTimeout(800);
    await page.locator("button", { hasText: "Detener" }).click();
    await page.waitForTimeout(300);
    const timeDisplay = page.locator(".time-display");
    await expect(timeDisplay).toContainText("0:00");
  });

  test("time display formato M:SS / M:SS", async ({ page }) => {
    const timeDisplay = page.locator(".time-display");
    await expect(timeDisplay).toBeVisible();
    const text = await timeDisplay.innerText();
    expect(text).toMatch(/\d+:\d{2}\s*\/\s*\d+:\d{2}/);
  });

  test("seeker slider arrastrable avanza tiempo", async ({ page }) => {
    const seeker = page.locator(".seeker-container input[type=range]");
    await expect(seeker).toBeVisible();
    const max = await seeker.getAttribute("max");
    expect(Number(max)).toBeGreaterThan(0);
    const box = await seeker.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
      await page.waitForTimeout(300);
      const val = await seeker.inputValue();
      expect(Number(val)).toBeGreaterThan(0);
    }
  });

  test("BPM input actualiza tempo", async ({ page }) => {
    const bpmInput = page.locator("input[type=number]").first();
    await expect(bpmInput).toBeVisible();
    await bpmInput.fill("120");
    await bpmInput.press("Enter");
    await page.waitForTimeout(200);
    const val = await bpmInput.inputValue();
    expect(Number(val)).toBe(120);
  });

  test("botón Metrónomo activa/desactiva", async ({ page }) => {
    const metBtn = page.locator("button", { hasText: "Metrónomo" });
    await expect(metBtn).toBeVisible();
    await metBtn.click();
    await page.waitForTimeout(300);
    // Metric card should say ON
    const metCard = page.locator(".metric-card", { hasText: "Metrónomo" });
    await expect(metCard).toContainText("ON");
    await metBtn.click();
    await page.waitForTimeout(200);
    await expect(metCard).toContainText("OFF");
  });

  test("reproducción avanza el tiempo", async ({ page }) => {
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    const seeker = page.locator(".seeker-container input[type=range]");
    await playBtn.click();
    await page.waitForTimeout(1500);
    const val = await seeker.inputValue();
    expect(Number(val)).toBeGreaterThan(0);
    await page.locator("button", { hasText: "Detener" }).click();
  });
});
