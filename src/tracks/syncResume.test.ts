// A run that always finishes (2026-11-15). Measured on 2026-11-14: every 15-minute run stopped in
// its 4th slice with "CPU Time exceeded" and no sync_log row, so 109 of 157 followed boards were
// never read and the feeds step never ran. Pinned by text, like the other sync schedule tests:
// the function is Deno code and the SQL runs in the database.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILE = '20261115100000_sync_run_resume.sql';
const sql = readFileSync(`supabase/migrations/${FILE}`, 'utf8');
const fn = readFileSync('supabase/functions/sync-postings/index.ts', 'utf8');
const order = JSON.parse(readFileSync('supabase/deploy-order.json', 'utf8')) as {
  afterFunction: string[];
};

describe('sync run resume', () => {
  it('the migration runs after the function that reads { resume: true }', () => {
    // An older function reads that body as a new run, every minute.
    expect(order.afterFunction).toContain(FILE);
    expect(fn).toContain('body.resume === true');
  });

  it('a resume tick every minute, secret and URL from Vault, safe to run twice', () => {
    expect(sql).toMatch(/cron\.schedule\(\s*'sync-postings-resume',\s*'\* \* \* \* \*'/);
    expect(sql).toContain(`'{"resume": true}'::jsonb`);
    expect(sql).toContain("perform cron.unschedule('sync-postings-resume')");
    expect(sql).toContain("vault.decrypted_secrets where name = 'sync_postings_secret'");
    expect(sql).not.toMatch(/[0-9a-f]{32,}/);
    expect(sql.match(/add column if not exists/g)).toHaveLength(4);
  });

  it('the new functions are service role only, with a fixed search path', () => {
    for (const f of [
      'save_sync_cursor(text, text, jsonb, int)',
      'claim_sync_resume(int, int, int)',
      'claim_sync_run(text, int)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${f}`);
      expect(sql).toContain(`grant execute on function public.${f} to service_role`);
    }
    // #487 hardening kept: an empty search path, every name schema-qualified.
    expect(sql.match(/set search_path = ''/g)).toHaveLength(3);
    expect(sql).not.toMatch(/set search_path = public/);
    expect(sql).not.toMatch(/(?<![\w.])(now|make_interval)\(/);
    expect(sql).not.toMatch(/(from|update|into)\s+sync_run_lease/);
  });

  it('a new run resets the place in its claim, so a resume never takes it under the new run', () => {
    const claim = sql.slice(sql.indexOf('function public.claim_sync_run'));
    expect(claim.slice(0, claim.indexOf('$$;'))).toMatch(/cursor\s+= ''[\s\S]*resumes\s+= 0/);
  });

  it('the resume claim takes the heartbeat and the lease in one statement, and gives up', () => {
    const claim = sql.slice(sql.indexOf('function public.claim_sync_resume'));
    expect(claim).toContain('for update');
    expect(claim).toContain('r.resumes >= p_max');
    // A give-up leaves the row with no run, so a stale slice cannot extend the lease.
    expect(claim).toMatch(/lease_until = null,[\s\S]*run_start = null/);
    expect(claim).toMatch(/resumes\s+= l\.resumes \+ 1/);
  });

  it('the stale time is longer than a slice can take', () => {
    const stale = Number(/RESUME_STALE_MS = ([\d_]+)/.exec(fn)![1].replace(/_/g, ''));
    const slice = Number(/const SLICE = (\d+)/.exec(fn)![1]);
    const batch = Number(/const BOARD_BATCH = (\d+)/.exec(fn)![1]);
    const rot = readFileSync('src/tracks/rotation.ts', 'utf8');
    const timeout = Number(/fetchTimeoutMs: ([\d_]+)/.exec(rot)![1].replace(/_/g, ''));
    // Each batch: a read, the retry wait (2 s), one more read.
    expect(stale).toBeGreaterThan((slice / batch) * (2 * timeout + 2000));
  });

  it('each slice saves its place before it reads and before it calls the next one', () => {
    expect(fn).toContain('if (!(await savePlace(after)))');
    const end = fn.indexOf('const mine = await savePlace(next, nextSize);');
    expect(end).toBeGreaterThan(-1);
    expect(end).toBeLessThan(fn.indexOf('const broke = await chainNext('));
    // The heartbeat after each board batch.
    expect(fn.match(/await savePlace\(after\)/g)).toHaveLength(2);
    // Without the migration the rpc errors, and the run goes on as before.
    expect(fn).toContain('return error ? true : data !== false;');
  });

  it('a resumed slice keeps the run start and the feeds flags of the run it goes on with', () => {
    expect(fn).toContain('body.runStart = row.run_start;');
    expect(fn).toContain('body.rss = row.payload?.rss === true;');
    expect(fn).toContain(
      'p_payload: { rss: body.rss === true, keyed: body.keyed !== false, size }',
    );
  });

  it('a stop and a give-up are logged (the stop itself logs nothing)', () => {
    expect(fn).toContain('run stopped ${where} with no error logged');
    expect(fn).toContain('run given up ${where}');
  });

  it('a slice that stopped is read again smaller, and one board that stops alone is skipped', () => {
    // First live run, 2026-11-15: 16 Greenhouse boards stopped a fresh invocation three times.
    expect(fn).toMatch(
      /const resumeSlice = \(base: number, resumes: number\) =>\s+Math\.max\(1, base >> Math\.max\(0, resumes\)\);/,
    );
    const slice = Number(/const SLICE = (\d+)/.exec(fn)![1]);
    const size = (r: number) => Math.max(1, slice >> Math.max(0, r));
    expect([1, 2, 3, 4].map(size)).toEqual([8, 4, 2, 1]);
    const skipAt = Number(/const RESUME_SKIP_AT = (\d+)/.exec(fn)![1]);
    const max = Number(/const RESUME_MAX = (\d+)/.exec(fn)![1]);
    // The skip comes after the one-board try and before the give-up.
    expect(size(skipAt - 1)).toBe(1);
    expect(skipAt).toBeLessThan(max);
    expect(fn).toContain('sliceSize = resumeSlice(baseSize, row.resumes);');
    // The size that worked goes on with the run: the next slice, and the saved place.
    expect(fn).toContain('...(nextSize < SLICE && { size: nextSize }),');
    expect(fn).toContain('const skipped = skipFirst ? rest.shift() : undefined;');
    expect(fn).toContain('const boards = rest.slice(0, sliceSize);');
    expect(fn).toContain(
      'skipped for this run. Its slice stopped the function at every size down to this one board',
    );
  });

  it('after a stop the size grows back with each slice that works, up to half a slice', () => {
    expect(fn).toMatch(
      /const nextSliceSize = \(worked: number\) =>\s+worked >= SLICE \? SLICE : Math\.min\(SLICE >> 1, Math\.max\(1, worked\) \* 2\);/,
    );
    const slice = Number(/const SLICE = (\d+)/.exec(fn)![1]);
    const next = (w: number) => (w >= slice ? slice : Math.min(slice >> 1, Math.max(1, w) * 2));
    // A run that never stopped stays whole; one that did climbs 1, 2, 4, 8 and stays there.
    expect(next(slice)).toBe(slice);
    expect([1, 2, 4, 8].map(next)).toEqual([2, 4, 8, 8]);
    expect(fn).toContain('const nextSize = nextSliceSize(sliceSize);');
  });

  it('the feeds and the closing have an invocation with no board in it', () => {
    expect(fn).toContain('const last = rest.length === 0;');
    expect(fn).not.toContain('rest.length <= SLICE');
  });
});
