import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #192 guard that sees what leaf-text scans miss: a " · " line built in source from 3+ items.
// A join of fixed 2-item pairs is fine; anything else must go through metaLines.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// Data strings (not rendered meta lines) or provably <= 2 items.
const ALLOWED = [
  'src/metaLines.ts',
  'src/store.ts', // job title built from title + ats
  'src/feed/toJob.ts', // saved-note text, not a meta line
  'src/feed/sources/hn.ts', // location data
  'src/LivenessViews.tsx', // two items
];

describe('meta lines in source (#192)', () => {
  it('no rendered line joins or interpolates 3+ items with " · " outside metaLines', () => {
    const bad: string[] = [];
    for (const f of walk('src')) {
      if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f) || ALLOWED.includes(f)) continue;
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\.join\((['"`]) · \1\)/.test(line)) bad.push(`${f}:${i + 1} ${line.trim()}`);
          const code = line.trim();
          if (/^(\/\/|\/?\*|\{\/\*)/.test(code)) return; // comments
          if ((code.match(/\$\{/g) ?? []).length >= 2 && (code.match(/ · /g) ?? []).length >= 2)
            bad.push(`${f}:${i + 1} ${code}`);
          // JSX text: {a} · {b} · {c}
          if ((code.match(/\} · \{/g) ?? []).length >= 2) bad.push(`${f}:${i + 1} ${code}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
