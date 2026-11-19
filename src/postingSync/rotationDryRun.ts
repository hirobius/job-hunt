// The rotation half of `npm run sync:dry-run -- --rotate` (scripts/dry-run-sync.ts): plans the next
// batch from an empty cursor over a board set, prints the batch and the run-time math, and with a
// `fetch` reads that batch the way the edge function does (runBatch → readAll → scoreBatch →
// keepForScan → advance). Pure apart from the injected fetch and clock, so rotationDryRun.test.ts
// runs it on the recorded live answers in ./fixtures (`--fixtures` does the same from the CLI).
// Explicit `.ts` specifiers so Node's strip-types loads it.
import type { SetBoard } from '../feed/boardSet.ts';
import { boardApiUrl } from '../feed/sources/ats.ts';
import {
  advance,
  emptyRotation,
  keepForScan,
  pickBatch,
  ROTATION,
  rotationMath,
  rotationOrder,
  runBatch,
  sampleBoards,
  toWatched,
} from './rotation.ts';
import { readAll, scoreBatch } from './sync.ts';
import { designSystemsTrack } from './track-config.ts';

type Fetch = (url: string) => Promise<Response>;

export interface RotationDryRun {
  lines: string[];
  /** Per board read: its key and result (absent without `fetch`). */
  results?: { key: string; result: string; status?: number }[];
  scored?: number;
  /** Titles the scan would store (queue/review and remote). */
  kept?: string[];
  cursor?: string;
}

export async function rotationDryRun(o: {
  boards: readonly SetBoard[];
  generated?: string;
  now?: () => number;
  /** Read the batch too. */
  fetch?: Fetch;
  /** Leave out the sample-size math rows (tests). */
  math?: boolean;
}): Promise<RotationDryRun> {
  const now = o.now ?? Date.now;
  const boards = [...o.boards];
  const t0 = now();
  const state = emptyRotation(t0);
  const pick = pickBatch(boards, state, new Map(), t0);
  const toRead = pick.steps.filter((s) => s.action === 'read');
  const out: string[] = [];
  out.push(
    `Rotation dry run · board set ${o.generated || '(no date)'}: ${boards.length} boards`,
    `Knobs: ${ROTATION.maxBoards} boards / ${ROTATION.jobsBudget} roles per run, time box ${ROTATION.timeBoxMs / 1000} s, cron every ${ROTATION.cronMinutes} min, ${ROTATION.hostConcurrency} per host (${Object.entries(
      ROTATION.hostLimits,
    )
      .map(([h, n]) => `${h} ${n}`)
      .join(', ')}), ${ROTATION.globalConcurrency} in all`,
    '',
    `Next batch (cycle ${pick.cycle}, after '${pick.startCursor}'): ${toRead.length} boards, ${toRead.reduce((n, s) => n + (s.board.jobs ?? ROTATION.unknownJobs), 0)} roles`,
  );
  for (const s of toRead)
    out.push(`  ${s.key.padEnd(40)} ${s.host.padEnd(16)} ${s.board.jobs ?? '?'} roles`);
  const row = (label: string, m: ReturnType<typeof rotationMath>) =>
    `  ${label.padEnd(30)} ${String(m.runsPerCycle).padStart(5)} runs · ${m.boardsPerRun.toFixed(1).padStart(5)} boards/run · ${m.hoursPerCycle.toFixed(1).padStart(5)} h a cycle · slowest batch ~${(m.estBatchReadMs / 1000).toFixed(0)} s of reads${m.meetsTarget ? '' : ' (over target)'}${m.fitsTimeBox ? '' : ' (over the time box)'}`;
  out.push('', `Cycle (target ≤ ${ROTATION.targetCycleHours} h):`);
  const inOrder = rotationOrder(boards).map((x) => x.board);
  const m = rotationMath(inOrder);
  out.push(row(`this set (${boards.length})`, m));
  if (o.math !== false)
    for (const n of [5000, 10_000])
      for (const jobs of [30, 100])
        out.push(row(`${n} boards × ${jobs} roles`, rotationMath(sampleBoards(n, jobs))));
  out.push(
    `  ${m.invocationsPerMonth} invocations a month · reads at ${ROTATION.estReadMs / 1000} s each · writes stop at ${ROTATION.writeDeadlineMs / 1000} s, lease ${ROTATION.leaseMs / 1000} s (fits: ${m.fitsWall})`,
  );
  if (!o.fetch) return { lines: out };

  const fetch = o.fetch;
  const started = now();
  const steps = new Map(toRead.map((s) => [s.key, s]));
  const results = await runBatch(
    toRead.map((s) => ({ key: s.key, host: s.host })),
    async ({ key }) =>
      (
        await readAll([toWatched(steps.get(key)!.board)], { fetch: (u) => fetch(u), rss: false })
      )[0],
    { ...ROTATION, now, startedAt: started },
  );
  const answered = results.flatMap((r) => (r.result === 'ok' && r.value ? [r.value] : []));
  const scored = scoreBatch(answered, designSystemsTrack);
  const kept = scored.filter(keepForScan);
  const next = advance(boards, state, pick, results, new Map(), now()).state;
  out.push('', `Read in ${((now() - started) / 1000).toFixed(1)} s:`);
  for (const r of results)
    out.push(`  ${r.key.padEnd(40)} ${r.result}${r.status ? ` ${r.status}` : ''}`);
  out.push(
    `  ${scored.length} postings scored, ${kept.length} kept (queue/review and remote); cursor → '${next.cursor}'`,
  );
  for (const k of kept.slice(0, 20))
    out.push(`    ${k.verdict} ${k.score} · ${k.posting.company} · ${k.posting.title}`);
  return {
    lines: out,
    results: results.map((r) => ({
      key: r.key,
      result: r.result,
      ...(r.status && { status: r.status }),
    })),
    scored: scored.length,
    kept: kept.map((k) => k.posting.title),
    cursor: next.cursor,
  };
}

