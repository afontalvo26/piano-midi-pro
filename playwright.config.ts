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
  /** Keep parallel cold audio starts bounded so workers do not starve each other. */
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
