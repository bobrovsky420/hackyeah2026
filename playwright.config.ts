import { defineConfig } from "@playwright/test";
import { CONSOLE_TOKEN } from "./tests/e2e/screens";

const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/*
 * Quality gates of the specification (9.6, 12.2, 13): journeys on the mock
 * data, the axe check of every screen in the three themes, and the
 * screenshots for the design reviews. The app runs as a production build;
 * set E2E_BASE_URL to test a server that is already running.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Generous: right after a build, OneDrive syncing .next can slow the local
  // server to seconds per request, and the tests run in parallel.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: ".local/playwright-report", open: "never" }]],
  outputDir: ".local/playwright-results",
  use: {
    baseURL,
    locale: "pl-PL",
    // The team's machines have Edge; CI installs Playwright's Chromium instead.
    channel: process.env.CI ? undefined : "msedge",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "e2e", testMatch: /(journeys|features)\.spec\.ts/ },
    { name: "a11y", testMatch: /accessibility\.spec\.ts/ },
    { name: "screenshots", testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next build && npx next start --port ${PORT}`,
        // A production server without ROPS_TOKEN keeps the console locked; the
        // tests create many routes from one address, above the limit of FR-2.4.
        env: { ROPS_TOKEN: CONSOLE_TOKEN, RATE_LIMIT_ROUTES_PER_MINUTE: "1000" },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