/** The boards in ./fixtures, and a fetch that serves them: any other URL is a 404, so a board
 *  missing from the set reads as gone. Greenhouse, Lever and Ashby are live answers recorded
 *  2026-10-30 (`recorded`); the five newer kinds (#576) are built from the shapes atsExtra.ts reads,
 *  because their hosts could not be reached from the build container (unverified live). */
const shaped = (kind: SetBoard['kind'], company: string) => ({
  kind,
  slug: 'acme',
  company,
  jobs: 2,
  lastChecked: '2026-11-11',
  evidence: 'shape fixture',
  file: `${kind}-acme.json`,
  recorded: false,
});
export const FIXTURE_BOARDS: readonly (SetBoard & { file: string; recorded: boolean })[] = [
  {
    kind: 'greenhouse',
    slug: 'discord',
    company: 'Discord',
    jobs: 2,
    lastChecked: '2026-10-30',
    evidence: 'recorded fixture',
    file: 'greenhouse-discord.json',
    recorded: true,
  },
  {
    kind: 'lever',
    slug: 'spotify',
    company: 'Spotify',
    jobs: 2,
    lastChecked: '2026-10-30',
    evidence: 'recorded fixture',
    file: 'lever-spotify.json',
    recorded: true,
  },
  {
    kind: 'ashby',
    slug: 'linear',
    company: 'Linear',
    jobs: 2,
    lastChecked: '2026-10-30',
    evidence: 'recorded fixture',
    file: 'ashby-linear.json',
    recorded: true,
  },
  shaped('bamboohr', 'Acme Bamboo'),
  shaped('rippling', 'Acme Ripple'),
  shaped('gem', 'Acme Gem'),
  shaped('pinpoint', 'Acme Pin'),
  shaped('breezy', 'Acme Breeze'),
];

export function fixtureFetch(read: (file: string) => string): Fetch {
  const byUrl = new Map(FIXTURE_BOARDS.map((b) => [boardApiUrl(b), b.file]));
  return async (url) => {
    const file = byUrl.get(url);
    return file
      ? new Response(read(file), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('{}', { status: 404 });
  };
}
