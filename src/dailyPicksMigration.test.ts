// Daily picks' database half (2026-11-05): the migration nobody runs in tests, pinned by its text.
// The scheduled run may only add picks for the one account its token names, through one function;
// the app reads its own rows; nothing else can write them.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILE = 'supabase/migrations/20261105100000_daily_picks.sql';
const code = fs
  .readFileSync(FILE, 'utf8')
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

describe('daily_picks migration', () => {
  it('makes the table with the fields a pick carries, capped', () => {
    for (const col of [
      'picked_on date',
      'company text',
      'title text',
      'employment text',
      'pay text',
      'posted_on date',
      'url text',
      'why text',
      'note text',
    ])
      expect(code).toContain(col);
    expect(code).toMatch(/employment in \('employee', 'contract', 'unknown'\)/);
    expect(code).toMatch(/url ~\* '\^https\?:\/\/'/);
    expect(code).toContain('unique (user_id, url)');
  });

  it('lets a user read only their own picks, and write none directly', () => {
    expect(code).toContain('alter table public.daily_picks enable row level security');
    expect(code).toMatch(
      /create policy "read own rows" on public\.daily_picks for select using \(auth\.uid\(\) = user_id\)/,
    );
    expect(code).not.toMatch(/on public\.daily_picks for (insert|update|delete|all)/);
    expect(code).toMatch(
      /revoke all on public\.daily_picks from public, anon, authenticated;\s*grant select on public\.daily_picks to authenticated;/,
    );
  });

  it('keeps the feed tokens private and stores only their hash', () => {
    expect(code).toContain('alter table public.daily_pick_feeds enable row level security');
    expect(code).toMatch(/revoke all on public\.daily_pick_feeds from public, anon, authenticated/);
    expect(code).toMatch(
      /token_hash text primary key check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/,
    );
    expect(code).toContain("encode(sha256(convert_to(p_token, 'utf8')), 'hex')");
  });

  it('adds picks only through the token-guarded function', () => {
    expect(code).toMatch(/function public\.add_daily_picks\(p_token text, p_picks jsonb\)/);
    expect(code).toContain('security definer');
    expect(code).toContain("set search_path = ''");
    expect(code).toMatch(/if uid is null then raise exception/);
    expect(code).toMatch(/jsonb_array_length\(p_picks\) > 10/);
    expect(code).toContain('on conflict (user_id, url) do nothing');
    expect(code).toMatch(
      /revoke all on function public\.add_daily_picks\(text, jsonb\) from public/,
    );
    expect(code).toMatch(
      /grant execute on function public\.add_daily_picks\(text, jsonb\) to anon, authenticated/,
    );
  });

  it('caps a day at 50, counting the batch, one call per account at a time', () => {
    expect(code).toContain('perform pg_advisory_xact_lock(hashtext(uid::text))');
    expect(code).toMatch(
      /pg_advisory_xact_lock.*interval '1 day'\) \+ jsonb_array_length\(p_picks\) > 50 then raise exception 'daily limit reached'/,
    );
    expect(code).not.toMatch(/>= 50/);
  });

  it('keeps 60 days by the server-set created_at, and clamps the dates a run sends', () => {
    expect(code).toMatch(/cron\.schedule\( 'daily-picks-retention'/);
    expect(code).toContain(
      "delete from public.daily_picks where created_at < now() - interval '60 days'",
    );
    expect(code).not.toContain('picked_on < current_date');
    // picked_on: only the last 7 days, else today; posted_on: never after today (and missing stays missing).
    expect(code).toMatch(
      /case when public\.daily_picks_try_date\(p->>'picked_on'\) between current_date - 7 and current_date then public\.daily_picks_try_date\(p->>'picked_on'\) else current_date end/,
    );
    expect(code).toMatch(
      /case when public\.daily_picks_try_date\(p->>'posted_on'\) > current_date then current_date else public\.daily_picks_try_date\(p->>'posted_on'\) end/,
    );
    expect(code).not.toMatch(/least\(/);
  });

  it('reads a bad date as missing instead of aborting the batch', () => {
    // '2026-02-31' passes a shape check but fails the cast; the helper catches it.
    expect(code).toMatch(
      /function public\.daily_picks_try_date\(p text\) returns date .*return p::date; exception when others then return null; end;/,
    );
    expect(code).not.toMatch(/\(p->>'(picked_on|posted_on)'\)::date/);
    expect(code).toMatch(
      /revoke all on function public\.daily_picks_try_date\(text\) from public, anon, authenticated/,
    );
  });
});
