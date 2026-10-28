// Liveness: is a saved job still on its company's board? A saved posting on any board in sources/ats.ts
// can be pulled by the employer at any time, and nothing else tells you. This re-reads each job's
// board (once per board, however many jobs it holds) and looks the job up by its posting ref.
//
// The answer is a cache in local storage (`rjb_liveness`), never part of a Job and never synced, so
// the sync blob is unchanged and losing it costs one re-check. It only ever flags: a closed job is
// shown as closed, its status is never changed. And it never guesses: a failed read is `unknown`.
import { dedupKey } from '../store';
import type { Job } from '../types';
import { loadPersisted, savePersisted } from '../persisted';
import { settleAll } from './fetchFeed';
import { boardApiUrl, boardJobs, fetchBoard, parseBoardUrl, type Board } from './sources/ats';
import { FetchError, type FetchJson } from './sources/http';

export type LiveState = 'open' | 'closed' | 'unknown';
export interface LiveCheck {
  state: LiveState;
  /** ISO timestamp of the check. */
  checkedAt: string;
  /** Why a check came back unknown, when we know (shown as a tooltip or caption). */
  hint?: string;
}

const LIVENESS_KEY = 'rjb_liveness';
/** A job checked less recently than this is checked again; fresher ones are left alone. */
const LIVENESS_TTL_MS = 6 * 60 * 60 * 1000;

/** The board a job URL belongs to and the posting ref inside it; null for any other site, or for
 *  the board's own page (a link with no posting in it). */
export function boardOfJobUrl(url: string): { board: Board; ref: string } | null {
  const board = parseBoardUrl(url);
  if (!board) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
  const seg = u.pathname.split('/').filter(Boolean);
  let ref: string | undefined;
  switch (board.kind) {
    case 'greenhouse': {
      const i = seg.indexOf('jobs');
      ref = i >= 0 ? seg[i + 1] : (u.searchParams.get('gh_jid') ?? undefined);
      break;
    }
    case 'lever':
    case 'ashby':
      ref = seg[1];
      break;
    case 'workable':
      ref = seg[1] === 'j' ? seg[2] : undefined;
      break;
    case 'recruitee':
      ref = seg[0] === 'o' ? seg[1] : undefined;
      break;
    // These three put the posting's numeric id in front of a title slug that may change.
    case 'smartrecruiters':
      ref = seg[1]?.match(/^\d+/)?.[0];
      break;
    case 'teamtailor':
      ref = seg[0] === 'jobs' ? seg[1]?.match(/^\d+/)?.[0] : undefined;
      break;
    case 'personio':
      ref = seg[0] === 'job' ? seg[1]?.match(/^\d+/)?.[0] : undefined;
      break;
    case 'bamboohr':
      ref = seg[0] === 'careers' ? seg[1] : undefined;
      break;
    case 'rippling': {
      const i = seg.indexOf('jobs');
      ref = i >= 0 ? seg[i + 1] : undefined;
      break;
    }
    case 'gem':
      ref = seg[1];
      break;
    case 'pinpoint':
      ref = seg[0] === 'postings' ? seg[1] : undefined;
      break;
    // Breezy's friendly id is the posting id, then a title slug that may change.
    case 'breezy':
      ref = seg[0] === 'p' ? seg[1]?.split('-')[0] || undefined : undefined;
      break;
  }
  return ref ? { board, ref } : null;
}

/** Saved or Applied jobs that sit on a supported board. Everything else is not checked, and so
 *  shows nothing (not even "unknown"). */
export function eligibleJobs(jobs: Job[]): Job[] {
  return jobs.filter(
    (j) =>
      !j.archived &&
      (j.status === 'Saved' || j.status === 'Applied') &&
      boardOfJobUrl(j.url) !== null,
  );
}

/** Eligible jobs worth checking now: never checked, last answer unknown, or older than the TTL.
 *  `force` (the "Check which are still open" button) ignores the cache. */
