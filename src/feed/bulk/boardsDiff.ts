// The weekly board-discovery refresh's report (#576 item 2): what changed between the committed
// board set (src/feed/data/boards.json) and a fresh `npm run boards:discover`, and whether the new
// set is safe to propose. The run itself never drops a board on one bad answer (refresh.ts
// `carryForward`); this is the second guard: a run where a source failed or one board host was
// down must never reach a PR as "these boards closed". Pure.

import { MAX_MISSES } from './refresh.ts';

export interface SetBoardLike {
  kind: string;
  slug: string;
  eu?: boolean;
  company?: string;
  jobs?: number;
  misses?: number;
}
export interface BoardSetLike {
  generated?: string;
  boards: SetBoardLike[];
  sources?: { id?: string; label?: string; error?: string; candidates?: number }[];
}

export interface BoardsDiff {
  before: number;
  after: number;
  added: SetBoardLike[];
  removed: SetBoardLike[];
  /** Boards in both whose line changed (roles moved a step, a miss counted or cleared). */
  changed: number;
  /** Boards in the new set that answered 404 lately and are kept (`misses` on the line). */
  missing: SetBoardLike[];
  /** Added and removed per board kind. */
  byKind: Record<string, { added: number; removed: number }>;
  /** Sources the new run could not read (their boards were kept as they were). */
  failedSources: string[];
  /** Why this run must not open a PR; empty when it may. `unsafe` is false only for "no change". */
  blockers: string[];
  unsafe: boolean;
}

/** A removal share over this blocks the PR (a healthy week moves a few percent). */
export const MAX_REMOVED_SHARE = 0.1;
/** One kind losing over this share of its boards blocks the PR (its host failed, most likely). */
export const MAX_KIND_REMOVED_SHARE = 0.25;

const key = (b: SetBoardLike) => `${b.kind}:${b.eu ? 'eu:' : ''}${b.slug.toLowerCase()}`;

export function diffBoardSets(prev: BoardSetLike, next: BoardSetLike): BoardsDiff {
  const before = new Map(prev.boards.map((b) => [key(b), b]));
  const after = new Map(next.boards.map((b) => [key(b), b]));
  const added = [...after].filter(([k]) => !before.has(k)).map(([, b]) => b);
  const removed = [...before].filter(([k]) => !after.has(k)).map(([, b]) => b);
  const changed = [...after].filter(
    ([k, b]) => before.has(k) && JSON.stringify(before.get(k)) !== JSON.stringify(b),
  ).length;
  const missing = next.boards.filter((b) => (b.misses ?? 0) > 0);
  const byKind: BoardsDiff['byKind'] = {};
  for (const [list, field] of [
    [added, 'added'],
    [removed, 'removed'],
  ] as const)
    for (const b of list) {
      byKind[b.kind] ??= { added: 0, removed: 0 };
      byKind[b.kind][field]++;
    }
  const name = (s: { id?: string; label?: string }) => s.label ?? s.id ?? 'source';
  const failed = (next.sources ?? []).filter((s) => s.error);
  const failedSources = failed.map((s) => `${name(s)}: ${s.error}`);
  const blockers: string[] = [];
  // A source that read last time (or is new) and failed now: this run saw less than the last one.
  // One that failed last time too (Common Crawl from a blocked network) is only reported.
  for (const s of failed) {
    const was = (prev.sources ?? []).find((p) => (p.id ?? p.label) === (s.id ?? s.label));
    if (!was?.error) blockers.push(`source ${name(s)} failed (${s.error})`);
  }
  if (!next.boards.length) blockers.push('the new set has no boards');
  if (before.size && removed.length / before.size > MAX_REMOVED_SHARE)
    blockers.push(
      `${removed.length} of ${before.size} boards removed (over ${MAX_REMOVED_SHARE * 100}%)`,
    );
  const kindSize: Record<string, number> = {};
  for (const b of before.values()) kindSize[b.kind] = (kindSize[b.kind] ?? 0) + 1;
  for (const [kind, n] of Object.entries(kindSize)) {
    const lost = byKind[kind]?.removed ?? 0;
    if (lost / n > MAX_KIND_REMOVED_SHARE)
      blockers.push(
        `${kind} lost ${lost} of ${n} boards (over ${MAX_KIND_REMOVED_SHARE * 100}% of one kind)`,
      );
  }
  const unsafe = blockers.length > 0;
  if (!unsafe && !added.length && !removed.length && !changed) blockers.push('no change');
  return {
    before: before.size,
    after: after.size,
    added,
    removed,
    changed,
    missing,
    byKind,
    failedSources,
    blockers,
    unsafe,
  };
}

const SAMPLE = 30;
const line = (b: SetBoardLike) => `- ${b.kind}: \`${b.slug}\`${b.company ? ` (${b.company})` : ''}`;

/** The PR body: counts, per kind, a sample of each list, failed sources. Plain Markdown. */
export function diffMarkdown(d: BoardsDiff, generated = ''): string {
  const kinds = Object.keys(d.byKind).sort();
  return [
    `Weekly board discovery refresh${generated ? ` (${generated})` : ''}.`,
    '',
    `Boards: ${d.before} → ${d.after} (+${d.added.length}, −${d.removed.length}, ${d.changed} lines changed).`,
    '',
    `A board is removed only after ${MAX_MISSES} weekly 404s in a row; one that did not answer is kept.`,
    '',
    '| Kind | Added | Removed |',
    '|---|---|---|',
    ...kinds.map((k) => `| ${k} | ${d.byKind[k].added} | ${d.byKind[k].removed} |`),
    '',
    `Added (first ${SAMPLE}):`,
    ...d.added.slice(0, SAMPLE).map(line),
    '',
    `Removed (first ${SAMPLE}):`,
    ...d.removed.slice(0, SAMPLE).map(line),
    '',
    `Kept after a 404 (${d.missing.length}; first ${SAMPLE}):`,
    ...d.missing.slice(0, SAMPLE).map((b) => `${line(b)}: ${b.misses} of ${MAX_MISSES} misses`),
    '',
    d.failedSources.length
      ? `Sources not read this run:\n${d.failedSources.map((s) => `- ${s}`).join('\n')}`
      : 'Every source was read.',
    '',
    'Made by `npm run discover:boards`. Review the removals before you merge.',
  ].join('\n');
}
