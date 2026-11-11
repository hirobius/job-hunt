// The weekly board-discovery refresh's report (#576 item 2): what changed between the committed
// board set (src/feed/data/boards.json) and a fresh `npm run boards:discover`, and whether the new
// set is safe to propose. A run where a source failed or the network was blocked can come back
// with far fewer boards; that must never reach a PR as "these boards closed". Pure.

export interface SetBoardLike {
  kind: string;
  slug: string;
  eu?: boolean;
  company?: string;
}
export interface BoardSetLike {
  generated?: string;
  boards: SetBoardLike[];
  sources?: { id?: string; label?: string; error?: string }[];
}

export interface BoardsDiff {
  before: number;
  after: number;
  added: SetBoardLike[];
  removed: SetBoardLike[];
  /** Added and removed per board kind. */
  byKind: Record<string, { added: number; removed: number }>;
  /** Sources the new run could not read (their boards may look removed). */
  failedSources: string[];
  /** Why this run must not open a PR; empty when it may. */
  blockers: string[];
}

/** A removal share over this blocks the PR (a healthy week moves a few percent). */
export const MAX_REMOVED_SHARE = 0.1;

const key = (b: SetBoardLike) => `${b.kind}:${b.eu ? 'eu:' : ''}${b.slug.toLowerCase()}`;

export function diffBoardSets(prev: BoardSetLike, next: BoardSetLike): BoardsDiff {
  const before = new Map(prev.boards.map((b) => [key(b), b]));
  const after = new Map(next.boards.map((b) => [key(b), b]));
  const added = [...after].filter(([k]) => !before.has(k)).map(([, b]) => b);
  const removed = [...before].filter(([k]) => !after.has(k)).map(([, b]) => b);
  const byKind: BoardsDiff['byKind'] = {};
  for (const [list, field] of [
    [added, 'added'],
    [removed, 'removed'],
  ] as const)
    for (const b of list) {
      byKind[b.kind] ??= { added: 0, removed: 0 };
      byKind[b.kind][field]++;
    }
  const failedSources = (next.sources ?? [])
    .filter((s) => s.error)
    .map((s) => `${s.label ?? s.id ?? 'source'}: ${s.error}`);
  const blockers: string[] = [];
  if (!next.boards.length) blockers.push('the new set has no boards');
  if (before.size && removed.length / before.size > MAX_REMOVED_SHARE)
    blockers.push(
      `${removed.length} of ${before.size} boards removed (over ${MAX_REMOVED_SHARE * 100}%)`,
    );
  if (!added.length && !removed.length) blockers.push('no change');
  return {
    before: before.size,
    after: after.size,
    added,
    removed,
    byKind,
    failedSources,
    blockers,
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
    `Boards: ${d.before} → ${d.after} (+${d.added.length}, −${d.removed.length}).`,
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
    d.failedSources.length
      ? `Sources not read this run:\n${d.failedSources.map((s) => `- ${s}`).join('\n')}`
      : 'Every source was read.',
    '',
    'Made by `npm run discover:boards`. Review the removals before you merge.',
  ].join('\n');
}
