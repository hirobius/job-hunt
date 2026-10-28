// What the sync reads for one user (Simplify 6/9, #387): their Sources and Search profile, taken
// from the synced `tracker` blob, so the blob is the one source of truth and nothing is copied
// into a server table. Blob v12 (#384) holds `sources[]` and `profiles[]`; an older blob (v11)
// is read as a fallback: watched board tiles (passed in: they live in the curation tables), dream
// companies, outreach targets and the boards of saved jobs, across every track, with the scored
// track's config or the tracks' sweep titles. Pure, no app imports: the edge function, the
// dry-run script and the tests load it.
import { parseBoardUrl, type Board, type BoardKind } from '../feed/sources/ats.ts';
import type { WatchedCompany } from './sources.ts';
import { TERM_FEEDS, type ReadOutcome, type TermFeed } from './sync.ts';
import { designSystemsTrack, type TrackConfig } from './track-config.ts';
import { VERIFIED_COMPANIES } from './verified.ts';

/** Boards read per user in one run (security review, 2026-10-27). Each one is an outbound read
 *  the sync makes on the user's behalf, and the blob is theirs to write; past this the rest wait.
 *  Far above a real list (a pack's boards + the Adele seed + verified). */
export const MAX_BOARDS_PER_USER = 500;
/** Titles searched on the term feeds per user and run. */
export const MAX_TERMS_PER_USER = 3;
const MAX_TERM = 60;

const BOARD_KINDS: readonly BoardKind[] = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'recruitee',
  'smartrecruiters',
  'teamtailor',
  'personio',
];
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
type Feed = TermFeed | 'rss';
const FEEDS: readonly Feed[] = [...TERM_FEEDS, 'rss'];
const isFeed = (s: string): s is Feed => (FEEDS as readonly string[]).includes(s);

export interface SyncPlan {
  /** Which blob shape it came from. */
  from: 'v12' | 'v11';
  /** The scorer config: the design systems one, or one compiled from the profile's titles. */
  config: TrackConfig;
  boards: WatchedCompany[];
  /** Titles searched on the term feeds (HN, Remotive, Jobicy). */
  terms: string[];
  /** Feeds on (a muted feed Source turns one off). */
  feeds: Set<Feed>;
}

/** A curation tile under a "Watched companies" section (v11). */
export interface WatchedTile {
  url: string;
  name: string;
}

type O = Record<string, unknown>;
const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown): string[] => arr(v).map(str).filter(Boolean);

/** Says "design system(s)", hyphen or not, never "system design" (feed/mustInclude's rule). */
const DS = /(?<![a-z0-9])design[\s-]+systems?(?![a-z0-9])/i;
export const saysDesignSystem = (s: string) => DS.test(s);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A phrase as a whole-words pattern, any run of spaces or hyphens between its words. */
const phrase = (s: string) =>
  `(?<![a-z0-9])${s
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .map(escape)
    .join('[\\s-]+')}(?![a-z0-9])`;

/** What a profile reads as a scorer config. A profile that asks for design systems (in must include
 *  or its titles) gets the tuned design systems config, Review bucket included; any other is scored
 *  on its own titles (strong), related titles (adjacent, needing the body to say a title) and the
 *  title phrases in the body. Leave-out terms reject a title either way. */
export function compileProfile(p: {
  titles: string[];
  related?: string[];
  mustInclude?: string[];
  leaveOut?: string[];
}): TrackConfig | null {
  const leaveOut = (p.leaveOut ?? []).filter(Boolean).map(phrase);
  if ([...(p.mustInclude ?? []), ...p.titles].some(saysDesignSystem))
    return {
      ...designSystemsTrack,
      titleNegative: [...designSystemsTrack.titleNegative, ...leaveOut],
    };
  const titles = p.titles.filter(Boolean);
  if (!titles.length) return null;
  return {
    slug: 'profile',
    name: 'Search profile',
    titleStrong: titles.map(phrase),
    titleAdjacent: (p.related ?? []).filter(Boolean).map(phrase),
    titleNegative: leaveOut,
    descriptionSignals: [...titles, ...(p.mustInclude ?? [])].map((t) => ({
      pattern: phrase(t),
      label: t.toLowerCase(),
      weight: 1,
    })),
    adjacentSignalsToQueue: 2,
    adjacentSignalsToReview: 1,
    aggregatorQueries: [],
  };
}

/** A stored board ({ kind, slug, eu? }), or undefined. */
function storedBoard(v: unknown): Board | undefined {
  const b = obj(v);
  const kind = str(b.kind) as BoardKind;
  const slug = str(b.slug);
  return BOARD_KINDS.includes(kind) && SLUG.test(slug)
    ? { kind, slug, ...(b.eu === true && { eu: true as const }) }
    : undefined;
}

/** A v12 Source's board: its `ref` as a board link, or a slug under a board kind. */
function sourceBoard(kind: string, ref: string): Board | undefined {
  const fromUrl = parseBoardUrl(ref);
  if (fromUrl) return fromUrl;
  return BOARD_KINDS.includes(kind as BoardKind) && SLUG.test(ref)
    ? { kind: kind as BoardKind, slug: ref }
    : undefined;
}

