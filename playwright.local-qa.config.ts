import { defineConfig, devices } from "@playwright/test";

const origin = process.env.SELAN_E2E_APP_ORIGIN ?? "http://127.0.0.1:3001";
if (origin !== "http://127.0.0.1:3001") {
  throw new Error("Local QA tests must use the isolated app on port 3001");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Europe/Ljubljana",
  },
  projects: [
    { name: "desktop-chrome-local", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chrome-local", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3001",
    url: `${origin}/login`,
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 120_000,
  },
});
