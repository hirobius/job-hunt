// Dry run of the postings sync (Muse Phase 2 + 2.5; Simplify 6/9), no database: plans the run from
// a v11-shaped blob holding the companies we can name without one (the design systems starter
// boards and targets in src/radar/directory.ts; the plan adds the brief's verified list), the same
// way the edge function plans each user's run (src/tracks/plan.ts). Then it reads those boards, HN
// and Jobicy for the plan's titles (never Remotive: its daily budget is for the app) and the
// designsystems.jobs feed, scores everything with the plan's config, and prints counts per source,
// the queue/review/reject split and the first 20 queued titles. A host the network refuses is
// named.
//   node --experimental-strip-types scripts/dry-run-sync.ts
// With --rotate: plans the scan rotation's next batch from the committed board set
// (src/feed/data/boards.json) with no network and prints the batch and the run-time math
// (src/tracks/rotation.ts); add --read to read that batch too (the same reads the edge function
// makes) and count what the design systems scorer would store.
//   npm run sync:dry-run -- --rotate [--read]
// --rotate --fixtures reads the recorded live answers in src/tracks/fixtures, offline
// (rotationDryRun.test.ts runs the same case).
// (behind a proxy: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<bundle>)
import { boardApiUrl } from '../src/feed/sources/ats.ts';
import { planFromBlob } from '../src/tracks/plan.ts';
import { readAll, scoreBatch } from '../src/tracks/sync.ts';
import boardsJson from '../src/feed/data/boards.json' with { type: 'json' };
import { parseBoardSet } from '../src/feed/boardSet.ts';
import { FIXTURE_BOARDS, fixtureFetch, rotationDryRun } from '../src/tracks/rotationDryRun.ts';

if (process.argv.includes('--rotate')) {
  await rotateDryRun(process.argv.includes('--read'), process.argv.includes('--fixtures'));
  process.exit(0);
}

/** The rotation's first batch from an empty cursor, and the cycle math (src/tracks/rotationDryRun.ts).
 *  --fixtures reads the recorded live answers (src/tracks/fixtures) instead of the network. */
async function rotateDryRun(read: boolean, fixtures: boolean) {
  if (fixtures) {
    const { readFileSync } = await import('node:fs');
    const r = await rotationDryRun({
      boards: FIXTURE_BOARDS,
      generated: 'recorded fixtures',
      fetch: fixtureFetch((f) => readFileSync(`src/tracks/fixtures/${f}`, 'utf8')),
    });
    console.log(r.lines.join('\n'));
    return;
  }
  const set = parseBoardSet(boardsJson);
  const r = await rotationDryRun({
    boards: set.boards,
    generated: set.generated,
    ...(read && { fetch: (u: string) => fetch(u) }),
  });
  console.log(r.lines.join('\n'));
}

// Loaded here, not imported, so --rotate runs without it.
const { DIRECTORY_BY_PACK, TARGETS_BY_PACK } = await import('../src/radar/directory.ts');
const blob = {
  v: 11,
  mustInclude: { ds: { terms: ['design system'], atsOff: [] } },
  sweeps: { ds: { titles: ['Design Systems Engineer', 'Design Technologist'], off: [] } },
  targets: { ds: [] },
};
const tiles = [
  ...TARGETS_BY_PACK.designsystems.map((c) => ({ url: c.url, name: c.company })),
  ...DIRECTORY_BY_PACK.designsystems.map((url) => ({ url, name: '' })),
];
const plan = planFromBlob(blob, tiles)!;
const companies = plan.boards;

const started = Date.now();
const reads = await readAll(companies, {
  fetch: (u) => fetch(u),
  rss: plan.feeds.has('rss'),
  terms: { hn: plan.terms, jobicy: plan.terms },
});
const scored = scoreBatch(reads, plan.config);

const bySource: Record<string, { boards: number; ok: number; postings: number }> = {};
for (const r of reads) {
  const src = r.company?.ats ?? (r.board === 'rss' ? 'rss (designsystems.jobs)' : r.board);
  const s = (bySource[src] ??= { boards: 0, ok: 0, postings: 0 });
  s.boards++;
  if (r.ok) s.ok++;
  s.postings += r.postings.length;
}
const failed = reads.filter((r) => !r.ok);
const hosts = new Map<string, string[]>();
for (const r of failed) {
  const host = r.company
    ? new URL(boardApiUrl({ kind: r.company.ats, slug: r.company.slug, eu: r.company.eu })).host
    : r.board === 'rss'
      ? 'designsystems.jobs'
      : r.board;
  const why = r.status ? `HTTP ${r.status}` : (r.error ?? 'failed').slice(0, 80);
  (hosts.get(host) ?? hosts.set(host, []).get(host)!).push(`${r.board} (${why})`);
}
const split = { queue: 0, review: 0, reject: 0 };
for (const s of scored) split[s.verdict]++;
const queued = scored
  .filter((s) => s.verdict === 'queue')
  .sort(
    (a, b) =>
      b.score - a.score || (b.posting.postedAt ?? '').localeCompare(a.posting.postedAt ?? ''),
  );

const out: string[] = [];
out.push(
  `Dry run ${new Date().toISOString()} · ${companies.length} companies, feeds for "${plan.terms.join('", "')}" + RSS · ${((Date.now() - started) / 1000).toFixed(0)} s`,
);
out.push('', 'Per source (boards read ok / boards, postings):');
for (const [src, s] of Object.entries(bySource))
  out.push(`  ${src.padEnd(26)} ${s.ok}/${s.boards} ok, ${s.postings} postings`);
const total = reads.reduce((n, r) => n + r.postings.length, 0);
out.push(`  total ${total} postings, ${scored.length} after fingerprint dedupe`);
out.push('', `Split: queue ${split.queue} · review ${split.review} · reject ${split.reject}`);
out.push('', 'First 20 queued (score · company · title):');
for (const q of queued.slice(0, 20))
  out.push(`  ${String(q.score).padStart(3)} · ${q.posting.company} · ${q.posting.title}`);
if (failed.length) {
  out.push('', 'Not read:');
  for (const [host, list] of hosts) out.push(`  ${host}: ${list.join(', ')}`);
}
const has = (company: string, title: string) =>
  queued.some((q) => q.posting.company.toLowerCase() === company && q.posting.title === title);
out.push(
  '',
  'Acceptance:',
  `  Stripe "Product Designer, Design Systems" queued: ${has('stripe', 'Product Designer, Design Systems')}`,
  `  Datadog "Senior Design Manager - Design Systems" queued: ${has('datadog', 'Senior Design Manager - Design Systems')}`,
  `  Stripe mechanical title queued: ${queued.some((q) => q.posting.company.toLowerCase() === 'stripe' && /mechanical/i.test(q.posting.title))}`,
  `  every queued posting has reasons: ${queued.every((q) => q.reasons.length > 0)}`,
);
console.log(out.join('\n'));
