// Sources (blob v12, simplify spec #384/#385): one synced list of everywhere jobs come from. A
// board on any of the eight ATSs, a followed company (no board yet), a GitHub org, a YC company,
// or a keyless feed. It replaces the per-track watched-board tiles, dream companies and outreach
// targets: the v11 move (v12Migration.ts) unions all of those, across every track, into this list.
// A dream is a Source with `star`; "Not this company" sets `muted` (the Feed leaves it unread).
// A Source is never deleted while the old screens can still add it back: mute it instead.
// Kept in `rjb_sources`, synced in the blob. Storage and the cloud are untrusted.
// This module is the pure half (types, sanitizers, merge): React-free with `.ts` imports, so the
// sync edge function (src/tracks/plan.ts, Deno) reads Sources exactly as the app writes them. The
// store is sources.ts.
import { httpUrl } from './httpUrl.ts';
import { mergeByKey } from './mergeByKey.ts';
import type { Board, BoardKind } from './feed/sources/ats.ts';

/** Far more than any account holds today (the Adele seed is ~150 boards); a sanity cap only. */
export const MAX_SOURCES = 5000;

export const BOARD_KINDS: readonly BoardKind[] = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'recruitee',
  'smartrecruiters',
  'teamtailor',
  'personio',
];
/** The keyless feeds the Feed reads (HN covers Who is hiring and Freelancer). */
export const FEED_REFS = ['hn', 'remotive', 'jobicy', 'remoteok', 'designsystems-rss'] as const;
export type FeedRef = (typeof FEED_REFS)[number];

export type SourceKind = BoardKind | 'company' | 'github' | 'yc' | 'feed';

export interface Source {
  /** A board kind, or: `company` (followed, no board known), `github` (an org), `yc`, `feed`. */
  kind: SourceKind;
  /** Board: its slug. company: the name, lower-cased. github: the org login, lower-cased.
   *  yc: the YC slug. feed: a FeedRef. */
  ref: string;
  /** What the list shows: the company's name, or the feed's. */
  label: string;
  /** A dream company. */
  star?: true;
  /** "Not this company": kept, never read. */
  muted?: true;
  /** The v11 move muted it (a board only on an archived track or section), not the person: the
   *  move's top-up lifts the mute once a live copy appears. Dropped when the person mutes or
   *  unmutes it, so their choice sticks. Only kept alongside `muted`. */
  movedMute?: true;
  /** The v11 move starred it (a dream company) once: the top-up never stars it again, so an
   *  unstar sticks. */
  movedStar?: true;
  /** Lever's EU host. */
  eu?: true;
  website?: string;
  /** A GitHub org's design-system repo ("owner/name"). */
  repo?: string;
  /** ISO time it was added (the earliest wins on a merge). */
  addedAt?: string;
}

const KINDS = new Set<string>([...BOARD_KINDS, 'company', 'github', 'yc', 'feed']);
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/;

export const isBoardKind = (k: SourceKind): k is BoardKind =>
  (BOARD_KINDS as readonly string[]).includes(k);

/** One Source per key: kind + ref, ignoring case. */
export const sourceKey = (s: Pick<Source, 'kind' | 'ref'>) =>
  `${s.kind}:${s.ref.trim().toLowerCase()}`;

/** A board Source as the Board the fetchers read; null for any other kind. */
export function sourceBoard(s: Source): Board | null {
  return isBoardKind(s.kind) ? { kind: s.kind, slug: s.ref, ...(s.eu && { eu: true }) } : null;
}

/** The Source for a board. */
export const boardSource = (b: Board, label: string, extra: Partial<Source> = {}): Source => ({
  ...extra,
  kind: b.kind,
  ref: b.slug,
  label: label.trim() || b.slug,
  ...(b.eu && { eu: true as const }),
});

/** One Source from untrusted data, or null. */
export function sanitizeSource(raw: unknown): Source | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const kind = typeof o.kind === 'string' && KINDS.has(o.kind) ? (o.kind as SourceKind) : null;
  const ref = typeof o.ref === 'string' ? o.ref.trim() : '';
  if (!kind || !ref) return null;
  if (isBoardKind(kind) && !SLUG.test(ref)) return null;
  if (kind === 'feed' && !(FEED_REFS as readonly string[]).includes(ref)) return null;
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : ref;
  const out: Source = { kind, ref, label };
  if (o.star === true) out.star = true;
  if (o.muted === true) out.muted = true;
  if (o.muted === true && o.movedMute === true) out.movedMute = true;
  if (o.movedStar === true) out.movedStar = true;
  if (o.eu === true && kind === 'lever') out.eu = true;
  const website = httpUrl(o.website);
  if (website) out.website = website;
  if (typeof o.repo === 'string' && REPO.test(o.repo)) out.repo = o.repo;
  if (typeof o.addedAt === 'string' && o.addedAt) out.addedAt = o.addedAt;
  return out;
}

export function sanitizeSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.map(sanitizeSource).filter((x): x is Source => !!x);
  return mergeByKey(sourceKey, null, ok).slice(0, MAX_SOURCES);
}

/** Two copies of one Source: `a` is the truth (its star, mute and label stand, and a missing one
 *  means off), filling in only what it does not know: a website, a repo, the earliest addedAt. */
function combine(a: Source, b: Source): Source {
  const out: Source = { ...a };
  for (const k of ['website', 'repo'] as const) if (!out[k] && b[k]) out[k] = b[k];
  if (b.addedAt && (!a.addedAt || b.addedAt < a.addedAt)) out.addedAt = b.addedAt;
  return out;
}

/** Union by key; `cloud` wins on star / muted / label for a shared Source, local-only are kept. */
export function mergeSources(cloud: Source[], local: Source[]): Source[] {
  const localBy = new Map(local.map((s) => [sourceKey(s), s]));
  const merged = mergeByKey(sourceKey, cloud, local);
  return merged.map((s) => {
    const l = localBy.get(sourceKey(s));
    return l && l !== s ? combine(s, l) : s;
  });
}

/** Add what `list` lacks (by key). A Source it has already keeps its own star and mute (an
 *  unstarred or unmuted one is never switched back by a later copy) and only fills in a missing
 *  website / repo; with `star`, a starred copy does star it (the move's dreams). Pure. */
export function withSources(
  list: Source[],
  add: readonly Source[],
  { star = false }: { star?: boolean } = {},
): { list: Source[]; added: number } {
  const by = new Map(list.map((s, i) => [sourceKey(s), i]));
  const out = [...list];
  let added = 0;
  for (const s of add) {
    const k = sourceKey(s);
    const at = by.get(k);
    if (at === undefined) {
      by.set(k, out.length);
      out.push(s);
      added++;
      continue;
    }
    const cur = out[at];
    const next = combine(cur, s);
    if (star && s.star) {
      next.star = true;
      if (s.movedStar) next.movedStar = true;
    }
    out[at] = next;
  }
  return { list: out.slice(0, MAX_SOURCES), added };
}
