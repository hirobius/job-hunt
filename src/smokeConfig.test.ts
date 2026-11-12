import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// The post-deploy smoke test (#595) checks the live site, never a local build, and stays out of
// the local E2E run. Its workflow lives in docs/ci until Adrian copies it.
const config = fs.readFileSync('playwright.smoke.config.ts', 'utf8');
const e2eConfig = fs.readFileSync('playwright.config.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const workflow = fs.readFileSync('docs/ci/proposed-smoke.yml', 'utf8');
const visualEnv = JSON.parse(fs.readFileSync('e2e/visual-env.json', 'utf8')) as { image: string };

describe('post-deploy smoke test', () => {
  it('npm run smoke runs its own config against production by default', () => {
    expect(pkg.scripts.smoke).toBe('playwright test -c playwright.smoke.config.ts');
    expect(config).toContain("SMOKE_DEFAULT_URL = 'https://roleflame.vercel.app'");
    expect(config).toContain("testDir: './smoke'");
    expect(config).not.toMatch(/webServer\s*:/);
  });

  it('the local E2E run never reaches the smoke spec', () => {
    expect(e2eConfig).toContain("testDir: './e2e'");
    expect(fs.existsSync('smoke/production.spec.ts')).toBe(true);
  });

  it('the workflow runs on production deploys and alerts on failure', () => {
    expect(workflow).toMatch(/deployment_status:/);
    expect(workflow).toContain("github.event.deployment.environment == 'Production'");
    expect(workflow).toContain('npm run smoke');
    expect(workflow).toMatch(/if: failure\(\)[\s\S]*smoke-failure/);
    expect(workflow).toContain(`image: ${visualEnv.image}`);
  });
});
