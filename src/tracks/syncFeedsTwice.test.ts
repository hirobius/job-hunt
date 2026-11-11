// #576 item 4: the feeds run twice a day. Pinned by text, as syncSchedule.test.ts pins #448.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serverFeedsForRun } from './feeds/serverFeeds';

const sql = readFileSync('supabase/migrations/20261111100100_sync_feeds_twice_a_day.sql', 'utf8');
const fn = readFileSync('supabase/functions/sync-postings/index.ts', 'utf8');
const jobs = [
  ...sql.matchAll(/cron\.schedule\(\s*'([^']+)',\s*'([^']+)',[\s\S]*?body\s*:=\s*'([^']+)'/g),
].map((m) => ({ name: m[1], cron: m[2], body: JSON.parse(m[3]) }));

describe('feeds twice a day (#576)', () => {
  it('adds a 14:23 feeds run without the keyed searches', () => {
    expect(jobs.find((j) => j.name === 'sync-postings-afternoon')).toEqual({
      name: 'sync-postings-afternoon',
      cron: '23 14 * * *',
      body: { rss: true, keyed: false },
    });
  });

  it('moves the :23 boards tick off 06 and 14, so no minute fires twice', () => {
    expect(jobs.find((j) => j.name === 'sync-postings-15min-23')).toEqual({
      name: 'sync-postings-15min-23',
      cron: '23 0-5,7-13,15-23 * * *',
      body: { rss: false },
    });
  });

  it('is safe to run twice and keeps the secret in Vault', () => {
    expect(sql).toMatch(/cron\.unschedule\('sync-postings-afternoon'\)/);
    expect(sql).toMatch(/cron\.unschedule\('sync-postings-15min-23'\)/);
    expect(sql).toMatch(/vault\.decrypted_secrets where name = 'sync_postings_secret'/);
  });

  it('the function passes keyed: false down the slice chain', () => {
    expect(fn).toMatch(/body\.keyed === false && \{ keyed: false \}/);
    expect(fn).toMatch(/serverFeedsForRun\(envOf, body\.keyed !== false\)/);
  });

  it('serverFeedsForRun leaves the keyed searches to the morning run', () => {
    const env = (n: string) => (n.endsWith('_KEY') || n.endsWith('_ID') ? 'set' : undefined);
    const morning = serverFeedsForRun(env, true);
    const afternoon = serverFeedsForRun(env, false);
    expect(morning).toEqual(expect.arrayContaining(['arbeitnow', 'remoteok', 'wwr', 'theirstack']));
    expect(afternoon).toEqual(['arbeitnow', 'remoteok', 'wwr']);
  });
});
