// The entry chunk carries only what most loads run (#371): the default profile, legal text, backup/restore,
// the sign-in and export-links dialogs and the starter packs load on demand. This walks the static
// imports from main.tsx (type-only imports and import() left out) and fails when one comes back.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = __dirname;

const ON_DEMAND = [
  'searchDefaults.ts',
  'curation/starterPacks.ts',
  'curation/packContent.ts',
  'jobsData.ts',
  'radar/directory.ts',
  'demo/sampleData.ts',
  'legal.ts',
  'backup.ts',
  'account/SignInDialog.tsx',
  'ExportLinksDialog.tsx',
  // The Account menu's Data dialog (#550): back up, restore, export, Recently removed, reset.
  'account/DataDialog.tsx',
  // The Account menu's rows (#549): their icons and toggle rows.
  'account/AccountMenuRows.tsx',
  'hds-gaps/MenuToggleItem.tsx',
  // #368 pass: sheets loaded on first open (lazyHosts.tsx), the job page's liveness note, and the
  // feed code the stores only needed a sliver of (boardUrl.ts, term.ts, boardSet's kinds).
  'FollowUp.tsx',
  'AddInterview.tsx',
  'RecentlyRemoved.tsx',
  'LivenessViews.tsx',
  'feed/probe.ts',
  'feed/fetchFeed.ts',
  'feed/sources/ats.ts',
  'feed/match.ts',
  // The flame's motion (startFlame.ts): the still frame shows first.
  'brand/flameMotion.ts',
  'brand/flameEngine.ts',
];

function resolve(from: string, spec: string): string | null {
  const base = join(dirname(from), spec);
  for (const p of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ])
    if (/\.tsx?$/.test(p) && existsSync(p)) return p;
  return null;
}

/** Every src module main.tsx reaches through static value imports. */
function eagerModules(): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    // `import x from '…'`, `import { a } from '…'`, `export { a } from '…'`, `import '…'`;
    // not `import type` / `export type` (erased) and not `import('…')` (a lazy chunk).
    const re = /^(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
    for (const [, spec] of code.matchAll(re)) {
      if (!spec.startsWith('.')) continue;
      const next = resolve(file, spec);
      if (next) visit(next);
    }
  };
  visit(join(SRC, 'main.tsx'));
  return new Set([...seen].map((f) => relative(SRC, f)));
}

describe('entry chunk', () => {
  it('leaves first-run and rare code to lazy chunks', () => {
    const eager = eagerModules();
    expect(eager.has('App.tsx')).toBe(true); // the walk works
    expect(ON_DEMAND.filter((m) => eager.has(m))).toEqual([]);
  });
});
