import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// E2E config. Spins up the Vite dev server, runs specs in e2e/ against Chromium.
// PW_CHROMIUM_PATH (optional) points at a pre-installed Chromium when Playwright's own
// pinned build isn't downloaded. Unset or missing, cloud sessions' stable link is used
// (/opt/pw-browsers/chromium: the versioned folder behind it moves with each image, #315),
// else Playwright's own browser.
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = [process.env.PW_CHROMIUM_PATH, CLOUD_CHROMIUM].find(
  (p): p is string => !!p && existsSync(p),
);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // Screenshot baselines (e2e/visual.spec.ts, docs/guardrails.md): tight enough that a 4px
  // spacing shift fails, loose enough for anti-aliasing noise between runs.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    launchOptions: { executablePath },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // The production build, for specs that time the app (e2e/feedback.spec.ts, PROD_URL): the
    // dev server's StrictMode double renders and unbundled modules took presses past 300 ms
    // under parallel load that the shipped build answers in ~100 ms.
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
