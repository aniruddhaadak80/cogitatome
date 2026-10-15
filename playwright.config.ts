import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a production build, so the suite validates exactly what a
 * visitor hits on the deployed URL. `bun run build && bun run start` is wired in
 * via the webServer command.
 */
export default defineConfig({
  testDir: "./apps/web/tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"]] : [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    video: "off"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] }
    }
  ],
  webServer: {
    // NOTE: `bun run start` at the root goes through turbo, which rejects
    // extra args — so the server builds and starts from apps/web directly.
    // `cwd` keeps this working on PowerShell and sh alike.
    cwd: "apps/web",
    command: "bun run build && bun run start -- --port 3100",
    url: "http://127.0.0.1:3100/healthz",
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe"
  }
});
