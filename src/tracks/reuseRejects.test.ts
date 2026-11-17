// Reuse of unchanged rejected rows (2026-11-15): the database half and the function's wiring,
// pinned by text (the function is Deno code, the SQL runs in the database). The read itself is
// tested in sync.test.ts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCORE_RULES } from './scoreKey';

const FILE = '20261115110000_reuse_rejected_rows.sql';
const sql = readFileSync(`supabase/migrations/${FILE}`, 'utf8');
const fn = readFileSync('supabase/functions/sync-postings/index.ts', 'utf8');
const order = JSON.parse(readFileSync('supabase/deploy-order.json', 'utf8')) as {
  afterFunction: string[];
};

describe('reuse of unchanged rejected rows', () => {
  it('the migration runs before the function (the default order)', () => {
    // The new function stores score_key only when known_reject_rows answers; the old function
    // never names the column. So the column must be there first, and nothing else is ordered.
    expect(order.afterFunction).not.toContain(FILE);
    expect(sql).toContain('add column if not exists score_key text');
  });

  it('only open, rejected, keyed, stamped Greenhouse rows may be reused', () => {
    const body = sql.slice(sql.indexOf('function public.known_reject_rows'));
    const where = body.slice(0, body.indexOf('$$;'));
    for (const rule of [
      "p.source = 'greenhouse'",
      'p.board = any (p_boards)',
      'p.closed_at is null',
      "p.verdict = 'reject'",
      'p.score_key is not null',
      'p.source_updated_at is not null',
      'order by p.id',
    ])
      expect(where, rule).toContain(rule);
  });

  it('a touch keeps only that user’s open rejected rows as seen, and says how many', () => {
    const body = sql.slice(sql.indexOf('function public.touch_reject_rows'));
    const upd = body.slice(0, body.indexOf('$$;'));
    for (const rule of [
      'last_seen_at = p_seen',
      'missed_syncs = 0',
      'user_id = p_user',
      'source_id = any (p_source_ids)',
      'closed_at is null',
      "verdict = 'reject'",
    ])
      expect(upd, rule).toContain(rule);
    // It never changes a verdict, a score or a key.
    const set = upd.slice(upd.indexOf('   set '), upd.indexOf(' where '));
    expect(set).toContain('last_seen_at');
    expect(set).not.toMatch(/verdict|score|reasons|closed_at/);
  });

  it('both functions are service role only, with the #487 hardening', () => {
    for (const f of ['known_reject_rows(text[])', 'touch_reject_rows(uuid, text[], timestamptz)']) {
      expect(sql).toContain(`revoke all on function public.${f}`);
      expect(sql).toContain(`grant execute on function public.${f} to service_role`);
    }
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2);
    expect(sql).not.toMatch(/(from|update|into)\s+postings/);
  });

  it('the function reuses a row only when every follower of the board rejects it unchanged', () => {
    expect(fn).toContain(
      'who.every((f) => sameReject(rejects.get(id)?.get(f.user_id), meta, keyOf(f.user_id)))',
    );
    expect(fn).toContain(
      'readAll(batch, { fetch: timedFetch, rss: false, knownBoards, knownRejects })',
    );
  });

  it('without the migration nothing is reused and no key is stored', () => {
    expect(fn).toContain('if (read.error) return null;');
    expect(fn).toContain('if (!rejects || !who.length');
    expect(fn).toContain('rejects !== null,');
    expect(fn).toContain('...(keyed && { extra: { score_key: scoreKey(plan.config) } }),');
  });

  it('a reused row that was not kept as seen closes nothing', () => {
    expect(fn).toContain('if (error || data !== ids.length) {');
    expect(fn).toContain('(answeredBy.get(userId) ?? []).filter((b) => !lost.has(b))');
  });

  it('SCORE_RULES cannot go stale: the files that decide a verdict are pinned with it', () => {
    // score.ts, the fit rule and the design role guard decide a verdict outside the config, so
    // the score key cannot see a change to them. When this fails: if the change can give any
    // posting another verdict, bump SCORE_RULES (every stored verdict is then scored again);
    // then put the new hash and the SCORE_RULES value here.
    const hash = createHash('sha256');
    for (const f of ['score.ts', 'scoreForTrack.ts', 'designRoleGuard.ts'])
      hash.update(readFileSync(`src/tracks/${f}`));
    expect({ rules: SCORE_RULES, files: hash.digest('hex') }).toEqual({
      rules: 2,
      files: '2275cf9cf0c86482c4e8191e32f65b26ab81dd19ca29e221f718d22beb517741',
    });
  });
});
