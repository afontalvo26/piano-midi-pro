import { test, expect } from "@playwright/test";
import path from "node:path";

const MIDI_FIXTURE = path.join(__dirname, "..", "..", "app", "public", "demo", "fur_elise.mid");

/**
 * Forces Chromium to actually render the audio graph.
 *
 * Two environment facts make this necessary, and both were measured rather than
 * guessed:
 *
 *   • Headless Chromium has no audio device, and with `--mute-audio` (which
 *     playwright.config sets for the whole suite) Chromium decides the graph
 *     cannot be heard and never pulls it. The trap is that it does *not* report
 *     that: `AudioContext.state` stays `"running"` while `currentTime` freezes
 *     at ~0.28 s. The Transport then never leaves "stopped", because its clock
 *     is that same frozen time.
 *   • Attaching an `AudioWorkletNode` with a real processor and keeping it alive
 *     makes the render thread run, so the clock advances normally.
 *
 * So: an init script replaces the context's `destination` with a
 * `MediaStreamAudioDestinationNode` and routes every `connect(destination)`
 * through a live worklet tap, then on to the real destination. The app is
 * untouched — it connects to what it believes is the output — and the audio
 * clock behaves as it does on a machine with speakers.
 */
const RENDER_FORCER = `(() => {
  if (window.__RENDER_FORCED) return;
  window.__RENDER_FORCED = true;

  let real = null;
  let bridge = null;
  const realConnect = AudioNode.prototype.connect;

  AudioNode.prototype.connect = function (dest, ...rest) {
    if (bridge && dest === bridge && real) return realConnect.call(this, real, ...rest);
    return realConnect.call(this, dest, ...rest);
  };

  Object.defineProperty(AudioContext.prototype, "destination", {
    configurable: true,
    get() {
      if (bridge) return bridge;
      real = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination").get.call(this);
      try {
        bridge = this.createMediaStreamDestination();
        realConnect.call(bridge, real);
      } catch (e) {
        bridge = real;
      }
      return bridge;
    },
  });
})();`;

/**
 * Regression guard for `startTransportMusic`.
 *
 * The transport is deliberately started a moment in the future so its first
 * events are not already past due. That opens a failure mode worth pinning
 * down: if the start were lost while the clock has not reached that moment yet,
 * playback would silently never begin. This asserts the clock really advances
 * after a play, a pause/resume and a seek — the three paths that start the
 * transport.
 *
 * ── Why this is skipped by default ────────────────────────────────────────
 * It only means anything on a machine where the audio graph is actually
 * rendered, and the suite's Chromium is not:
 *
 *   • `playwright.config.ts` launches with `--mute-audio`, and headless
 *     Chromium has no output device, so Chromium skips rendering the graph.
 *   • It does not say so. `AudioContext.state` stays `"running"` while
 *     `currentTime` freezes around 0.28 s, which means Tone's Transport can
 *     never leave `"stopped"` — its clock is that same frozen time.
 *
 * Every assertion below therefore fails on environment, not on code, and the
 * failure looks exactly like a real regression. Run it deliberately, with a
 * device available:
 *
 *     npx playwright test 10-transport-avanza --headed
 *
 * (With `--headed` the window still inherits `--mute-audio`, so an audible
 * device is only guaranteed when the flag is removed; see the note below.)
 */
test.describe("Transport arranca y avanza", () => {
  test.describe.configure({ timeout: 180_000 });

  test.skip(
    process.env.PMP_AUDIO_TESTS !== "1",
    "necesita un dispositivo de audio real: correr con PMP_AUDIO_TESTS=1",
  );

  test("el reloj avanza tras play, pausa/reanudar y seek", async ({ page }) => {
    await page.addInitScript(RENDER_FORCER);
    await page.goto("/");
    await expect(page.locator(".studio-workspace")).toBeVisible();

    // Sanity check on the harness itself: if the audio clock is frozen, every
    // assertion below would fail for environment reasons rather than code ones.
    const clockAdvances = await page.evaluate(async () => {
      const probe = new AudioContext();
      const t0 = probe.currentTime;
      await new Promise((r) => setTimeout(r, 400));
      const moved = probe.currentTime > t0;
      void probe.close();
      return moved;
    });
    expect(clockAdvances, "el reloj de audio no avanza: entorno sin render").toBe(true);

    await page
      .locator('input[aria-label="Cargar archivo MIDI"]')
      .setInputFiles(MIDI_FIXTURE);

    const seeker = page.locator(".seeker-container input[type=range]");
    await expect
      .poll(async () => Number(await seeker.getAttribute("max")), { timeout: 30_000 })
      .toBeGreaterThan(0);

    const playBtn = page.locator(".playback-bar .btn.primary").first();
    const position = async () => Number(await seeker.inputValue());

    // ── play ──
    await playBtn.click();
    await expect(playBtn).toContainText("Pausa");
    await expect
      .poll(position, { timeout: 30_000, message: "el reloj no avanzó tras play" })
      .toBeGreaterThan(0.2);

    // ── pause / resume ──
    const atPause = await position();
    await playBtn.click();
    await expect(playBtn).toContainText("Reproducir");
    await page.waitForTimeout(800);
    expect(await position()).toBeCloseTo(atPause, 1);

    await playBtn.click();
    await expect(playBtn).toContainText("Pausa");
    await expect
      .poll(position, { timeout: 30_000, message: "el reloj no avanzó tras reanudar" })
      .toBeGreaterThan(atPause + 0.2);

    // ── seek while playing ──
    const seekerInput = page.locator(".seeker-container input[type=range]");
    await seekerInput.fill("30");
    await expect
      .poll(position, { timeout: 30_000, message: "el reloj no avanzó tras el seek" })
      .toBeGreaterThan(30.1);

    await page.locator(".playback-bar button", { hasText: "Detener" }).click();
    await expect(playBtn).toContainText("Reproducir");
  });
});
