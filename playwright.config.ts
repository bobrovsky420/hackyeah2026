import { defineConfig } from "@playwright/test";

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
    // E2E_CHANNEL picks another installed browser, such as "chrome" on a Mac without Edge.
    channel: process.env.CI ? undefined : (process.env.E2E_CHANNEL ?? "msedge"),
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
        // The journeys make no model calls: the canned route engine answers routes,
        // and the gate of the forms reads an empty replay recording, so it takes
        // its deterministic path. They send many requests from one address, above
        // the limits of FR-2.4, FR-6.4 and FR-12.14. The store stays in memory:
        // every run starts from the example entries and never touches the
        // developer's store file.
        env: {
          ROUTE_ENGINE: "canned",
          LLM_PROVIDER: "replay",
          LLM_REPLAY_DIR: ".local/playwright-replay",
          STORE_FILE: "memory",
          RATE_LIMIT_ROUTES_PER_MINUTE: "1000",
          GATE_REPEAT_LIMIT: "1000",
          ABUSE_LIMIT_CONTACTS_PER_DAY: "1000",
          ABUSE_LIMIT_READINESS_PER_DAY: "1000",
          ABUSE_LIMIT_IDEAS_PER_DAY: "1000",
          ABUSE_LIMIT_EVALUATIONS_PER_DAY: "1000",
          // The panel's code of the runs (tests/e2e/admin.ts); production keeps the panel locked without one.
          ROPS_TOKEN: "e2e-kod-rops",
        },
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
