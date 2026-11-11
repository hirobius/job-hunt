// What the sync reads for one user (Simplify 6/9, #387): their Sources and Search profile, taken
// from the synced `tracker` blob, so the blob is the one source of truth and nothing is copied
// into a server table. Blob v12 (#384) holds `sources[]` and `profiles[]`; an older blob (v11)
// is read as a fallback: watched board tiles (passed in: they live in the curation tables), dream
// companies, outreach targets and the boards of saved jobs, across every track, with the scored
// track's config or the tracks' sweep titles. A v12 blob with no profile yet (the move has not
// run on any device) is read as v11 too. v12 is read through the app's own sanitizers
// (profileModel.ts, sourcesModel.ts: pure, React-free), so the server sees exactly what the app
// wrote. Pure, no React or storage: the edge function, the dry-run script and the tests load it.
import { parseBoardUrl, type Board, type BoardKind } from '../feed/sources/ats.ts';
import { BOARD_KINDS, BOARD_SLUG } from '../feed/boardSet.ts';
import { profileTitles, sanitizeProfiles, type Profile } from '../profileModel.ts';
import { sanitizeSources, sourceBoard, type FeedRef } from '../sourcesModel.ts';
import type { WatchedCompany } from './sources.ts';
import { SERVER_FEEDS, type ServerFeed } from './feeds/serverFeeds.ts';
import { TERM_FEEDS, type ReadOutcome, type TermFeed } from './sync.ts';
import { designSystemsTrack, type TrackConfig } from './track-config.ts';
import { VERIFIED_COMPANIES } from './verified.ts';
import { matchKey, textTermsOf } from './matchText.ts';

/** Boards read per user in one run (security review, 2026-10-27). Each one is an outbound read
 *  the sync makes on the user's behalf, and the blob is theirs to write; past this the rest wait.
 *  Far above a real list (a pack's boards + the Adele seed + verified). */
export const MAX_BOARDS_PER_USER = 500;
/** Titles searched on the term feeds per user and run. */
export const MAX_TERMS_PER_USER = 3;
const MAX_TERM = 60;

/** Every board kind the app reads, all 13 (#576): the board set's list, so the sync, the rotation
 *  and the browser never disagree. The host is fixed per kind (ats.ts `boardApiUrl`); only a slug
 *  that passes `BOARD_SLUG` varies, and it is URI-escaped into the path or one subdomain label. */
const KINDS: readonly string[] = BOARD_KINDS;
const SLUG = BOARD_SLUG;
type Feed = TermFeed | 'rss' | ServerFeed;
const FEEDS: readonly Feed[] = [...TERM_FEEDS, 'rss', ...SERVER_FEEDS];
const isFeed = (s: string): s is Feed => (FEEDS as readonly string[]).includes(s);
/** Feeds read once for every design-systems user, not per title. */
const isShared = (f: string) => f === 'rss' || (SERVER_FEEDS as readonly string[]).includes(f);

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
  /** Every term the browser tests on a posting's text for this person (include, leave out,
   *  titles): the stored match text keeps a window around each hit (matchText.ts, #499). */
  textTerms: string[];
  /** The profile's match key (matchText.ts): stored with each match text. Null for a v11 plan
   *  (no profile the browser could key on): its rows keep no match text. */
  matchKey: string | null;
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

/** feed/mustInclude.ts RELATED_TITLES (not imported: that module is the app's store): the related
 *  titles a design systems rule lets in, by id, with the scorer pattern each one is. */
const RELATED_ADJACENT: Record<string, string> = { 'design technologist': 'design technologist' };

/** What a profile reads as a scorer config. `scorer: 'design-systems'` gets the tuned design
 *  systems config, Review bucket included (related titles switched off are dropped from its
 *  adjacent titles); any other is scored on its own titles (strong), related titles (adjacent,
 *  needing the body to say a title) and the title and must-include phrases in the body. Leave-out
 *  terms reject a title either way. Null: nothing to score against. */
