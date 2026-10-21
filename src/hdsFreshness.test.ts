// HDS freshness guardrail (redesign-mobile): the installed design system may trail the latest
// published HDS by at most one minor. The latest is the checked-in record `hds-version.json`,
// refreshed by `npm run hds:check` (the only network read), so this test stays offline and
// deterministic in the Vercel build. See docs/guardrails.md.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const PKG = '@hirobius/design-system';

const readJson = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

/** [major, minor, patch] of a plain x.y.z version. */
function parse(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`not an x.y.z version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Minor releases between installed and latest; a newer major counts as far behind. */
function minorsBehind(installed: string, latest: string): number {
  const [iMaj, iMin] = parse(installed);
  const [lMaj, lMin] = parse(latest);
  if (lMaj !== iMaj) return lMaj > iMaj ? Infinity : -Infinity;
  return lMin - iMin;
}

describe('HDS freshness', () => {
  const record = readJson('hds-version.json') as {
    package: string;
    latest: string;
    checkedAt: string;
  };
  const installed = (readJson(`node_modules/${PKG}/package.json`) as { version: string }).version;

  it('the record names HDS and an x.y.z latest version', () => {
    expect(record.package).toBe(PKG);
    expect(() => parse(record.latest)).not.toThrow();
    expect(Number.isNaN(Date.parse(record.checkedAt))).toBe(false);
  });

  it('installed HDS is at most one minor behind the latest published (hds-version.json)', () => {
    const behind = minorsBehind(installed, record.latest);
    expect(
      behind,
      `HDS ${installed} is ${behind} minors behind ${record.latest}: upgrade with ` +
        '`npx @hirobius/design-system@latest upgrade`',
    ).toBeLessThanOrEqual(1);
  });

  it('the record is not older than the installed HDS (run `npm run hds:check`)', () => {
    expect(minorsBehind(installed, record.latest)).toBeGreaterThanOrEqual(0);
  });

  it('package.json pins the version that is installed', () => {
    expect(
      (readJson('package.json') as { dependencies: Record<string, string> }).dependencies[PKG],
    ).toBe(installed);
  });

  it('counts minors across a major as far behind', () => {
    expect(minorsBehind('0.26.2', '0.27.0')).toBe(1);
    expect(minorsBehind('0.26.2', '0.28.0')).toBe(2);
    expect(minorsBehind('0.26.2', '1.0.0')).toBe(Infinity);
    expect(minorsBehind('0.26.2', '0.26.9')).toBe(0);
  });
});
