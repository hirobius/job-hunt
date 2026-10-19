import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Delete-list guard (#195). `docs/delete-list.md` is the code-freeze report from knip + jscpd:
 * one row per candidate. The delete PRs work from it, so it must stay true: every open `delete`
 * row still points at code that exists, nothing on an entry point is marked for deletion, and a
 * merged row is flipped to `done` rather than left behind as a stale `delete`.
 */

const ENTRY_POINTS = [
  /^src\/main\.tsx$/,
  /^e2e\//,
  /^scripts\//,
  /^vite\.config\.ts$/,
  /\.test\.tsx?$/,
];
const VERDICTS = ['keep', 'delete', 'done'];

interface Row {
  candidate: string;
  tool: string;
  verdict: string;
  theme: string;
  reason: string;
}

function rows(): Row[] {
  const md = fs.readFileSync('docs/delete-list.md', 'utf8');
  return md
    .split('\n')
    .filter((l) => l.startsWith('| `'))
    .map((l) => {
      const [candidate, tool, verdict, theme, reason] = l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      return { candidate: candidate.replace(/`/g, ''), tool, verdict, theme, reason };
    });
}

/** `path` or `path#Symbol`; for a clone, `path:12-30`. */
function parse(candidate: string) {
  const [path, symbol] = candidate.split('#');
  return { path: path.replace(/:\d+-\d+$/, ''), symbol };
}

describe('docs/delete-list.md', () => {
  it('has candidate rows', () => {
    expect(rows().length).toBeGreaterThan(0);
  });

  it.each(rows().map((r) => [r.candidate, r] as const))('%s is well formed', (_, r) => {
    expect(['knip', 'jscpd']).toContain(r.tool);
    expect(VERDICTS).toContain(r.verdict);
    expect(r.reason, 'every row gives a reason').not.toBe('');
    if (r.verdict !== 'keep') expect(r.theme, 'a delete row names its PR theme').not.toBe('');
  });

  it('marks nothing on an entry point for deletion', () => {
    for (const r of rows().filter((r) => r.verdict === 'delete')) {
      const { path } = parse(r.candidate);
      for (const ep of ENTRY_POINTS)
        expect(path, `${r.candidate} is an entry point`).not.toMatch(ep);
    }
  });

  it('every open delete row still points at code that exists', () => {
    for (const r of rows().filter((r) => r.verdict === 'delete')) {
      const { path, symbol } = parse(r.candidate);
      expect(fs.existsSync(path), `${path} is gone: flip the row to done`).toBe(true);
      if (symbol)
        expect(
          fs.readFileSync(path, 'utf8'),
          `${r.candidate} is gone: flip the row to done`,
        ).toMatch(new RegExp(`\\b${symbol}\\b`));
    }
  });

  it('every done symbol row is no longer exported from its file', () => {
    for (const r of rows().filter((r) => r.verdict === 'done')) {
      const { path, symbol } = parse(r.candidate);
      if (!symbol || !fs.existsSync(path)) continue;
      const src = fs.readFileSync(path, 'utf8');
      const declared = new RegExp(
        `export\\s+(?:async\\s+)?(?:const|let|function|type|interface|class)\\s+${symbol}\\b`,
      );
      const listed = new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${symbol}\\b[^}]*\\}`);
      expect(src, `${r.candidate} is still exported`).not.toMatch(declared);
      expect(src, `${r.candidate} is still re-exported`).not.toMatch(listed);
    }
  });
});