export function compileProfile(p: {
  titles: string[];
  scorer?: string;
  related?: string[];
  relatedOff?: string[];
  mustInclude?: string[];
  leaveOut?: string[];
}): TrackConfig | null {
  const leaveOut = (p.leaveOut ?? []).filter(Boolean).map(phrase);
  if (p.scorer === designSystemsTrack.slug) {
    const off = new Set((p.relatedOff ?? []).map((id) => RELATED_ADJACENT[id.toLowerCase()]));
    return {
      ...designSystemsTrack,
      titleAdjacent: designSystemsTrack.titleAdjacent.filter((t) => !off.has(t)),
      titleNegative: [...designSystemsTrack.titleNegative, ...leaveOut],
    };
  }
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

/** A v12 profile as a scorer config. Related titles count only on a design systems scorer (the
 *  app's rule: mustInclude.ts lets them in on a "design system(s)" rule only). */
export function configForProfile(p: Profile): TrackConfig | null {
  const relatedOff =
    p.include.related === false ? Object.keys(RELATED_ADJACENT) : (p.include.relatedOff ?? []);
  return compileProfile({
    titles: profileTitles(p),
    scorer: p.scorer,
    relatedOff,
    mustInclude: p.include.terms,
    leaveOut: p.leaveOut,
  });
}

/** A v12 feed Source's ref as the sync's feed id. Remote OK is not read by the sync: no id. */
const FEED_OF_REF: Record<FeedRef, Feed | null> = {
  hn: 'hn',
  remotive: 'remotive',
  jobicy: 'jobicy',
  // Muting Remote OK in Sources stops the sync's read of it too (tracks/feeds/remoteok.ts).
  remoteok: 'remoteok',
  'designsystems-rss': 'rss',
};

/** A stored board ({ kind, slug, eu? }), or undefined. */
function storedBoard(v: unknown): Board | undefined {
  const b = obj(v);
  const kind = str(b.kind) as BoardKind;
  const slug = str(b.slug);
  return KINDS.includes(kind) && SLUG.test(slug)
    ? { kind, slug, ...(b.eu === true && { eu: true as const }) }
    : undefined;
}

class Boards {
  readonly list: WatchedCompany[] = [];
  private seen = new Set<string>();
  add(b: Board | undefined | null, label: string) {
    // Every path (v12 Sources, v11 tiles, saved jobs, the stored board) meets the one rule: a
    // known kind and a SLUG, so the read goes to that kind's fixed host (no SSRF).
    if (!b || !KINDS.includes(b.kind) || !SLUG.test(b.slug)) return;
    if (this.list.length >= MAX_BOARDS_PER_USER) return;
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
  const v12 = isV12(o) ? planV12(o) : undefined;
  return v12 === undefined ? planV11(o, tiles) : v12;
}

/** The v12 plan; undefined when the blob has no profile yet (read as v11 then, or every open
 *  posting would close). */
function planV12(o: O): SyncPlan | null | undefined {
  const p = sanitizeProfiles(o.profiles)[0];
  if (!p) return undefined;
  const config = configForProfile(p);
  if (!config) return null;
  const boards = new Boards();
  const feeds = new Set<Feed>(FEEDS);
  for (const s of sanitizeSources(o.sources)) {
    if (s.kind === 'feed') {
      const feed = FEED_OF_REF[s.ref as FeedRef];
      if (feed && s.muted) feeds.delete(feed);
      continue;
    }
    if (s.muted) continue;
    boards.add(sourceBoard(s), s.label);
  }
  // designsystems.jobs and the sync's own searches are about design systems: only that config
  // reads them.
  if (config.slug !== designSystemsTrack.slug)
    for (const f of ['rss', ...SERVER_FEEDS] as const) feeds.delete(f);
  const titles = profileTitles(p);
  const terms =
    config.slug === designSystemsTrack.slug
      ? titles.filter(saysDesignSystem).concat('design systems')
      : titles;
  return {
    from: 'v12',
    config,
    boards: boards.list,
    terms: cleanTerms(terms),
    feeds,
    textTerms: textTermsOf(p),
    matchKey: matchKey(p),
  };
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
  // v11 kept its include terms per track: every one counts (a superset only keeps more text).
  const includeTerms = includes.flatMap((r) => strs(r.terms));
  return {
    from: 'v11',
    config,
    boards: boards.list,
    terms: cleanTerms(titles),
    feeds,
    textTerms: [...includeTerms, ...titles],
    matchKey: null,
  };
}

/** The feed reads that are this user's: a feed they have on, for one of their titles (RSS: any). */
export const feedReadsFor = (plan: SyncPlan, reads: ReadOutcome[]): ReadOutcome[] =>
  reads.filter(
    (r) =>
      isFeed(r.board) &&
      plan.feeds.has(r.board) &&
      (isShared(r.board) || plan.terms.some((t) => t.toLowerCase() === r.term?.toLowerCase())),
  );

/** The feeds that count as answered for this user: every one of their titles was read on it (the
 *  per-run cap can leave some out) and every read answered with its whole list. Else a posting
 *  found under a title left out, behind a failed read, or past a partial one would count as missed
 *  and close. The sync's own searches never count: each reads a window (new this week, a credit
 *  budget), so a posting missing from one is not gone. */
export function answeredFeeds(plan: SyncPlan, mine: ReadOutcome[]): Feed[] {
  const out: Feed[] = [];
  for (const feed of FEEDS) {
    if ((SERVER_FEEDS as readonly string[]).includes(feed)) continue;
    const reads = mine.filter((r) => r.board === feed);
    if (!reads.length) continue;
    const all =
      feed === 'rss' ||
      plan.terms.every((t) => reads.some((r) => r.term?.toLowerCase() === t.toLowerCase()));
    if (all && reads.every((r) => r.ok && !r.partial)) out.push(feed);
  }
  return out;
}
