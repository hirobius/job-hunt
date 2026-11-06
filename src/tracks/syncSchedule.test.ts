// #448: the server sync every 15 minutes. Pinned by text: the schedule, Vault for the secret, the
// old evening run replaced, the morning feeds run kept, and safe to run twice.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20261106100000_sync_postings_every_15_min.sql',
  'utf8',
);
const fn = readFileSync('supabase/functions/sync-postings/index.ts', 'utf8');

/** Every minute of an hour each job fires on, for the given hour. */
function minutesAt(hour: number): number[] {
  const out: number[] = [];
  for (const m of sql.matchAll(/cron\.schedule\(\s*'([^']+)',\s*'([^']+)'/g)) {
    const [min, hr] = m[2].split(' ');
    const hours =
      hr === '*'
        ? null
        : hr.split(',').flatMap((p) => {
            const [a, b] = p.split('-').map(Number);
            return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
          });
    if (hours && !hours.includes(hour)) continue;
    out.push(...min.split(',').map(Number));
  }
  return out.sort((a, b) => a - b);
}

describe('sync-postings every 15 minutes (#448)', () => {
  it('fires 4 times an hour, 15 minutes apart, with 06:23 left to the feeds run', () => {
    for (const h of [0, 5, 7, 12, 18, 23]) expect(minutesAt(h)).toEqual([8, 23, 38, 53]);
    expect(minutesAt(6)).toEqual([8, 38, 53]);
  });

  it('reads the boards only (the morning run keeps the feeds)', () => {
    expect(sql.match(/'\{"rss": false\}'::jsonb/g)).toHaveLength(2);
    expect(sql).not.toMatch(/"rss": true/);
  });

  it('takes the secret and URL from Vault, never from the file', () => {
    expect(sql.match(/vault\.decrypted_secrets where name = 'sync_postings_secret'/g)).toHaveLength(
      2,
    );
    expect(sql.match(/vault\.decrypted_secrets where name = 'project_url'/g)).toHaveLength(2);
    expect(sql).not.toMatch(/[0-9a-f]{32,}/);
  });

  it('replaces the evening run and is safe to run twice', () => {
    for (const job of ['sync-postings-evening', 'sync-postings-15min', 'sync-postings-15min-23'])
      expect(sql).toContain(`perform cron.unschedule('${job}')`);
    expect(sql).not.toContain("unschedule('sync-postings-morning')");
  });

  it('the function retries a 429, 5xx or timeout once and says so', () => {
    expect(fn).toContain('readWithRetry(');
    expect(fn).toMatch(/retriedReads,\n\s+summary,/);
  });
});

describe('one 15-minute run at a time (#448)', () => {
  const lease = sql.slice(sql.indexOf('sync_run_lease ('));

  it('claims a lease on the database clock, only when none is held or it has expired', () => {
    expect(lease).toContain(
      'create or replace function public.claim_sync_run(p_run text, p_lease_ms int)',
    );
    expect(lease).toMatch(/lease_until = now\(\) \+ make_interval/);
    expect(lease).toMatch(/lease_until is null or lease_until < now\(\) or run_start = p_run/);
    expect(lease).toMatch(
      /grant execute on function public\.claim_sync_run\(text, int\) to service_role/,
    );
    expect(lease).toMatch(/revoke all on public\.sync_run_lease from public, anon, authenticated/);
  });

  it('releases it only for the run that holds it', () => {
    expect(lease).toMatch(/set lease_until = null where id = 1 and run_start = p_run/);
  });

  it('the function claims on the first slice, skips and logs while held, releases on the last', () => {
    const claim = fn.indexOf("db.rpc('claim_sync_run'");
    expect(claim).toBeGreaterThan(0);
    expect(fn.slice(claim - 400, claim)).toContain('if (body.runStart === undefined)');
    expect(fn).toContain("skipped: 'previous run still going'");
    expect(fn).toMatch(/if \(!next\) await releaseRun\(\);/);
    expect(fn).toMatch(/if \(broke\) await releaseRun\(\);/);
  });

  it('the lease expires before the next tick but one (14 min < 15 min)', () => {
    const ms = Number(/const RUN_LEASE_MS = (\d+) \* 60_000;/.exec(fn)?.[1]) * 60_000;
    expect(ms).toBeGreaterThan(10 * 60_000);
    expect(ms).toBeLessThan(15 * 60_000);
  });
});
