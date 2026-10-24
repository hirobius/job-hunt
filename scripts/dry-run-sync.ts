// Dry run of the postings sync (Muse Phase 2 + 2.5), no database: reads the companies we can name
// without one (the brief's verified list, plus the design systems starter boards in
// src/radar/directory.ts) and the designsystems.jobs feed, scores everything with the Design
// Systems track, and prints counts per source, the queue/review/reject split and the first 20
// queued titles. A host the network refuses is named.
//   node --experimental-strip-types scripts/dry-run-sync.ts
// (behind a proxy: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<bundle>)
import { DIRECTORY_BY_PACK, TARGETS_BY_PACK } from '../src/radar/directory.ts';
import { readAll, scoreBatch } from '../src/tracks/sync.ts';
import type { WatchedCompany } from '../src/tracks/sources.ts';
import { designSystemsTrack } from '../src/tracks/track-config.ts';
import { VERIFIED_COMPANIES } from '../src/tracks/verified.ts';
import { watchedFromUrl } from '../src/tracks/watched.ts';

const seen = new Set<string>();
const companies: WatchedCompany[] = [];
const add = (c: WatchedCompany | null) => {
  const k = c && `${c.ats}:${c.slug.toLowerCase()}`;
  if (!c || !k || seen.has(k)) return;
  seen.add(k);
  companies.push(c);
};
VERIFIED_COMPANIES.forEach(add);
TARGETS_BY_PACK.designsystems.forEach((c) => add(watchedFromUrl(c.url, c.company)));
DIRECTORY_BY_PACK.designsystems.forEach((u) => add(watchedFromUrl(u)));

const started = Date.now();
const reads = await readAll(companies, { fetch: (u) => fetch(u), rss: true });
const scored = scoreBatch(reads, designSystemsTrack);

const bySource: Record<string, { boards: number; ok: number; postings: number }> = {};
for (const r of reads) {
  const src = r.company?.ats ?? 'rss (designsystems.jobs)';
  const s = (bySource[src] ??= { boards: 0, ok: 0, postings: 0 });
  s.boards++;
  if (r.ok) s.ok++;
  s.postings += r.postings.length;
}
const failed = reads.filter((r) => !r.ok);
const hosts = new Map<string, string[]>();
for (const r of failed) {
  const host =
    r.board === 'rss'
      ? 'designsystems.jobs'
      : { greenhouse: 'boards-api.greenhouse.io', lever: 'api.lever.co', ashby: 'api.ashbyhq.com' }[
          r.company!.ats
        ];
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
  `Dry run ${new Date().toISOString()} · ${companies.length} companies + RSS · ${((Date.now() - started) / 1000).toFixed(0)} s`,
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
