// Client error spike check (#598), run hourly by the error-spike workflow
// (docs/ci/proposed-error-spike.yml). For each production deploy whose first hour has ended since
// the last run, it counts crash reports (client_errors) in that hour and in the 7 days before, and
// opens one GitHub issue (labelled error-spike, the sha in its title) when they jumped. GitHub's
// app pushes the new issue to the repo's watchers.
//   node --experimental-strip-types scripts/error-spike.ts [--dry-run] [--deploy-at <iso> --sha <sha>]
// Env: ERROR_ALERT_TOKEN (the Supabase door, migration 20261112100000), GITHUB_TOKEN and
// GITHUB_REPOSITORY (set by Actions). --dry-run prints and opens nothing.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../src/config.ts';
import {
  AFTER_MS,
  BASELINE_MS,
  alertTitle,
  deploysToCheck,
  readyAtOf,
  spikeVerdict,
  type Deploy,
} from '../src/ops/errorSpike.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
// The cron is hourly; look back a little longer so a late run misses nothing (dedupe by sha).
const LOOKBACK_MS = 90 * 60 * 1000;

const token = process.env.ERROR_ALERT_TOKEN ?? '';
const gh = process.env.GITHUB_TOKEN ?? '';
const repo = process.env.GITHUB_REPOSITORY ?? 'hirobius/job-hunt';
if (!token) fail('ERROR_ALERT_TOKEN is not set');

function fail(msg: string): never {
  console.error(`error-spike: ${msg}`);
  process.exit(1);
}

async function github(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(gh ? { authorization: `Bearer ${gh}` } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (!res.ok) fail(`GitHub ${init.method ?? 'GET'} ${path}: ${res.status}`);
  return res.json();
}

async function count(from: number, to: number): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/client_error_count`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      p_token: token,
      p_from: new Date(from).toISOString(),
      p_to: new Date(to).toISOString(),
    }),
  });
  if (!res.ok) fail(`client_error_count: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return Number(await res.json());
}

async function productionDeploys(): Promise<Deploy[]> {
  const list = (await github(`/repos/${repo}/deployments?environment=Production&per_page=10`)) as {
    id: number;
    sha: string;
  }[];
  const out: Deploy[] = [];
  for (const d of list) {
    const statuses = (await github(`/repos/${repo}/deployments/${d.id}/statuses?per_page=30`)) as {
      state: string;
      created_at: string;
    }[];
    const readyAt = readyAtOf(statuses);
    if (readyAt) out.push({ sha: d.sha, readyAt });
  }
  return out;
}

async function alreadyAlerted(sha: string): Promise<boolean> {
  const issues = (await github(
    `/repos/${repo}/issues?labels=error-spike&state=all&per_page=50`,
  )) as { title: string }[];
  return issues.some((i) => i.title === alertTitle(sha));
}

async function alert(d: Deploy, line: string, after: number, baseline: number) {
  const body = [
    line,
    '',
    `Deploy: ${d.sha} (live ${d.readyAt}).`,
    `Hour after: ${after} reports. The 7 days before: ${baseline} reports.`,
    '',
    'Read the reports: Supabase dashboard > Table editor > client_errors (sort by created_at).',
    'Roll back if users are hurt: docs/ci/smoke-and-rollback.md.',
  ].join('\n');
  // The label may not exist yet; a 422 here means it does.
  await fetch(`https://api.github.com/repos/${repo}/labels`, {
    method: 'POST',
    headers: { authorization: `Bearer ${gh}`, accept: 'application/vnd.github+json' },
    body: JSON.stringify({ name: 'error-spike', color: 'B60205' }),
  });
  await github(`/repos/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title: alertTitle(d.sha), body, labels: ['error-spike'] }),
  });
}

const manualAt = flag('--deploy-at');
const deploys: Deploy[] = manualAt
  ? [{ sha: flag('--sha') ?? 'manual', readyAt: manualAt }]
  : deploysToCheck(await productionDeploys(), Date.now(), LOOKBACK_MS);

if (deploys.length === 0) console.log('error-spike: no deploy whose first hour just ended.');
for (const d of deploys) {
  const t = Date.parse(d.readyAt);
  const after = await count(t, t + AFTER_MS);
  const baseline = await count(t - BASELINE_MS, t);
  const v = spikeVerdict(after, baseline);
  console.log(`error-spike: ${d.sha.slice(0, 7)} ${v.line}`);
  if (!v.spike || dryRun) continue;
  if (await alreadyAlerted(d.sha)) console.log('error-spike: already alerted for this deploy.');
  else await alert(d, v.line, after, baseline);
}
