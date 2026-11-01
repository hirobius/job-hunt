// Guard: content is design-systems only (Adrian 2026-10-29). The trades / Spokane / apprenticeship
// board, the Implementation Consulting, ServiceNow and Skilled Trades packs and the SAM.gov
// contracts source are gone. This fails if a non-design-systems starter pack, starter board list
// or curated group comes back, or if the app's source names that content again. Existing users'
// other tracks stay stored (curation, sync, backup) but never surface (v12Migration.ts).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { STARTER_PACKS, packIdForLabel } from './curation/starterPacks';
import { DIRECTORY_BY_PACK, TARGETS_BY_PACK } from './radar/directory';
import { GROUPS } from './jobsData';
import { SOURCE_LABEL } from './feed/types';

const SRC = resolve(__dirname);
const DS_PACKS = ['designsystems'];

/** App source: .ts/.tsx, no tests, fixtures or test helpers. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory())
      return name === 'test' || name === 'fixtures' ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec|fixture)\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Words that only ever named the removed content. */
const NON_DS =
  /spokane|\bweld(?:er|ers|ing)?\b|sheet[- ]?metal|apprenticeships?\b|servicenow|sam\.gov|skilled trades|implementation consult/i;

/** Files that may say one of them, each for a reason. */
const ALLOWED: Record<string, string> = {
  // The old Trades slug `#/apprenticeships` still redirects to Today (back-compat links).
  'route.ts': 'retired slug redirect',
  // Generic role nouns that tell a typed job title from a company name; not curated content.
  'find/classifyFind.ts': 'role-noun vocabulary',
  // This guard's own words.
  'dsOnly.test.ts': 'the guard',
};

describe('design systems only (Adrian 2026-10-29)', () => {
  it('ships the design systems starter pack and no other', () => {
    expect(STARTER_PACKS.map((p) => p.id)).toEqual(DS_PACKS);
    for (const label of ['Skilled Trades', 'ServiceNow', 'Implementation Consulting'])
      expect(packIdForLabel(label), label).toBeUndefined();
  });

  it('keys the starter boards and targets by the design systems pack only', () => {
    expect(Object.keys(DIRECTORY_BY_PACK)).toEqual(DS_PACKS);
    expect(Object.keys(TARGETS_BY_PACK)).toEqual(DS_PACKS);
  });

  it('curates design systems groups only', () => {
    expect(GROUPS.map((g) => g.id)).toEqual(['ds-brief', 'ds-watch']);
    for (const g of GROUPS)
      for (const t of g.tiles) expect(`${t.name} ${t.meta} ${t.url}`, t.name).not.toMatch(NON_DS);
  });

  it('reads no SAM.gov contracts source', () => {
    expect(Object.keys(SOURCE_LABEL)).not.toContain('sam');
  });

  it('no app source names the removed content (allow-list aside)', () => {
    const hits = sourceFiles(SRC).flatMap((p) => {
      const rel = relative(SRC, p).split('\\').join('/');
      if (ALLOWED[rel]) return [];
      return readFileSync(p, 'utf8')
        .split('\n')
        .flatMap((line, i) => (NON_DS.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(hits).toEqual([]);
  });
});