export function dueJobs(
  jobs: Job[],
  stored: Record<string, LiveCheck>,
  now: number,
  force = false,
): Job[] {
  return eligibleJobs(jobs).filter((j) => {
    if (force) return true;
    const c = stored[dedupKey(j.url)];
    if (!c || c.state === 'unknown') return true;
    const at = Date.parse(c.checkedAt);
    return Number.isNaN(at) || now - at >= LIVENESS_TTL_MS;
  });
}

const sameRef = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Re-read each job's board once and look each job up. A board that is reachable and well-formed
 *  without the job means closed; every failure (network, 4xx/5xx, a payload that isn't a board)
 *  means unknown. Jobs not on a supported board get no entry. */
export async function checkLive(
  jobs: Job[],
  fetchJson: FetchJson,
  now: number = Date.now(),
): Promise<Map<string, LiveCheck>> {
  const checkedAt = new Date(now).toISOString();
  const out = new Map<string, LiveCheck>();
  const groups = new Map<string, { board: Board; jobs: { job: Job; ref: string }[] }>();
  for (const job of jobs) {
    const r = boardOfJobUrl(job.url);
    if (!r) continue;
    const key = `${r.board.kind}:${r.board.slug.toLowerCase()}${r.board.eu ? ':eu' : ''}`;
    const g = groups.get(key) ?? { board: r.board, jobs: [] };
    g.jobs.push({ job, ref: r.ref });
    groups.set(key, g);
  }

  const all = [...groups.values()];
  const settled = await settleAll(
    all.map((g) => async () => {
      // Fresh: the feed's 1h cache may still hold the job the employer has since pulled.
      const body = await fetchJson(boardApiUrl(g.board), { fresh: true });
      if (boardJobs(g.board, body) === null) throw new BoardShapeError();
      return fetchBoard(g.board, async () => body);
    }),
    () => true,
  );
  settled.forEach((r, i) => {
    const g = all[i];
    for (const { job, ref } of g.jobs) {
      if (r.status === 'fulfilled') {
        const found = r.value.some(
          (p) =>
            sameRef(p.id.split(':').pop() ?? '', ref) ||
            sameRef(boardOfJobUrl(p.url)?.ref ?? '', ref),
        );
        out.set(job.url, { state: found ? 'open' : 'closed', checkedAt });
      } else {
        out.set(job.url, { state: 'unknown', checkedAt, hint: hintFor(r.reason) });
      }
    }
  });
  return out;
}

class BoardShapeError extends Error {}

function hintFor(e: unknown): string {
  if (e instanceof FetchError) {
    if (e.status === 404) return 'The board moved or was renamed, so we could not check.';
    if (e.isTimeout) return 'The board timed out, so we could not check.';
    if (e.status === 0) return 'Could not reach the board (offline or blocked).';
    return `The board answered HTTP ${e.status}, so we could not check.`;
  }
  return 'The board sent something we did not recognise, so we could not check.';
}

// ---- storage (a cache: losing it costs one re-check) ----

/** Keep only well-formed entries; storage can hold anything. */
export function sanitizeLiveness(raw: unknown): Record<string, LiveCheck> {
  const out: Record<string, LiveCheck> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'object' || v === null) continue;
    const { state, checkedAt, hint } = v as Record<string, unknown>;
    if (state !== 'open' && state !== 'closed' && state !== 'unknown') continue;
    if (typeof checkedAt !== 'string' || Number.isNaN(Date.parse(checkedAt))) continue;
    out[k] = { state, checkedAt, ...(typeof hint === 'string' && hint ? { hint } : {}) };
  }
  return out;
}

export const readLiveness = (): Record<string, LiveCheck> =>
  sanitizeLiveness(loadPersisted<unknown>(LIVENESS_KEY, {}));
export const writeLiveness = (v: Record<string, LiveCheck>) => savePersisted(LIVENESS_KEY, v);
