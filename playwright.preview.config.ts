import { defineConfig, devices } from "@playwright/test";

/** Focal Studio checks against a freshly built app, never Vite's dev graph. */
const baseURL = "http://localhost:1237";

export default defineConfig({
  testDir: "./tests/production",
  workers: 1,
  reporter: [["list"]],
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--mute-audio",
      ],
    },
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 900 } },
  }],
  webServer: {
    command: "npx vite preview --port 1237 --strictPort",
    cwd: "./app",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
