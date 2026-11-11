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
    expect(body).toContain('request.headers');
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
    expect(body).toMatch(
      /revoke all on public\.client_error_rate from public, anon, authenticated/,
    );
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
    for (const c of [
      'categories_label_len',
      'categories_titles_size',
      'categories_ats_roles_size',
      'groups_label_len',
      'tiles_name_len',
      'tiles_url_len',
      'tiles_meta_len',
    ])
      expect(body).toContain(`add constraint ${c}`);
  });

  it('caps rows per user with a locked before-insert trigger', () => {
    expect(body).toMatch(/pg_advisory_xact_lock/);
    for (const t of ['categories', 'groups', 'tiles'])
      expect(body).toMatch(new RegExp(`before insert on public\\.${t} for each row`));
  });

  it('ties a group to a category, and a tile to a group, of the same user', () => {
    expect(body).toMatch(
      /foreign key \(category_id, user_id\) references public\.categories \(id, user_id\)/,
    );
    expect(body).toMatch(
      /foreign key \(group_id, user_id\) references public\.groups \(id, user_id\)/,
    );
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

describe('board suggestions tables (#576 item 5)', () => {
  const f = files.find((x) => /_board_suggestions\.sql$/.test(x));
  const body = f ? code(f) : '';

  it('exists', () => expect(f).toBeDefined());

  it('turns RLS on for both tables', () => {
    expect(body).toContain('alter table public.board_suggestions enable row level security');
    expect(body).toContain('alter table public.board_probe_names enable row level security');
  });

  it('lets a signed-in user read and delete only their own suggestions, and write none', () => {
    expect(body).toMatch(
      /create policy "read own rows" on public\.board_suggestions for select to authenticated using \(auth\.uid\(\) = user_id\)/,
    );
    expect(body).toMatch(
      /create policy "delete own rows" on public\.board_suggestions for delete to authenticated using \(auth\.uid\(\) = user_id\)/,
    );
    const policies = [
      ...body.matchAll(/create policy "[^"]+" on public\.(\w+) for (\w+) to (\w+)/g),
    ];
    expect(policies.map((m) => [m[1], m[2], m[3]])).toEqual([
      ['board_suggestions', 'select', 'authenticated'],
      ['board_suggestions', 'delete', 'authenticated'],
    ]);
  });

  it('grants select and delete to authenticated only; the probe cache is service-only', () => {
    expect(body).toContain(
      'revoke all on public.board_suggestions from public, anon, authenticated',
    );
    expect(body).toContain(
      'revoke all on public.board_probe_names from public, anon, authenticated',
    );
    const grants = [
      ...body.matchAll(/grant ([a-z, ]+?) on (?:table )?public\.(board_\w+) to (\w+)/g),
    ];
    expect(grants.map((m) => [m[1], m[2], m[3]])).toEqual([
      ['select, delete', 'board_suggestions', 'authenticated'],
    ]);
  });

  it('checks every column a row carries', () => {
    expect(body).toMatch(/kind text not null check \(kind in \('greenhouse', 'lever', 'ashby'\)\)/);
    expect(body).toMatch(/slug text not null check \(slug ~ /);
    expect(body).toMatch(
      /company text not null check \(char_length\(company\) between 1 and 200\)/,
    );
    expect(body).toMatch(/jobs int not null default 0 check \(jobs between 0 and 100000\)/);
    expect(body).toMatch(
      /name_key text primary key check \(char_length\(name_key\) between 1 and 200\)/,
    );
  });

  it("caps suggestions per user with #320's locked trigger", () => {
    expect(body).toContain('drop trigger if exists board_suggestions_row_cap');
    expect(body).toMatch(
      /create trigger board_suggestions_row_cap before insert on public\.board_suggestions for each row execute function public\.cap_rows_per_user\('500'\)/,
    );
    // The trigger function is #320's, defined earlier.
    const caps = files.find((x) => /user_table_caps/.test(x));
    expect(caps && caps < f!).toBe(true);
  });

  it('ages suggestions and cached names out nightly', () => {
    expect(body).toMatch(/cron\.schedule\( 'board-suggestions-retention'/);
    expect(body).toMatch(
      /delete from public\.board_suggestions where found_at < now\(\) - interval '60 days'/,
    );
    expect(body).toMatch(
      /delete from public\.board_probe_names where checked_at < now\(\) - interval '90 days'/,
    );
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

  it('keeps no hash fallback anywhere in the server code, migrations or docs', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
      });
    const hits = ['supabase', 'docs', 'api']
      .filter((d) => fs.existsSync(d))
      .flatMap(walk)
      .filter((f) => /SYNC_SECRET_(SHA|HASH)/i.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe('live verification queries (#285)', () => {
  const file = 'supabase/verification/security_285_checks.sql';
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const body = raw
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  it('exists and is read-only (selects only, no writes or DDL)', () => {
    expect(raw).not.toBe('');
    expect(body).not.toMatch(
      /\b(insert into|delete from|alter table|create table|create policy|drop table|drop policy|grant |revoke |update public\.)/,
    );
    expect(body).toContain('select');
  });

  it('checks RLS, policies and anon grants for the four user tables', () => {
    for (const t of ['tracker', 'categories', 'groups', 'tiles']) expect(body).toContain(t);
    expect(body).toContain('relrowsecurity');
    expect(body).toContain('pg_policies');
    expect(body).toContain('role_table_grants');
    expect(body).toContain("'anon'");
  });

  it('checks the client_errors door and the tracker blob cap', () => {
    expect(body).toContain('report_client_error');
    expect(body).toContain('prosecdef');
    expect(body).toContain('tracker_data_size_cap');
    expect(body).toContain('octet_length(data::text) < 8000000');
  });
});

describe('least-privilege grants (L1, L2, L4)', () => {
  const f = '20261110100000_least_privilege_grants.sql';
  const body = files.includes(f) ? code(f) : '';

  it('takes every table privilege from anon and only regrants to authenticated', () => {
    expect(body).toContain('revoke all on all tables in schema public from anon, authenticated;');
    expect(body).not.toMatch(/grant [a-z, ]+ on public\.\w+ to [a-z_, ]*\banon\b/);
    for (const t of ['tracker', 'categories', 'groups', 'tiles'])
      expect(body).toContain(
        `grant select, insert, update, delete on public.${t} to authenticated;`,
      );
    for (const t of ['postings', 'sync_log', 'daily_picks'])
      expect(body).toContain(`grant select on public.${t} to authenticated;`);
  });

  it('makes new tables in public grant nothing to anon', () => {
    expect(body).toMatch(
      /alter default privileges for role postgres in schema public revoke all on tables from anon/,
    );
  });

  it('moves the user-owned policies to authenticated', () => {
    for (const t of ['postings', 'skips', 'sync_log', 'tracker', 'watched_companies'])
      expect(body).toMatch(new RegExp(`alter policy "[^"]+" on public\\.${t} to authenticated;`));
  });

  it('takes net.* from anon and authenticated, and keeps report_client_error for anon', () => {
    expect(body).toContain(
      'revoke execute on all functions in schema net from public, anon, authenticated;',
    );
    expect(body).toContain(
      'grant execute on function public.report_client_error to anon, authenticated;',
    );
  });
});
