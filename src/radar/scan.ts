// Role Radar's scan (docs/specs/role-radar.md, `scan`): read many company boards with a
// concurrency limit, keep going when one fails, and say what happened to each board — the
// research's "dropped: closed / couldn't be verified" list, made automatic.
import { boardLabel, fetchBoard, type Board } from '../feed/sources/ats';
import { FetchError, type FetchJson } from '../feed/sources/http';
import { liveFetchJson } from '../feed/fetchFeed';
import type { Posting } from '../feed/types';

/** Parallel requests at most — polite to the ATSs and kind to a phone's connection. */
export const SCAN_CONCURRENCY = 6;

export type BoardOutcome = 'ok' | 'closed' | 'unreachable';

export interface BoardStatus {
  key: string;
  label: string;
  outcome: BoardOutcome;
  /** Openings the board listed, before any filtering. */
  openings: number;
}

export interface ScanResult {
  postings: Posting[];
  boards: BoardStatus[];
}

export async function scanBoards(
  boards: Board[],
  fetchJson: FetchJson = liveFetchJson,
  {
    concurrency = SCAN_CONCURRENCY,
    onProgress,
  }: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<ScanResult> {
  const statuses: BoardStatus[] = new Array(boards.length);
  const found: Posting[][] = new Array(boards.length);
  let next = 0;
  let done = 0;

  const worker = async () => {
    while (next < boards.length) {
      const i = next++;
      const b = boards[i];
      const key = `${b.kind}:${b.slug}`;
      const label = boardLabel(b);
      try {
        // Only http(s) links are ever rendered (never `javascript:`), as in the live feed.
        const postings = (await fetchBoard(b, fetchJson)).filter((p) =>
          /^https?:\/\//i.test(p.url),
        );
        found[i] = postings;
        statuses[i] = { key, label, outcome: 'ok', openings: postings.length };
      } catch (e) {
        found[i] = [];
        // A 404 means the board is gone (closed, or moved to another ATS); anything else is unknown.
        const outcome = e instanceof FetchError && e.status === 404 ? 'closed' : 'unreachable';
        statuses[i] = { key, label, outcome, openings: 0 };
      }
      onProgress?.(++done, boards.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, boards.length) }, worker));
  return { postings: found.flat(), boards: statuses };
}

/** "3 boards read · 1 closed (Acme) · 1 didn't answer (Beta)" — the research's "dropped" line. */
export function boardReport(boards: BoardStatus[]): string {
  const of = (o: BoardStatus['outcome']) => boards.filter((b) => b.outcome === o);
  const ok = of('ok').length;
  const names = (bs: BoardStatus[]) => bs.map((b) => b.label).join(', ');
  const closed = of('closed');
  const down = of('unreachable');
  return [
    `${ok} ${ok === 1 ? 'board' : 'boards'} read`,
    closed.length ? `${closed.length} closed (${names(closed)})` : '',
    down.length ? `${down.length} didn’t answer (${names(down)})` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
