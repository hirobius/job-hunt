// Scale audit 2026-11-15: the retention and policy migration nobody runs in tests, pinned by its
// text. Closed postings and the sync's `run` lines must not grow without a limit, and the two
// policies it replaces must stay own-rows-only.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILE = 'supabase/migrations/20261115120000_scale_retention.sql';
const code = fs
  .readFileSync(FILE, 'utf8')
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

describe('scale retention migration', () => {
  it('deletes only closed postings, 14 days on, and keeps designsystems.jobs rows', () => {
    expect(code).toContain(
      "delete from public.postings where closed_at < now() - interval '14 days' and source <> 'rss'",
    );
    // Never an open row: every delete on postings names closed_at.
    for (const d of code.match(/delete from public\.postings[^$]*/g) ?? [])
      expect(d).toContain('closed_at <');
    expect(code).toContain("cron.schedule( 'postings-closed-retention'");
  });

  it('keeps the sync log’s run lines 14 days and leaves the other kinds alone', () => {
    expect(code).toContain(
      "delete from public.sync_log where kind = 'run' and created_at < now() - interval '14 days'",
    );
    expect(code).toContain("cron.schedule( 'sync-log-run-retention'");
  });

  it('keeps both tables own-rows-only, for signed-in users, with auth.uid() read once', () => {
    const policies = code.match(/create policy [^;]*;/g) ?? [];
    expect(policies).toHaveLength(3);
    for (const p of policies) {
      expect(p).toContain('to authenticated using ((select auth.uid()) = user_id)');
      expect(p).toMatch(/for (select|delete) /);
    }
    expect(code).not.toMatch(/grant |for (insert|update|all) /);
  });
});
