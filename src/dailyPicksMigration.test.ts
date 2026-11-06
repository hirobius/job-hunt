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

  it('caps a day of writes and keeps 60 days', () => {
    expect(code).toMatch(/interval '1 day'\) >= 50/);
    expect(code).toMatch(/cron\.schedule\( 'daily-picks-retention'/);
    expect(code).toContain('current_date - 60');
  });
});
