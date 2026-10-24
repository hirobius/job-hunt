// Teams tool (Discover → Teams, slug `teams`): a team's open roles that match the track. A
// team's board is read with the same parsers as Live postings (sources/ats.ts) and the same politeness
// limiter as the board probe (probe.ts), then filtered by the track's terms with match.ts. Pure apart
// from `readRoles`, which takes its fetcher and limiter so tests never hit the network.
import { keepForTrack, scoreAll, scorerFor } from '../tracks/forTrack';
import type { TrackConfig } from '../tracks/track-config';
import { rankAll, rankPostings } from './match';
import type { IncludeRule } from './mustInclude';
import { createLimiter, hostKey, type Limiter } from './probe';
import { foldRoles, isDesignSystemsTrack, orderByRoleType } from './roleType';
import { boardApiUrl, fetchBoard, type Board } from './sources/ats';
import { FetchError, type FetchJson } from './sources/http';
import type { Posting, RankedPosting } from './types';

/** A matching role, with the track term it matched (the saved Job's note names it). */
export type Role = RankedPosting & { term: string };

export type RolesState =
  { state: 'loading' } | { state: 'ok'; roles: Role[]; total: number } | { state: 'unknown' };

export const boardKey = (b: Board) => `${b.kind}:${b.slug.toLowerCase()}`;

/** The postings that match any of `terms` as a phrase, best first, one row per opening. On a
 *  design-systems track the role type leads (feed/roleType.ts): design systems, then product design,
 *  engineering-heavy last; score orders each type. */
export function matchRoles(postings: Posting[], terms: string[], now: number): Role[] {
  const best = new Map<string, Role>();
  for (const term of terms) {
    if (!term.trim()) continue;
    for (const p of rankPostings(postings, { term, where: '', mode: 'any', now })) {
      const cur = best.get(p.id);
      if (!cur || p.score > cur.score) best.set(p.id, { ...p, term });
    }
  }
  const byScore = [...best.values()].sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title),
  );
  return isDesignSystemsTrack(terms) ? orderByRoleType(byScore) : byScore;
}

/** A scored track's roles (src/tracks): every opening on the board, scored, the queued ones kept
 *  (best score, then newest). No term has to match: the scorer decides. */
export function scoredRoles(postings: Posting[], track: TrackConfig, now: number): Role[] {
  const all = rankAll(postings, { where: '', mode: 'any', now }).map((p) => ({ ...p, term: '' }));
  return scoreAll(all, track).queue;
}

/** Read one board and keep the roles that match (or, on a scored track, that the scorer queues).
 *  Any failure is 'unknown', never "no roles". */
export async function readRoles(
  board: Board,
  terms: string[],
  o: {
    fetchJson: FetchJson;
    limiter?: Limiter;
    signal?: AbortSignal;
    now?: number;
    fresh?: boolean;
    /** The track's must-include rule: a design-system one scores the roles (forTrack.ts). */
    include?: IncludeRule;
  },
): Promise<RolesState> {
  const limiter = o.limiter ?? createLimiter();
  const host = hostKey(boardApiUrl(board));
  const get: FetchJson = o.fresh ? (u) => o.fetchJson(u, { fresh: true }) : o.fetchJson;
  try {
    const ran = await limiter.run(host, () => fetchBoard(board, get), o.signal);
    if (!ran.ran) return { state: 'unknown' };
    limiter.ok(host);
    const track = scorerFor(o.include);
    const now = o.now ?? Date.now();
    const roles = track ? scoredRoles(ran.value, track, now) : matchRoles(ran.value, terms, now);
    return { state: 'ok', roles, total: ran.value.length };
  } catch (e) {
    if (e instanceof FetchError && e.status === 429) limiter.strike(host);
    return { state: 'unknown' };
  }
}

/** hiring: matching roles · quiet: a board, none matching · none: no board on the five systems ·
 *  unknown: a check got no answer · unchecked: not looked up yet · loading: reading its board. */
export type TeamStatus = 'hiring' | 'quiet' | 'none' | 'unknown' | 'unchecked' | 'loading';

export function teamStatus(t: {
  board?: Board;
  boardCheck?: 'unknown' | 'unchecked';
  roles?: RolesState;
}): TeamStatus {
  if (!t.board) return t.boardCheck ?? 'none';
  const r = t.roles;
  if (!r || r.state === 'loading') return 'loading';
  if (r.state === 'unknown') return 'unknown';
  return r.roles.length ? 'hiring' : 'quiet';
}

const RANK: Record<TeamStatus, number> = {
  hiring: 0,
  loading: 1,
  unknown: 2,
  quiet: 3,
  none: 4,
  unchecked: 5,
};

/** Teams with matching roles first (most roles first), then the ones still loading or that couldn't
 *  be checked, then the rest; input order breaks ties. "Hiring now" hides teams known to have no
 *  matching role: a team we couldn't check (or are still checking) stays visible. */
export function orderTeams<T>(
  teams: T[],
  info: (t: T) => { status: TeamStatus; count: number },
  hiringOnly: boolean,
): T[] {
  const rows = teams.map((t, i) => ({ t, i, ...info(t) }));
  return rows
    .filter((r) => !hiringOnly || ['hiring', 'loading', 'unknown'].includes(r.status))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.count - a.count || a.i - b.i)
    .map((r) => r.t);
}

/** Roles not among the ids seen at the last check. */
export const newSince = (roles: Role[], seen: readonly string[]): Role[] => {
  const s = new Set(seen);
  return roles.filter((r) => !s.has(r.id));
};

/** A board's answer with the roles that fail the track's must-include rule dropped (feed/
 *  mustInclude.ts; on a scored track, the ones the scorer does not queue, src/tracks) and the engineering-heavy roles taken out (when `fold`): what its row counts,
 *  orders and lists ("N matching roles", Hiring now), and the folded roles for its "N
 *  engineering-heavy roles" disclosure. */
export function foldRolesState(
  rs: RolesState | undefined,
  fold: boolean,
  include: IncludeRule = [],
): { roles?: RolesState; folded: Role[] } {
  if (!rs || rs.state !== 'ok') return { roles: rs, folded: [] };
  const read = rs.roles;
  const kept = keepForTrack(read, include);
  if (kept.length !== read.length || kept.some((r, i) => r !== read[i]))
    rs = { ...rs, roles: kept };
  // A scored track lists what the scorer queued: nothing is folded away.
  const { shown, folded } = foldRoles(rs.roles, fold && !scorerFor(include));
  return { roles: folded.length ? { ...rs, roles: shown } : rs, folded };
}
