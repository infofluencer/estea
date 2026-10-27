import { defineConfig, devices } from "@playwright/test"
import { assertStagingFrontendUrl, stagingFrontendUrl } from "./utils/env"

assertStagingFrontendUrl()

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: stagingFrontendUrl(),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /5-responsive/,
    },
    {
      name: "mobile",
      // Chromium + iPhone viewport (avoids separate WebKit install)
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
      testMatch: /5-responsive/,
    },
  ],
})
