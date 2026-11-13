// Supabase deploy from CI (#596): which migrations to apply, in what order around the
// sync-postings deploy, and whether the function changed. Pure: scripts/supabase-deploy.ts reads
// the ledger and git, then asks these functions. No app code imports this file.
//
// The ledger is the CI's own record, ops.deployed_migrations: one row per migration FILE NAME (the
// repo's names are the source of truth). It never reads or writes
// supabase_migrations.schema_migrations, whose rows were written by hand and by MCP with other
// version numbers.

/** A migration file the CI may apply: digits, an underscore, a snake_case name. */
export const MIGRATION_FILE = /^\d{8,14}_[a-z0-9_]+\.sql$/;
/** A commit sha (what goes in the ledger). */
export const SHA = /^[0-9a-f]{7,40}$/;

/** supabase/deploy-order.json: migrations that must run after the function is deployed. */
export interface DeployOrder {
  afterFunction: string[];
}

export interface DeployPlan {
  /** New migrations to apply before the function deploy, in file-name order. */
  before: string[];
  deployFunction: boolean;
  /** New migrations that need the new function first (deploy-order.json), in file-name order. */
  after: string[];
}

/** Files that are not migrations, or order entries that are not files: the deploy stops. */
export function orderProblems(files: string[], order: DeployOrder): string[] {
  const bad = files.filter((f) => !MIGRATION_FILE.test(f)).map((f) => `not a migration name: ${f}`);
  const missing = order.afterFunction
    .filter((f) => !files.includes(f))
    .map((f) => `deploy-order.json names a missing file: ${f}`);
  return [...bad, ...missing];
}

export function planDeploy(input: {
  files: string[];
  applied: string[];
  order: DeployOrder;
  functionChanged: boolean;
}): DeployPlan {
  const done = new Set(input.applied);
  const after = new Set(input.order.afterFunction);
  const pending = input.files.filter((f) => !done.has(f)).sort();
  const before = pending.filter((f) => !after.has(f));
  const late = pending.filter((f) => after.has(f));
  // A migration that needs the new function forces a function deploy, so it never runs against
  // the old one.
  return { before, deployFunction: input.functionChanged || late.length > 0, after: late };
}

/** Relative import specifiers in a TypeScript source (static, re-export and dynamic). */
export function localImports(source: string): string[] {
  const out = new Set<string>();
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;
  for (const m of source.matchAll(re)) out.add(m[2]);
  return [...out];
}

/** Did any changed path touch a file the function is built from? */
export const touchesFunction = (changed: string[], graph: Set<string>): boolean =>
  changed.some((p) => graph.has(p) || p.startsWith('supabase/functions/sync-postings/'));

/** One migration and its ledger row, in one transaction. File and sha are checked first. */
export function applySql(file: string, sql: string, sha: string): string {
  if (!MIGRATION_FILE.test(file)) throw new Error(`bad migration name: ${file}`);
  if (!SHA.test(sha)) throw new Error(`bad sha: ${sha}`);
  return [
    'begin;',
    sql,
    ';',
    `insert into ops.deployed_migrations (file, sha) values ('${file}', '${sha}');`,
    'commit;',
  ].join('\n');
}

/** The CI's ledger. Not reachable through the API: the ops schema is not exposed by PostgREST and
 *  grants nothing to anon or authenticated. */
export const LEDGER_SQL = `
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;
create table if not exists ops.deployed_migrations (
  file        text primary key check (file ~ '^[0-9]{8,14}_[a-z0-9_]+\\.sql$'),
  sha         text not null check (sha ~ '^[0-9a-f]{7,40}$'),
  applied_at  timestamptz not null default now()
);
create table if not exists ops.deploys (
  id   bigint generated always as identity primary key,
  kind text not null check (kind in ('migrations', 'function', 'init')),
  sha  text not null check (sha ~ '^[0-9a-f]{7,40}$'),
  at   timestamptz not null default now()
);
revoke all on all tables in schema ops from public, anon, authenticated;
`;
