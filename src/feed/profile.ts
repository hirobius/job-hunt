// The Feed's two inputs (simplify 5/9, #386): the Search profile (what the user is looking for)
// and the Sources (what they follow). Until #384/#385 land `profiles[]` / `sources[]` in the blob
// and publish `useProfile` / `useSources`, these are read from today's stores through this thin
// adapter: the track's titles, ATS roles, sweep list and must include, and its watched tiles,
// dream companies and outreach targets. The shapes follow the spec's blob v12 (`sources[]`:
// `{ kind, ref, label, star?, muted? }`), so swapping the adapter for the real stores changes
// nothing past it. Pure: the hook that reads the stores is `useFeedInputs.ts`.
import type { Seniority } from '../curation/types';
import type { WorkMode } from '../jobsData';
import {
  activeAtsRoles,
  hasRelatedTitles,
  relatedIsOn,
  RELATED_TITLES,
  type MustInclude,
} from './mustInclude';
import { boardLabel, boardsFromUrls, canonicalBoardUrl, type Board } from './sources/ats';
import { SOURCE_ENABLED } from './fetchFeed';
import { activeTitles, type SweepTitles } from './sweepTitles';
import type { Dream } from './dreams';
import type { Target } from './targets';
import { companyKey } from './decided';

export interface SearchProfile {
  /** Every title the Feed searches for: the wide sweep always covers all of them. */
  titles: string[];
  /** Titles switched off: a posting titled only by one is hidden (the title filter, #223). */
  offTitles: string[];
  /** Must include, with its related titles (the scorer's config when it asks for design systems). */
  include: MustInclude;
  exclude: string[];
  level: Seniority;
  /** Yearly, in dollars. */
  payFloor?: number;
  where: string;
  mode: WorkMode;
}

export type SourceKind = 'board' | 'company' | 'feed';

export interface Source {
  kind: SourceKind;
  /** A board's link, a company's key, or a feed's id ('hn', 'remotive', 'jobicy'). */
  ref: string;
  label: string;
  star?: boolean;
  muted?: boolean;
}

const dedupe = (list: string[]) => {
  const seen = new Set<string>();
  return list
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
};

/** The profile from a track and its stores. Titles: the ticked sweep titles, every ATS role that is
 *  on and each related title that is on (a design system rule), so the Feed reads at least what
 *  any one Live postings search or sweep did. */
export function profileFrom(input: {
  atsRoles: string[];
  seniority: Seniority;
  sweep: SweepTitles;
  include: MustInclude;
  where: string;
  mode: WorkMode;
}): SearchProfile {
  const { include } = input;
  const related =
    hasRelatedTitles(include) && include.related !== false
      ? RELATED_TITLES.filter((r) => relatedIsOn(include, r.id)).map((r) => r.id)
      : [];
  return {
    titles: dedupe([
      ...activeTitles(input.sweep),
      ...activeAtsRoles(input.atsRoles, include),
      ...related,
    ]),
    offTitles: input.sweep.off,
    include,
    exclude: [],
    level: input.seniority,
    where: input.where,
    mode: input.mode,
  };
}

/** The keyless feeds that run on every search (fetchFeed's SOURCE_ENABLED). */
export const FEEDS: Source[] = [
  { kind: 'feed', ref: 'hn', label: 'Hacker News' },
  { kind: 'feed', ref: 'remotive', label: 'Remotive' },
  ...(SOURCE_ENABLED.jobicy ? [{ kind: 'feed' as const, ref: 'jobicy', label: 'Jobicy' }] : []),
  ...(SOURCE_ENABLED.remoteok
    ? [{ kind: 'feed' as const, ref: 'remoteok', label: 'Remote OK' }]
    : []),
];

/** One list of Sources: every watched board tile, every dream and target with a board (Live
 *  postings read only the tiles), companies with no board yet, and the feeds. One entry per board
 *  and per company; a dream is a star. */
export function sourcesFrom(input: {
  tileUrls: string[];
  dreams: Dream[];
  targets: Target[];
  muted: string[];
  followed: string[];
}): Source[] {
  const muted = new Set(input.muted.map(companyKey));
  const out: Source[] = [];
  const boards = new Map<string, Source>();
  const companies = new Map<string, Source>();
  const keyOf = (b: Board) => `${b.kind}:${b.slug.toLowerCase()}`;
  const addBoard = (b: Board, label: string, star: boolean) => {
    const k = keyOf(b);
    const cur = boards.get(k);
    if (cur) {
      if (star) cur.star = true;
      return;
    }
    const s: Source = { kind: 'board', ref: canonicalBoardUrl(b), label };
    if (star) s.star = true;
    if (muted.has(companyKey(label))) s.muted = true;
    boards.set(k, s);
    out.push(s);
  };
  const addCompany = (name: string, star: boolean) => {
    const k = companyKey(name);
    if (!k || companies.has(k)) return;
    const s: Source = { kind: 'company', ref: k, label: name.trim() };
    if (star) s.star = true;
    if (muted.has(k)) s.muted = true;
    companies.set(k, s);
    out.push(s);
  };
  for (const b of boardsFromUrls(input.tileUrls, Infinity)) addBoard(b, boardLabel(b), false);
  for (const d of input.dreams)
    if (d.board) addBoard(d.board, d.company, true);
    else addCompany(d.company, true);
  for (const t of input.targets) if (t.board) addBoard(t.board, t.company, false);
  for (const f of input.followed) addCompany(f, false);
  return [...out, ...FEEDS];
}

/** The board links the Feed reads (muted ones are still read: muting hides by company). */
export const boardUrlsOf = (sources: Source[]): string[] =>
  sources.filter((s) => s.kind === 'board').map((s) => s.ref);
