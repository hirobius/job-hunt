import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SORTS } from './jobSort';

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
  // The lookbehind spares ADR-0001's filename (`…-on-mui.md`), which the README must link.
  [/(?<!-on-)\bmui\b|material[- ]?ui/i, 'MUI was fully removed (#11); the UI is HDS'],
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
      expect(README, `README should link docs/adr/${f}`).toContain(`](docs/adr/${f})`);
  });

  it('only documents npm scripts that exist', () => {
    const scripts = Object.keys(
      (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> })
        .scripts,
    );
    for (const [, name] of README.matchAll(/npm run ([\w:-]+)/g))
      expect(scripts, `npm run ${name}`).toContain(name);
  });
});

/** Every number in the docs is derived from a source or cut (hirobius/ops#681). */
describe('README and FEATURES numbers have a source', () => {
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  it('"N sorts" matches the Sort menu', () => {
    const m = README.match(/\b(\w+) sorts\b/i);
    expect(m, 'README names how many sorts there are').not.toBeNull();
    const n = WORDS.indexOf(m![1].toLowerCase());
    expect(n, `"${m![1]}" is a number word`).toBeGreaterThan(-1);
    expect(n, 'README sort count vs SORTS in jobSort.ts').toBe(SORTS.length);
  });

  it('quotes no bundle sizes (they change every build; run npm run build to see them)', () => {
    expect(README).not.toMatch(/\d\s?kB/i);
  });

  it('does not describe an "Up Next" queue the app does not have', () => {
    const FEATURES = fs.readFileSync('FEATURES.md', 'utf8');
    expect(FEATURES).not.toMatch(/up next/i);
  });
});
