import { defineConfig, devices } from "@playwright/test";

/**
 * Local-only e2e config: identical to playwright.config.ts but WITHOUT the
 * webServer build step. Use it when the production build already exists:
 *
 *   bun run build            # once (needs RAM; run nothing else alongside)
 *   # start prod on :3100, then:
 *   bunx playwright test -c playwright.local.config.ts
 *
 * CI uses playwright.config.ts (build + serve + test in one).
 */
export default defineConfig({
  testDir: "./apps/web/tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"]],
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
  ]
});
