// Delete my data's server half (#393): one security-definer function erases every per-user table.
// A table added with a user_id and left out of it would survive the erasure legal.ts promises, so
// this reads the migrations: every `create table … user_id` must be in delete_my_data.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DELETE_ORDER } from '../cloudMessages';

const DIR = 'supabase/migrations';
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const sql = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');

/** Each `create table public.x ( … )` whose columns name user_id. */
function userTables(): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const re = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
    for (const m of sql(f).matchAll(re)) if (/\buser_id\b/.test(m[2])) out.add(m[1]);
  }
  return [...out].sort();
}

const fnFile = files.find((f) => /function public\.delete_my_data\(/.test(sql(f)));
const body = fnFile ? sql(fnFile) : '';

describe('delete_my_data covers every per-user table', () => {
  it('finds the per-user tables (the parse still works)', () => {
    expect(userTables()).toEqual(
      expect.arrayContaining(['tracker', 'categories', 'tiles', 'postings', 'skips', 'sync_log']),
    );
  });

  it('is defined in a migration after every table it deletes from', () => {
    expect(fnFile).toBeDefined();
    for (const f of files) if (/^create table/im.test(sql(f))) expect(f < fnFile!, f).toBe(true);
  });

  it.each(userTables())('deletes %s rows of the caller', (t) => {
    expect(body).toMatch(new RegExp(`delete from public\\.${t} where user_id = uid;`));
  });

  it('runs as definer for signed-in users only', () => {
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(
      /revoke all on function public\.delete_my_data\(uuid\) from public, anon;/,
    );
    expect(body).toMatch(
      /grant execute on function public\.delete_my_data\(uuid\) to authenticated;/,
    );
  });

  it('erases only the account the caller names, and only its own', () => {
    expect(body).toMatch(/function public\.delete_my_data\(p_user uuid\)/);
    expect(body).toMatch(/uid uuid := auth\.uid\(\);/);
    expect(body).toMatch(
      /if uid is null or p_user is distinct from uid then\s+raise exception 'not your account' using errcode = '42501';/,
    );
  });

  it('the fallback (no function yet) still deletes the tables the app writes', () => {
    expect([...DELETE_ORDER].sort()).toEqual(['categories', 'groups', 'tiles', 'tracker']);
  });
});
