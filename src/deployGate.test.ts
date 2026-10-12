import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The deploy gate (#95) is config, not code: Vercel's build command runs `npm run verify`,
 * which chains typecheck → lint → tests → build. Nothing else enforces that wiring (there is
 * no GitHub Actions CI by owner preference), so this pins it — a silent edit back to
 * `vite build` would let a red commit reach production again.
 */

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { buildCommand: string };

describe('deploy gate', () => {
  it('Vercel builds through the verify script', () => {
    expect(vercel.buildCommand).toBe('npm run verify');
  });

  it('verify runs every check, in order, failing fast', () => {
    const steps = pkg.scripts.verify.split('&&').map((s) => s.trim());
    expect(steps).toEqual(['npm run typecheck', 'npm run lint', 'npm run test', 'npm run build']);
  });

  it('the local build stays a plain vite build (the gate is opt-in locally)', () => {
    expect(pkg.scripts.build).toBe('vite build');
  });
});
