import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Post-deploy smoke test (#595): a light check of the LIVE site, not the local build.
// `npm run smoke` reads SMOKE_URL (default: production). No web server starts: nothing is built or
// served here. Kept apart from playwright.config.ts (testDir e2e), so `npm run test:e2e` never
// reaches production. Runbook: docs/ci/smoke-and-rollback.md.
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = [process.env.PW_CHROMIUM_PATH, CLOUD_CHROMIUM].find(
  (p): p is string => !!p && existsSync(p),
);

export const SMOKE_DEFAULT_URL = 'https://roleflame.vercel.app';

export default defineConfig({
  testDir: './smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry: a live site over a real network can drop one request.
  retries: 1,
  timeout: 45_000,
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'smoke-results.json' }]] : 'list',
  use: {
    baseURL: process.env.SMOKE_URL || SMOKE_DEFAULT_URL,
    trace: 'off',
    launchOptions: { executablePath },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
