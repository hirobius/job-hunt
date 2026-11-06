// The visual baselines' environment is pinned (#485): one Playwright image by digest, the Chromium it
// runs, and the scripts that only draw there. #476 re-took them in another render and flipped every PNG.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const env = JSON.parse(readFileSync('e2e/visual-env.json', 'utf8')) as {
  image: string;
  chromium: string;
};
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};
const spec = readFileSync('e2e/visual.spec.ts', 'utf8');

describe('visual baseline environment', () => {
  it('is one Playwright image, by digest, on the Playwright version the repo pins', () => {
    const m = env.image.match(
      /^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}$/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toBe(pkg.devDependencies['@playwright/test']);
    expect(env.chromium).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('runs the visual spec only through the Docker runner', () => {
    expect(pkg.scripts['test:visual']).toBe('node scripts/visual-docker.mjs');
    expect(pkg.scripts['verify:ui']).toContain('npm run test:visual');
    expect(pkg.scripts['verify:ui']).not.toContain('e2e/visual.spec.ts');
    expect(readFileSync('scripts/visual-docker.mjs', 'utf8')).toContain(
      'RJB_VISUAL_IMAGE=${image}',
    );
  });

  it('refuses to draw anywhere else: skips outside the image, fails an update there', () => {
    expect(spec).toContain("import visualEnv from './visual-env.json'");
    expect(spec).toMatch(
      /process\.env\.RJB_VISUAL_IMAGE === visualEnv\.image && browser\.version\(\) === visualEnv\.chromium/,
    );
    expect(spec).toMatch(/if \(updating\) throw new Error/);
    expect(spec).toContain('testInfo.skip(true, where)');
  });
});