class Boards {
  readonly list: WatchedCompany[] = [];
  private seen = new Set<string>();
  add(b: Board | undefined | null, label: string) {
    if (!b || this.list.length >= MAX_BOARDS_PER_USER) return;
    const key = `${b.kind}:${b.eu ? 'eu:' : ''}${b.slug.toLowerCase()}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push({
      company: (label || b.slug).slice(0, 200),
      ats: b.kind,
      slug: b.slug,
      ...(b.eu && { eu: true as const }),
    });
  }
}

const cleanTerms = (titles: string[]) => {
  const seen = new Set<string>();
  return titles
    .map((t) => t.slice(0, MAX_TERM))
    .filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
    .slice(0, MAX_TERMS_PER_USER);
};

const isV12 = (o: O) =>
  (typeof o.v === 'number' && o.v >= 12) || Array.isArray(o.sources) || Array.isArray(o.profiles);

/** The user's plan from their blob, or null when there is nothing to score against. */
export function planFromBlob(data: unknown, tiles: WatchedTile[] = []): SyncPlan | null {
  const o = obj(data);
  return isV12(o) ? planV12(o) : planV11(o, tiles);
}

function planV12(o: O): SyncPlan | null {
  const p = obj(arr(o.profiles)[0]);
  const titles = strs(p.titles);
  const related = Array.isArray(p.related) ? strs(p.related) : [];
  const config = compileProfile({
    titles,
    related,
    mustInclude: strs(p.mustInclude),
    leaveOut: strs(p.leaveOut),
  });
  if (!config) return null;
  const boards = new Boards();
  const feeds = new Set<Feed>(FEEDS);
  for (const raw of arr(o.sources)) {
    const s = obj(raw);
    const kind = str(s.kind);
    const ref = str(s.ref);
    const feed = isFeed(kind) ? kind : kind === 'feed' && isFeed(ref) ? ref : null;
    if (feed) {
      if (s.muted === true) feeds.delete(feed);
      continue;
    }
    if (s.muted === true) continue;
    boards.add(sourceBoard(kind, ref), str(s.label));
  }
  // designsystems.jobs is about design systems: only that config reads it.
  if (config.slug !== designSystemsTrack.slug) feeds.delete('rss');
  return { from: 'v12', config, boards: boards.list, terms: cleanTerms(titles), feeds };
}

function planV11(o: O, tiles: WatchedTile[]): SyncPlan | null {
  // The scored track (must include asks for design systems) decides the config; else the tracks'
  // ticked sweep titles.
  const includes = Object.values(obj(o.mustInclude)).map(obj);
  const scored = includes.some((r) => strs(r.terms).some(saysDesignSystem));
  const sweepTitles = Object.values(obj(o.sweeps)).flatMap((raw) => {
    const s = obj(raw);
    const off = new Set(strs(s.off).map((t) => t.toLowerCase()));
    return strs(s.titles).filter((t) => !off.has(t.toLowerCase()));
  });
  const config = scored ? designSystemsTrack : compileProfile({ titles: sweepTitles });
  if (!config) return null;

  const boards = new Boards();
  for (const t of tiles) boards.add(parseBoardUrl(t.url), t.name);
  for (const list of Object.values(obj(o.dreams)))
    for (const d of arr(list).map(obj)) boards.add(storedBoard(d.board), str(d.company));
  for (const list of Object.values(obj(o.targets)))
    for (const t of arr(list).map(obj)) boards.add(storedBoard(t.board), str(t.company));
  for (const j of arr(o.jobs).map(obj)) boards.add(parseBoardUrl(str(j.url)), str(j.company));
  // The brief's verified boards, as the old seed gave every design systems user.
  if (scored)
    for (const c of VERIFIED_COMPANIES) boards.add({ kind: c.ats, slug: c.slug }, c.company);

  const titles = scored
    ? sweepTitles.filter(saysDesignSystem).concat('design systems')
    : sweepTitles;
  const feeds = new Set<Feed>(scored ? FEEDS : TERM_FEEDS);
  return { from: 'v11', config, boards: boards.list, terms: cleanTerms(titles), feeds };
}

/** The feed reads that are this user's: a feed they have on, for one of their titles (RSS: any). */
export const feedReadsFor = (plan: SyncPlan, reads: ReadOutcome[]): ReadOutcome[] =>
  reads.filter(
    (r) =>
      isFeed(r.board) &&
      plan.feeds.has(r.board) &&
      (r.board === 'rss' || plan.terms.some((t) => t.toLowerCase() === r.term?.toLowerCase())),
  );

/** The feeds that count as answered for this user: every one of their titles was read on it (the
 *  per-run cap can leave some out) and every read answered. Else a posting found under a title left
 *  out, or behind a failed read, would count as missed and close. */
export function answeredFeeds(plan: SyncPlan, mine: ReadOutcome[]): Feed[] {
  const out: Feed[] = [];
  for (const feed of FEEDS) {
    const reads = mine.filter((r) => r.board === feed);
    if (!reads.length) continue;
    const all =
      feed === 'rss' ||
      plan.terms.every((t) => reads.some((r) => r.term?.toLowerCase() === t.toLowerCase()));
    if (all && reads.every((r) => r.ok)) out.push(feed);
  }
  return out;
}
