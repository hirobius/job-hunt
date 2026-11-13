// Supabase deploy from CI (#596), run by the supabase-deploy workflow
// (docs/ci/proposed-supabase-deploy.yml) after the ci workflow passes on main.
//   node --experimental-strip-types scripts/supabase-deploy.ts            # plan: read only
//   node --experimental-strip-types scripts/supabase-deploy.ts --deploy   # apply + deploy
//   node --experimental-strip-types scripts/supabase-deploy.ts --init     # once: ledger + baseline
// --deploy and --init write to production, so they run only inside GitHub Actions
// (GITHUB_ACTIONS=true); anywhere else the script refuses them.
// Order: new migrations (file-name order), then sync-postings (only when a file it is built from
// changed since its last CI deploy, or a migration needs it), then the deploy-order.json "after"
// migrations. Each migration and its ledger row are one transaction; the first failure stops the
// run. The deployed commit goes in ops.deploys and the job summary.
// Env: SUPABASE_ACCESS_TOKEN (a Supabase personal access token; never logged), SUPABASE_PROJECT_REF
// (default: the app's project), GITHUB_SHA (default: git HEAD), GITHUB_STEP_SUMMARY (optional).
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import {
  LEDGER_SQL,
  SHA,
  applySql,
  localImports,
  orderProblems,
  planDeploy,
  touchesFunction,
  type DeployOrder,
} from '../src/ops/supabaseDeploy.ts';

const CLI = 'supabase@2.122.0';
const FUNCTION = 'sync-postings';
const ENTRY = `supabase/functions/${FUNCTION}/index.ts`;
const mode = process.argv.includes('--deploy')
  ? 'deploy'
  : process.argv.includes('--init')
    ? 'init'
    : 'plan';
const ref = process.env.SUPABASE_PROJECT_REF || 'nelrcmbkimjjmfmgnixj';
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';

function fail(msg: string): never {
  console.error(`supabase-deploy: ${msg}`);
  process.exit(1);
}
function git(argv: string[]): string {
  const r = spawnSync('git', argv, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}
function summary(line: string) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

if (mode !== 'plan' && process.env.GITHUB_ACTIONS !== 'true') {
  fail(`--${mode} writes to production and runs only in GitHub Actions; run without it to plan`);
}
const sha = process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']).trim();
if (!SHA.test(sha)) fail(`bad sha ${sha}`);

/** Supabase Management API: run SQL. Every read is sent read_only. */
async function query(sql: string, readOnly: boolean): Promise<Record<string, unknown>[]> {
  if (!token) fail('SUPABASE_ACCESS_TOKEN is not set');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql, read_only: readOnly }),
  });
  const text = await res.text();
  if (!res.ok) fail(`query failed: ${res.status} ${text.slice(0, 400)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>[]) : [];
}

/** Every repo file the function is built from (its relative import graph). */
function functionGraph(): Set<string> {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) return;
    for (const spec of localImports(readFileSync(file, 'utf8'))) {
      walk(normalize(join(dirname(file), spec)));
    }
  };
  walk(ENTRY);
  return seen;
}

const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const order = JSON.parse(readFileSync('supabase/deploy-order.json', 'utf8')) as DeployOrder;
const problems = orderProblems(files, order);
if (problems.length) fail(problems.join('; '));

if (mode === 'init') {
  // Once, when the CI takes over: every migration in the repo at this commit is already live
  // (Adrian checks that first, docs/ci/supabase-deploy.md), so it records them all.
  const rows = files.map((f) => `('${f}', '${sha}')`).join(',\n');
  await query(
    `${LEDGER_SQL}
insert into ops.deployed_migrations (file, sha) values ${rows} on conflict (file) do nothing;
insert into ops.deploys (kind, sha) values ('init', '${sha}');`,
    false,
  );
  summary(
    `supabase-deploy: ledger ready, ${files.length} migrations recorded at ${sha.slice(0, 7)}.`,
  );
  process.exit(0);
}

const ledger = await query(`select to_regclass('ops.deployed_migrations') is not null as ok`, true);
if (!ledger[0]?.ok) {
  fail('no ledger yet: run the workflow once with mode "init" (docs/ci/supabase-deploy.md)');
}
const applied = (await query('select file from ops.deployed_migrations', true)).map((r) =>
  String(r.file),
);
const last = await query(
  `select sha from ops.deploys where kind = 'function' order by at desc limit 1`,
  true,
);
const lastSha = last[0] ? String(last[0].sha) : '';
// No CI deploy yet, or the last one's commit is not in this checkout: deploy.
let functionChanged = true;
if (lastSha) {
  const diff = spawnSync('git', ['diff', '--name-only', lastSha, sha], { encoding: 'utf8' });
  if (diff.status === 0) {
    functionChanged = touchesFunction(diff.stdout.split('\n').filter(Boolean), functionGraph());
  }
}
const plan = planDeploy({ files, applied, order, functionChanged });
summary(`### Supabase deploy plan at ${sha.slice(0, 7)}`);
summary(`- before the function: ${plan.before.join(', ') || 'none'}`);
summary(
  `- ${FUNCTION}: ${plan.deployFunction ? 'deploy' : 'unchanged'} (last CI deploy: ${lastSha.slice(0, 7) || 'none'})`,
);
summary(`- after the function: ${plan.after.join(', ') || 'none'}`);
if (mode === 'plan') process.exit(0);

async function apply(list: string[]) {
  for (const f of list) {
    await query(applySql(f, readFileSync(join('supabase/migrations', f), 'utf8'), sha), false);
    summary(`- applied ${f}`);
  }
}

await apply(plan.before);
if (plan.deployFunction) {
  const r = spawnSync(
    'npx',
    [
      '--yes',
      CLI,
      'functions',
      'deploy',
      FUNCTION,
      '--project-ref',
      ref,
      '--use-api',
      // The cron calls it with x-sync-secret, not a user JWT.
      '--no-verify-jwt',
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) fail(`${FUNCTION} deploy failed (the migrations above are applied)`);
  await query(`insert into ops.deploys (kind, sha) values ('function', '${sha}')`, false);
  summary(`- deployed ${FUNCTION} at ${sha.slice(0, 7)}`);
}
await apply(plan.after);
if (plan.before.length || plan.after.length) {
  await query(`insert into ops.deploys (kind, sha) values ('migrations', '${sha}')`, false);
}
summary('supabase-deploy: done.');
