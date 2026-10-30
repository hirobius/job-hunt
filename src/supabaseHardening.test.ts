// Supabase hardening (#319, #320, #322, #391): the database rules live in migration text nobody runs
// in tests, so this reads that text and pins each rule. Nothing here talks to a database.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = 'supabase/migrations';
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const sql = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');
/** SQL with `--` comments taken out, lower-cased, whitespace folded. */
const code = (f: string) =>
  sql(f)
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

/** The last migration that defines `report_client_error` wins on apply. */
const lastWith = (re: RegExp) => [...files].reverse().find((f) => re.test(sql(f)));

describe('client_errors: per-client limit (#319, #391)', () => {
  const f = lastWith(/function public\.report_client_error\(/);
  const body = f ? code(f) : '';

  it('is redefined after the global-bucket version', () => {
    expect(f).toBeDefined();
    expect(f! > '20261026100200_client_errors_rate_limited_rpc.sql').toBe(true);
  });

  it('keys a bucket on the caller, not one global bucket', () => {
    expect(body).toContain("request.headers");
    expect(body).toContain('x-forwarded-for');
    // A salted one-way code, never the address itself.
    expect(body).toMatch(/sha256\(/);
    expect(body).not.toMatch(/insert into public\.client_errors \([^)]*\bip\b/);
  });

  it('counts with an atomic upsert, not a count-then-insert scan', () => {
    expect(body).toMatch(/on conflict \(bucket, window_start\) do update set n = .*\.n \+ 1/);
    expect(body).not.toMatch(/select count\(\*\) from public\.client_errors/);
  });

  it('has per-client minute and day caps under global ceilings', () => {
    for (const name of ['client_per_minute', 'client_per_day', 'all_per_minute', 'all_per_day'])
      expect(body).toContain(name);
  });

  it('indexes created_at for the retention sweep', () => {
    expect(body).toMatch(/create index if not exists \w+ on public\.client_errors \(created_at\)/);
  });

  it('keeps the rate table private and short-lived', () => {
    expect(body).toMatch(/alter table public\.client_error_rate enable row level security/);
    expect(body).toMatch(/revoke all on public\.client_error_rate from public, anon, authenticated/);
    expect(body).toMatch(/cron\.schedule\( 'client-error-rate-sweep'/);
  });

  it('stays callable by the public key only through the function', () => {
    expect(body).toMatch(
      /grant execute on function public\.report_client_error\(text, text, text, text, text\) to anon, authenticated/,
    );
    expect(body).toContain('set search_path = ');
  });
});

describe('user-writable tables: caps and same-user parents (#320, #391)', () => {
  const f = files.find((x) => /user_table_caps/.test(x));
  const body = f ? code(f) : '';

  it('exists after the RLS-as-code migration', () => {
    expect(f).toBeDefined();
    expect(f! > '20261026100000_rls_policies_as_code.sql').toBe(true);
  });

  it('caps text and array sizes on the curation tables', () => {
    for (const c of ['categories_label_len', 'categories_titles_size', 'categories_ats_roles_size',
      'groups_label_len', 'tiles_name_len', 'tiles_url_len', 'tiles_meta_len'])
      expect(body).toContain(`add constraint ${c}`);
  });

  it('caps rows per user with a locked before-insert trigger', () => {
    expect(body).toMatch(/pg_advisory_xact_lock/);
    for (const t of ['categories', 'groups', 'tiles'])
      expect(body).toMatch(new RegExp(`before insert on public\\.${t} for each row`));
  });

  it('ties a group to a category, and a tile to a group, of the same user', () => {
    expect(body).toMatch(/foreign key \(category_id, user_id\) references public\.categories \(id, user_id\)/);
    expect(body).toMatch(/foreign key \(group_id, user_id\) references public\.groups \(id, user_id\)/);
  });

  it('measures the tracker blob by its text, not its compressed size', () => {
    expect(body).toMatch(/check \(octet_length\(data::text\) < 8000000\)/);
  });

  it('closes leftovers the app no longer uses (skips, watched_companies, board_from_url)', () => {
    expect(body).toMatch(/to_regclass\('public\.skips'\)/);
    expect(body).toMatch(/to_regclass\('public\.watched_companies'\)/);
    expect(body).toMatch(/proname = 'board_from_url'/);
  });

  it('is safe to run twice', () => {
    const adds = body.match(/add constraint (\w+)/g) ?? [];
    for (const a of adds) {
      const name = a.split(' ')[2];
      expect(body).toContain(`drop constraint if exists ${name}`);
    }
    for (const m of body.matchAll(/create trigger (\w+)/g))
      expect(body).toContain(`drop trigger if exists ${m[1]}`);
  });
});

describe('sync-postings auth (#322)', () => {
  const src = fs.readFileSync('supabase/functions/sync-postings/index.ts', 'utf8');

  it('has no secret-derived constant in the repo', () => {
    expect(src).not.toMatch(/SYNC_SECRET_SHA256/);
    expect(src).not.toMatch(/['"`][0-9a-f]{64}['"`]/i);
  });

  it('compares digests without an early exit, and never with ===', () => {
    expect(src).toMatch(/sameDigest\(await sha256\(given\), await sha256\(secret\)\)/);
    expect(src).not.toMatch(/given\s*===?\s*secret|secret\s*===?\s*given/);
  });

  it('refuses everything until SYNC_SECRET is set', () => {
    expect(src).toMatch(/if \(!secret\) \{[\s\S]{0,200}return false;/);
  });
});
