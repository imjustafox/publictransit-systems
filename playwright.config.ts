import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const port = 3000;

export default defineConfig({
  forbidOnly: isCI,
  fullyParallel: true,
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        headless: true,
      },
    },
  ],
  reporter: "list",
  testDir: "./tests",
  testMatch: /.*\.test\.ts/,
  timeout: 180 * 1_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `rm -rf .next/standalone/.next/static .next/standalone/public && mkdir -p .next/standalone/.next && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public && HOSTNAME=127.0.0.1 PORT=${port} node .next/standalone/server.js`,
    reuseExistingServer: !isCI,
    timeout: 120 * 1_000,
    url: `http://127.0.0.1:${port}`,
  },
});
