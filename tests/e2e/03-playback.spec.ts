import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import path from "node:path";

test.describe.configure({ timeout: 180_000 });

/**
 * The app boots with NO song loaded ("Sin canción cargada", "0:00 / 0:00") and
 * `startPlayback()` returns early while `song.notes` is empty, so every test
 * that asserts real transport behaviour must load a song first.
 *
 * We use the app's own "Cargar MIDI" input with a MIDI fixture that ships in
 * `app/public/demo/`: it is the same real load path a user takes, it resolves
 * in well under a second, and it keeps this spec independent from the demo
 * library parse (that path is covered by 06-songs-library).
 */
const MIDI_FIXTURE = path.join(
  __dirname,
  "..",
  "..",
  "app",
  "public",
  "demo",
  "fur_elise.mid",
);

async function loadSong(page: Page): Promise<Locator> {
  const topbar = page.locator(".title-container p");
  await expect(topbar).toContainText("Sin canción cargada");

  await page
    .locator('input[aria-label="Cargar archivo MIDI"]')
    .setInputFiles(MIDI_FIXTURE);

  await expect(topbar).not.toContainText("Sin canción cargada");
  await expect
    .poll(
      async () =>
        Number(
          await page.locator(".seeker-container input[type=range]").getAttribute("max"),
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  return topbar;
}

test.describe("Reproducción — play / pause / stop / BPM / seek", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();
  });

  test("sin canción cargada el transporte no arranca", async ({ page }) => {
    await expect(page.locator(".title-container p")).toContainText("Sin canción cargada");
    await expect(page.locator(".time-display")).toHaveText(/^0:00\s*\/\s*0:00$/);
    // The seeker has no range until a song is loaded
    await expect(page.locator(".seeker-container input[type=range]")).toHaveAttribute(
      "max",
      "0",
    );

    // Clicking play without a song must not start the transport
    await page.locator(".playback-bar .btn.primary").first().click();
    await expect(page.locator(".playback-bar .btn.primary").first()).toContainText(
      "Reproducir",
    );
    await expect(page.locator(".time-display")).toHaveText(/^0:00\s*\/\s*0:00$/);
  });

  test("botón play visible y habilitado inicialmente", async ({ page }) => {
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    await expect(playBtn).toBeVisible();
    await expect(playBtn).not.toBeDisabled();
    await expect(playBtn).toContainText("Reproducir");
  });

  test("play → botón cambia a Pausa", async ({ page }) => {
    await loadSong(page);
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    await playBtn.click();
    await expect(playBtn).toContainText("Pausa");
    await page.locator(".playback-bar button", { hasText: "Detener" }).click();
    await expect(playBtn).toContainText("Reproducir");
  });

  test("pausa → botón vuelve a Reproducir y el tiempo se congela", async ({ page }) => {
    await loadSong(page);
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    const seeker = page.locator(".seeker-container input[type=range]");

    await playBtn.click();
    await expect(playBtn).toContainText("Pausa");
    await expect
      .poll(async () => Number(await seeker.inputValue()), { timeout: 45_000 })
      .toBeGreaterThan(0);

    await playBtn.click(); // pause
    await expect(playBtn).toContainText("Reproducir");
    const frozen = Number(await seeker.inputValue());
    await page.waitForTimeout(700);
    expect(Number(await seeker.inputValue())).toBeCloseTo(frozen, 3);
  });

  test("Detener → tiempo vuelve a 0:00", async ({ page }) => {
    await loadSong(page);
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    const seeker = page.locator(".seeker-container input[type=range]");

    await playBtn.click();
    await expect
      .poll(async () => Number(await seeker.inputValue()), { timeout: 45_000 })
      .toBeGreaterThan(0);

    await page.locator(".playback-bar button", { hasText: "Detener" }).click();
    const timeDisplay = page.locator(".time-display");
    await expect(timeDisplay).toHaveText(/^0:00\s*\/\s*\d+:\d{2}$/);
    await expect.poll(async () => await seeker.inputValue()).toBe("0");
    await expect(playBtn).toContainText("Reproducir");
  });

  test("time display formato M:SS / M:SS", async ({ page }) => {
    await loadSong(page);
    const timeDisplay = page.locator(".time-display");
    await expect(timeDisplay).toBeVisible();
    const text = await timeDisplay.innerText();
    expect(text).toMatch(/^\d+:\d{2}\s*\/\s*\d+:\d{2}$/);
    // A song is loaded, so the total duration must not be 0:00
    expect(text).not.toMatch(/\/\s*0:00$/);
  });

  test("seeker slider arrastrable avanza tiempo", async ({ page }) => {
    await loadSong(page);
    const seeker = page.locator(".seeker-container input[type=range]");
    await expect(seeker).toBeVisible();
    const max = await seeker.getAttribute("max");
    expect(Number(max)).toBeGreaterThan(0);

    const box = await seeker.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Drag the thumb from 20% to 60% of the track
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, {
        steps: 8,
      });
      await page.mouse.up();
      await expect
        .poll(async () => Number(await seeker.inputValue()), { timeout: 10_000 })
        .toBeGreaterThan(Number(max) * 0.3);
    }
  });

  test("BPM input actualiza tempo", async ({ page }) => {
    await loadSong(page);
    const bpmInput = page.locator(".playback-bar input[type=number]");
    await expect(bpmInput).toBeVisible();
    const original = await bpmInput.inputValue();
    expect(Number(original)).toBeGreaterThan(0);

    // Pick a tempo that differs from the song's own BPM so the assertion is real
    const target = original === "120" ? "90" : "120";
    await bpmInput.fill(target);
    await bpmInput.press("Enter");
    await expect(bpmInput).toHaveValue(target);
    expect(target).not.toBe(original);
  });

  test("botón Metrónomo activa/desactiva", async ({ page }) => {
    const metBtn = page.locator("button", { hasText: "Metrónomo" });
    await expect(metBtn).toBeVisible();
    await metBtn.click();
    // Metric card should say ON
    const metCard = page.locator(".metric-card", { hasText: "Metrónomo" });
    await expect(metCard).toContainText("ON");
    await metBtn.click();
    await expect(metCard).toContainText("OFF");
  });

  test("reproducción avanza el tiempo", async ({ page }) => {
    await loadSong(page);
    const playBtn = page.locator(".playback-bar .btn.primary").first();
    const seeker = page.locator(".seeker-container input[type=range]");
    await playBtn.click();
    await expect(playBtn).toContainText("Pausa");
    await expect
      .poll(async () => Number(await seeker.inputValue()), { timeout: 45_000 })
      .toBeGreaterThan(0);
    await page.locator(".playback-bar button", { hasText: "Detener" }).click();
    await expect(playBtn).toContainText("Reproducir");
  });
});
