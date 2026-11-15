import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * The repo's front door stays short: README.md and CLAUDE.md keep their line caps and README.md
 * keeps its standard sections (scripts/check-repo-docs.mjs, also `npm run check:docs`). Detail
 * belongs in docs/, one subject per file.
 */
describe('repo docs', () => {
  it('pass the repo docs check', () => {
    const out = execFileSync('node', ['scripts/check-repo-docs.mjs'], { encoding: 'utf8' });
    expect(out).toContain('passed');
  });
});
