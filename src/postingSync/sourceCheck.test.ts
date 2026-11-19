// The postings table's `source` check (supabase/migrations) and the app's readers agree on every
// board kind (#576): the sync stores each kind under its own source, the check takes it, and the
// browser shows the row (postingReader.ts has a name for it; a 'manual' row is never shown).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_KINDS } from '../feed/boardSet';
import { postingFromRow } from '../feed/postingReader';
import type { Posting } from '../feed/types';
import { normalize } from './sync';

const DIR = 'supabase/migrations';
/** The source list of the newest migration that sets `postings_source_check`. */
function latestSourceCheck(): string[] {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files.reverse()) {
    const sql = readFileSync(`${DIR}/${f}`, 'utf8');
    const m = sql.match(/add constraint postings_source_check\s+check \(source in \(([^)]*)\)\)/);
    if (m) return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  }
  return [];
}

describe('postings.source: all 13 board kinds', () => {
  it('the newest check lists every board kind', () => {
    const allowed = latestSourceCheck();
    for (const kind of BOARD_KINDS) expect(allowed, kind).toContain(kind);
  });

  it.each([...BOARD_KINDS])(
    '%s: the sync stores it under its own source and the app shows it',
    (kind) => {
      const p: Posting = {
        id: `${kind}:acme:1`,
        source: kind,
        title: 'Design Systems Engineer',
        company: 'Acme',
        url: 'https://example.org/1',
        location: '',
        text: '',
      };
      const n = normalize(p);
      expect(n.source).toBe(kind);
      const shown = postingFromRow({
        id: 1,
        trackSlug: 'p1',
        source: n.source,
        sourceId: n.sourceId,
        company: 'Acme',
        title: n.title,
        location: '',
        url: n.url,
        score: 80,
        verdict: 'queue',
        reasons: [],
        fingerprint: 'acme::design systems engineer',
      });
      expect(shown?.source).toBe(kind);
      expect(shown?.id).toBe(`${kind}:acme:1`);
    },
  );
});
