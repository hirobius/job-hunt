// Dependency policy (hirobius/ops#1081, npm port of ops#939 / folio#184): every direct dependency is
// an exact version, package-lock.json resolves only from the npm / GitHub Packages registries, and
// .npmrc sets save-exact=true. The gate is scripts/check-exact-pins.mjs (`npm run check:exact-pins`);
// these tests prove it fires on the violating fixture and passes on the repo itself.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const script = resolve(root, 'scripts/check-exact-pins.mjs');
const fixture = (name: string) => resolve(root, `scripts/fixtures/check-exact-pins/${name}.json`);
const run = (fixtureFile = '') =>
  spawnSync(process.execPath, [script, '--root', root], {
    env: { ...process.env, FIXTURE_FILE: fixtureFile },
    encoding: 'utf8',
  });

describe('check-exact-pins (ops#1081)', () => {
  it('passes the passing fixture (exact pins, registry tarballs, save-exact)', () => {
    const r = run(fixture('pass'));
    expect(r.status, r.stderr).toBe(0);
  });

  it('fails the violating fixture and names each violation', () => {
    const r = run(fixture('violate'));
    expect(r.status).toBe(1);
    for (const s of ['react', 'evil', 'odd', 'save-exact=true']) expect(r.stderr).toContain(s);
  });

  it('this repo passes: exact pins, registry-only lockfile, save-exact=true', () => {
    const r = run();
    expect(r.status, r.stderr).toBe(0);
  });
});
