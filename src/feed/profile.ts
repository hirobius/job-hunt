// The Feed's two inputs (simplify 5/9, #386): the Search profile (what the user is looking for)
// and the Sources (what they follow). `searchProfileOf` / `feedSourcesOf` read them from the synced
// blob v12 stores (#388; the hook is useFeed.ts `useFeedInputs`). `profileFrom` / `sourcesFrom`
// build the same shapes from a v11 track's stores: the breadth guard (breadth.test.ts) uses them to
// feed the Feed exactly what the deleted Live postings read. Pure.
import type { Seniority } from '../curation/types';
import type { WorkMode } from '../jobsData';
import {
  activeAtsRoles,
  hasRelatedTitles,
  relatedIsOn,
  RELATED_TITLES,
  saysDesignSystem,
  type MustInclude,
} from './mustInclude';
import { boardLabel, boardsFromUrls, canonicalBoardUrl, type Board } from './sources/ats';
import { SOURCE_ENABLED } from './fetchFeed';
import { activeTitles, type SweepTitles } from './sweepTitles';
import type { Dream } from './dreams';
import type { Target } from './targets';
import { companyKey } from './decided';
import { profileTitles, type Profile } from '../profileModel';
import { sourceBoard, type Source as StoredSource } from '../sourcesModel';

/** The profile's work mode (Adrian 2026-10-28: remote-only jobs for now). A remote profile drops a
 *  posting its source marks on-site or hybrid, and keeps one that does not say (shown as "Location
 *  not stated" when it names no place either). */
export const PROFILE_MODE: WorkMode = 'remote';

export interface SearchProfile {
  /** Every title the Feed searches for: the wide sweep always covers all of them. */
  titles: string[];
  /** Titles switched off: a posting titled only by one is hidden (the title filter, #223). */
  offTitles: string[];
  /** The design-system inclusion check every posting must pass (`designSystemRule`). */
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
/** The design-system inclusion check (Adrian 2026-10-28): a title that says "design system(s)",
 *  or a related title that is on (Design Technologist). The track's own design system phrases are
 *  kept; any other track gets the plain one. Titles only, as on a design system rule. */
export function designSystemRule(include: MustInclude): MustInclude {
  const terms = include.terms.filter(saysDesignSystem);
  return {
    terms: terms.length ? terms : ['design system'],
    atsOff: [],
    ...(include.related === false ? { related: false } : {}),
    ...(include.relatedOff?.length ? { relatedOff: include.relatedOff } : {}),
  };
}

export function profileFrom(input: {
  atsRoles: string[];
  seniority: Seniority;
  sweep: SweepTitles;
  include: MustInclude;
  where: string;
  /** Remote unless asked otherwise: remote-only for now (Adrian 2026-10-28). */
  mode?: WorkMode;
}): SearchProfile {
  const include = designSystemRule(input.include);
  const related =
    hasRelatedTitles(include) && include.related !== false
      ? RELATED_TITLES.filter((r) => relatedIsOn(include, r.id)).map((r) => r.id)
      : [];
  return {
    titles: dedupe([
      ...activeTitles(input.sweep),
      ...activeAtsRoles(input.atsRoles, input.include),
      ...related,
    ]),
    offTitles: input.sweep.off,
    include,
    exclude: [],
    level: input.seniority,
    where: input.where,
    mode: input.mode ?? PROFILE_MODE,
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

/** The Feed's profile from the stored Search profile (blob v12): every title that is on, every ATS
 *  role that is on and each related title that is on, the design-system inclusion check, leave
 *  out, level, pay floor, location and work mode. No profile yet: nothing to search for. */
export function searchProfileOf(p: Profile | null): SearchProfile {
  if (!p)
    return {
      titles: [],
      offTitles: [],
      include: designSystemRule({ terms: [], atsOff: [] }),
      exclude: [],
      level: 'any',
      where: '',
      mode: PROFILE_MODE,
    };
  const include = designSystemRule({
    terms: p.include.terms,
    atsOff: [],
    ...(p.include.related === false && { related: false }),
    ...(p.include.relatedOff?.length && { relatedOff: p.include.relatedOff }),
  });
  const related =
    hasRelatedTitles(include) && include.related !== false
      ? RELATED_TITLES.filter((r) => relatedIsOn(include, r.id)).map((r) => r.id)
      : [];
  const atsOff = new Set(p.atsOff.map((t) => t.toLowerCase()));
  return {
    titles: dedupe([
      ...profileTitles(p),
      ...p.atsRoles.filter((r) => !atsOff.has(r.toLowerCase())),
      ...related,
    ]),
    offTitles: p.titlesOff,
    include,
    exclude: p.leaveOut,
    level: p.level,
    ...(p.payFloor && { payFloor: p.payFloor }),
    where: p.location,
    mode: p.mode,
  };
}

/** The Feed's Sources from the stored ones (blob v12): every board, every followed company, and
 *  the keyless feeds. GitHub orgs and YC companies with no board have nothing to read yet. */
export function feedSourcesOf(stored: readonly StoredSource[]): Source[] {
  const out: Source[] = [];
  for (const s of stored) {
    const flags = { ...(s.star && { star: true }), ...(s.muted && { muted: true }) };
    const b = sourceBoard(s);
    if (b) out.push({ kind: 'board', ref: canonicalBoardUrl(b), label: s.label, ...flags });
    else if (s.kind === 'company')
      out.push({ kind: 'company', ref: s.ref, label: s.label, ...flags });
  }
  return [...out, ...FEEDS];
}
