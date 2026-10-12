import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Piano MIDI Pro.
 *
 * The app is a Vite SPA that lives in ./app and always serves on port 1234
 * (see app/vite.config.ts, strictPort: true).
 *
 * `webServer.reuseExistingServer` means an already-running dev server is used
 * as-is; otherwise Playwright boots one and tears it down afterwards.
 */
const PORT = 1234;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Each worker gets its own browser AND its own cold start: its own parse of
   * the 117-file demo catalogue plus its own audio-engine boot. Uncapped, four
   * workers starve one another and healthy tests start failing on
   * `waitForLibrary` timeouts instead of on real regressions. Two keeps the
   * suite parallel without inventing failures.
   */
  workers: process.env.CI ? 1 : 2,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // WebAudio needs an audio output device in headless Chromium; the fake
    // device + autoplay flag let Tone.js start without a user gesture.
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--mute-audio",
      ],
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } },
    },
  ],

  webServer: {
    command: "npm run dev",
    cwd: "./app",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
