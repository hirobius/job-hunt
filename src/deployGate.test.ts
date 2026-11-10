import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The deploy gate (#95) moved off Vercel's meter (Adrian 2026-10-24): Vercel runs a plain
 * `npm run build` (~30-60s instead of ~3 min) and `npm run verify` (typecheck → lint → tests →
 * build) is the local gate every push to main must pass first. This pins both halves.
 */

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { buildCommand: string };

describe('deploy gate', () => {
  it('Vercel runs the plain build; verify is the local gate before a push', () => {
    expect(vercel.buildCommand).toBe('npm run build');
  });

  it('verify runs every check, in order, failing fast', () => {
    const steps = pkg.scripts.verify.split('&&').map((s) => s.trim());
    expect(steps).toEqual([
      'npm run typecheck',
      'npm run lint',
      'npm run check:hds',
      'npm run test',
      'npm run build',
    ]);
  });

  it('each gate step runs the real tool, not a stub', () => {
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
    expect(pkg.scripts.lint).toBe('eslint . --max-warnings=0');
    expect(pkg.scripts.test).toBe('vitest run');
  });

  it('the local build stays a plain vite build (the gate is opt-in locally)', () => {
    expect(pkg.scripts.build).toBe('vite build');
  });
});
