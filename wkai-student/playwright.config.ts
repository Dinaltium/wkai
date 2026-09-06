import { defineConfig, devices } from "@playwright/test";
import { STUDENT_URL } from "../e2e/harness/stack.mjs";

/**
 * Browser end-to-end tests for the student app.
 *
 * The stack (Postgres, Redis, the backend, and the Vite dev server) is brought
 * up by e2e/global-setup.ts through the shared harness rather than by
 * Playwright's `webServer`, so the backend is guaranteed to be answering before
 * the dev server is ever pointed at it — and so the API suite and this one boot
 * an identical stack.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  // One worker: the tests share a single backend, and the join route is rate
  // limited to 10 attempts a minute per IP. Parallel workers would race each
  // other into a 429 that has nothing to do with the code under test.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: STUDENT_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
