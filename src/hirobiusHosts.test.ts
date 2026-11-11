// job-hunt#567: every @hirobius lockfile entry resolves from its expected host, and .npmrc has no
// @hirobius scope mapping (design-system is on public npm; GitHub Packages trails it).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXPECTED_HOST: Record<string, string> = {
  '@hirobius/design-system': 'registry.npmjs.org',
  '@hirobius/hds-toolkit': 'npm.pkg.github.com',
};

describe('@hirobius registry hosts (job-hunt#567)', () => {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const entries = Object.entries(lock.packages as Record<string, { resolved?: string; link?: boolean }>)
    .filter(([path]) => /(^|\/)node_modules\/@hirobius\//.test(path));

  it('finds the @hirobius packages', () => {
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it.each(entries)('%s resolves from its expected host', (path, entry) => {
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    expect(EXPECTED_HOST, `no expected host for ${name}`).toHaveProperty([name]);
    expect(new URL(entry.resolved ?? '').hostname).toBe(EXPECTED_HOST[name]);
  });

  it('.npmrc does not map the @hirobius scope', () => {
    const rc = readFileSync('.npmrc', 'utf8').replace(/^\s*[#;].*$/gm, '');
    expect(rc).not.toMatch(/@hirobius:registry/);
  });
});
