import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * README truth guard (#111). The README is the portfolio's front door and it drifted badly
 * once: it kept advertising an AI feature, a CI pipeline and a component library long after
 * each was removed. Each entry below is a claim that is false on main; if one creeps back in,
 * this fails with the reason. Historical docs (SUMMARY.md, ADRs) carry their own banners and
 * are deliberately not checked.
 */

const README = fs.readFileSync('README.md', 'utf8');

const RETIRED: [RegExp, string][] = [
  [/ANTHROPIC_API_KEY/i, 'AI was removed (#54); there is no Anthropic key or server endpoint'],
  [/add with ai/i, '"Add with AI" was removed (#54)'],
  // Case-sensitive on purpose: ADR-0001's filename ends in `-on-mui.md` and is linked.
  [/\bMUI\b|Material[- ]UI/, 'MUI was fully removed (#11); the UI is HDS'],
  [/actions\/workflows|ci\.yml/i, 'there is no GitHub Actions workflow (owner preference)'],
  [/via github actions|github actions ci/i, 'CI does not run on GitHub Actions'],
  [/tokens:build|style dictionary/i, 'the token generator was retired by ADR-0005'],
  [/NODE_AUTH_TOKEN/, 'HDS installs from public npm; no registry token is needed'],
  [/typecheck:api|api\/extract/i, 'the api/ serverless functions are gone'],
  [/apprenticeships\W*board/i, 'the Apprenticeships/Trades board was retired (#76)'],
];

describe('README makes no retired claims', () => {
  it.each(RETIRED)('does not match %s', (pattern, reason) => {
    expect(README, reason).not.toMatch(pattern);
  });

  it('links every ADR in docs/adr', () => {
    for (const f of fs.readdirSync('docs/adr').filter((n) => n.endsWith('.md')))
      expect(README, `README should link docs/adr/${f}`).toContain(`docs/adr/${f}`);
  });

  it('only documents npm scripts that exist', () => {
    const scripts = Object.keys(
      (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> })
        .scripts,
    );
    const pending = new Set(['verify', 'test:e2e']); // land with claude/jh-platform (#95)
    for (const [, name] of README.matchAll(/npm run ([\w:-]+)/g))
      expect(scripts.includes(name) || pending.has(name), `npm run ${name}`).toBe(true);
  });
});
