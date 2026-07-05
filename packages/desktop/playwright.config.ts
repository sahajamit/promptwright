import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000, // 5 minutes per test (AI execution can take 2-3 min)
  expect: {
    timeout: 30_000, // 30s for assertions
  },
  retries: 0, // No retries - AI-dependent tests need investigation on failure
  workers: 1, // Serial execution - app uses requestSingleInstanceLock()
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],
  projects: [
    {
      name: "smoke",
      testDir: "./e2e/smoke",
      timeout: 120_000, // 2 minutes for smoke tests
    },
    {
      name: "execution",
      testDir: "./e2e/execution",
      timeout: 300_000, // 5 minutes for full execution tests
    },
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
