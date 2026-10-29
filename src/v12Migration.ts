// The one-time move from v11 tracks to the v12 Search profile + Sources (simplify spec #384/#385).
// Design systems only (Adrian 2026-10-29): only a design-systems track moves, one that is scored
// (tracks/forTrack scorerFor) or carries the Design Systems pack's label (packIdForLabel). Other
// tracks stay stored, untouched, but never surface: no title, board, dream or target of theirs
// enters the profile or Sources, and none of their links is offered. Within the design-systems
// tracks there is no loss of breadth: Sources are the union of every watched board tile, dream
// company (starred) and outreach target, plus the board of every saved job and the keyless feeds;
// the profile takes its settings from the scored track, else the busiest one, and its titles from
// every design-systems track (that track's first). With no design-systems track it makes no
// profile (the app then gives the default one, searchDefaults.ensureProfile).
// Board tiles on an archived track or section were not read before: they come in muted
// (`movedMute`), and titles v11 did not search come in off (`movedOff`). The top-up lifts those
// once an old screen makes them live again; a mute or switch the person sets stays.
// The v11 stores are read, never changed. Links that are not boards are offered once as a .txt.
// The evidence text becomes a Note document.
//
// The move runs after sync settles (App's V12Migration). The profile is made once (a profile
// exists = moved); the Sources and titles are topped up, add-only, on every run while the old
// screens can still add to the v11 stores, so nothing they add is lost before #389 removes them.
// A dream starred after the move stars its Source once (`movedStar`), even when it already exists.
import { createDocument, getAllDocuments } from './documents';
import { getCurationState } from './curation/curationStore';
import { packIdForLabel } from './curation/starterPacks';
import type { CurationState, Tile } from './curation/types';
import { getAllDreams, type Dream } from './feed/dreams';
import { SOURCE_ENABLED } from './feed/sourceEnabled';
import { getAllMustInclude, type MustInclude } from './feed/mustInclude';
import { boardLabel, parseBoardUrl } from './feed/sources/ats';
import { activeTitles, getAllSweeps, sweepFor, type SweepTitles } from './feed/sweepTitles';
import { getAllTargets, type Target } from './feed/targets';
import { SOURCE_LABEL } from './feed/types';
import { isSample } from './demo/isSample';
import { SAMPLE_TRACK_KEY } from './demo/sampleTrack';
import type { WorkMode } from './jobsData';
import { loadPersisted } from './persisted';
import {
  cleanList,
  getProfiles,
  MAX_PROFILE_TITLES,
  replaceProfiles,
  type Profile,
} from './profile';
import { readEvidence } from './radar/evidenceStore';
import {
  boardSource,
  sourceKey,
  updateSources,
  withSources,
  type FeedRef,
  type Source,
} from './sources';
import { getAllJobs } from './store';
import { getAllModes } from './trackModes';
import { scorerFor } from './tracks/forTrack';
import type { Job } from './types';

/** What the move reads: the v11 stores and the curated tracks. */
export interface V11State {
  curation: CurationState;
  jobs: Job[];
  dreams: Record<string, Dream[]>;
  targets: Record<string, Target[]>;
  sweeps: Record<string, SweepTitles>;
  mustInclude: Record<string, MustInclude>;
  modes: Record<string, WorkMode>;
  evidence: string;
  /** The device-local Sample track's id: never moved. */
  sampleTrack?: string | null;
}

/** A curated link that is not a board: offered once as a .txt, not a Source. */
export interface LeftoverLink {
  track: string;
  name: string;
  url: string;
  meta: string;
}

const PROFILE_ID = 'main';
const EVIDENCE_TITLE = 'Evidence';
/** Fixed, so two devices that each move their evidence end up with one note (a union by id). */
export const EVIDENCE_NOTE_ID = 'note-evidence';
const norm = (s: string) => s.trim().toLowerCase();
/** "Figma jobs" (how Watch names a tile) → "Figma". */
const tileLabel = (t: Tile) => t.name.replace(/\s+jobs$/i, '').trim();

const realTracks = (s: V11State) => s.curation.categories.filter((c) => c.id !== s.sampleTrack);

/** A design-systems track: scored, or made from the Design Systems pack (its label). */
const isDsTrack = (s: V11State, c: CurationState['categories'][0]) =>
  !!scorerFor(s.mustInclude[c.id]) || packIdForLabel(c.label) === 'designsystems';

/** The real tracks that move: the design-systems ones (Adrian 2026-10-29). */
const dsTracks = (s: V11State) => realTracks(s).filter((c) => isDsTrack(s, c));

/** Each tile of a design-systems track with whether its track and section are live (read today)
 *  and its track's label. */
function tilesOf(s: V11State) {
  const cats = new Map(dsTracks(s).map((c) => [c.id, c]));
  const groups = new Map(s.curation.groups.map((g) => [g.id, g]));
  return s.curation.tiles.flatMap((t) => {
    const g = groups.get(t.groupId);
    const c = g && cats.get(g.categoryId);
    return g && c ? [{ tile: t, track: c, live: !g.archived && !c.archived }] : [];
  });
}

const feed = (ref: FeedRef): Source => ({
  kind: 'feed',
  ref,
  label: ref === 'designsystems-rss' ? 'designsystems.jobs' : SOURCE_LABEL[ref],
});

function dreamSource(d: Dream): Source {
  const extra: Partial<Source> = {
    star: true,
    movedStar: true,
    ...(d.website && { website: d.website }),
  };
  if (d.board) return boardSource(d.board, d.company, extra);
  return { kind: 'company', ref: d.key, label: d.company, ...extra };
}

function targetSource(t: Target): Source {
  const extra: Partial<Source> = {
    ...(t.website && { website: t.website }),
    ...(t.repo && { repo: t.repo }),
  };
  if (t.board) return boardSource(t.board, t.company, extra);
  if (t.repo) return { kind: 'github', ref: norm(t.login), label: t.company, ...extra };
  if (t.login.startsWith('yc:'))
    return { kind: 'yc', ref: t.login.slice(3), label: t.company, ...extra };
  return { kind: 'company', ref: norm(t.company), label: t.company, ...extra };
}

/** Every Source the v11 account implies, in order, one per key (sources.ts withSources: a later
 *  copy only fills in a star, website or repo, so a board live anywhere is never muted). */
export function sourcesFromV11(s: V11State): Source[] {
  const tracks = new Set(dsTracks(s).map((c) => c.id));
  const own = <T>(m: Record<string, T[]>) =>
    Object.entries(m).flatMap(([id, list]) => (tracks.has(id) ? list : []));
  const tiles = tilesOf(s);
  const boardTiles = (live: boolean) =>
    tiles.flatMap(({ tile, live: l }) => {
      const b = l === live ? parseBoardUrl(tile.url) : null;
      return b
        ? [
            boardSource(
              b,
              tileLabel(tile) || boardLabel(b),
              live ? {} : { muted: true, movedMute: true },
            ),
          ]
        : [];
    });
  const jobBoards = s.jobs.flatMap((j) => {
    const b = isSample(j) ? null : parseBoardUrl(j.url);
    return b ? [boardSource(b, j.company?.trim() || boardLabel(b))] : [];
  });
  const scored = dsTracks(s).some((c) => scorerFor(s.mustInclude[c.id]));
  const feeds: FeedRef[] = [
    'hn',
    'remotive',
    ...(SOURCE_ENABLED.jobicy ? (['jobicy'] as const) : []),
    ...(SOURCE_ENABLED.remoteok ? (['remoteok'] as const) : []),
    ...(scored ? (['designsystems-rss'] as const) : []),
  ];
  const all = [
    ...boardTiles(true),
    ...own(s.dreams).map(dreamSource),
    ...own(s.targets).map(targetSource),
    ...jobBoards,
    ...feeds.map(feed),
    // Last, so a board that is live anywhere else is not muted.
    ...boardTiles(false),
  ];
  return withSources([], all, { star: true }).list;
}

/** Every dream of a design-systems track. */
const dreamsOf = (s: V11State) => {
  const tracks = new Set(dsTracks(s).map((c) => c.id));
  return Object.entries(s.dreams).flatMap(([id, list]) => (tracks.has(id) ? list : []));
};

/** The top-up on a Sources list, pure: add what the account implies; lift a mute the move set
 *  once that Source is live in v11; star a dream starred after `since` (every dream with no
 *  `since`) unless the move starred it before (so an unstar sticks). */
export function topUpSources(list: Source[], s: V11State, since?: string, at?: string): Source[] {
  const implied = sourcesFromV11(s).map((x) => (x.addedAt || !at ? x : { ...x, addedAt: at }));
  const live = new Set(implied.filter((x) => !x.muted).map(sourceKey));
  const after = since ? Date.parse(since) : -Infinity;
  const stars = new Set(
    dreamsOf(s)
      .filter((d) => !(Date.parse(d.starredAt) <= after))
      .map((d) => sourceKey(dreamSource(d))),
  );
  return withSources(list, implied).list.map((x) => {
    const k = sourceKey(x);
    let out = x;
    if (out.movedMute && live.has(k)) {
      const { muted: _, movedMute: __, ...rest } = out;
      out = rest;
    }
    if (stars.has(k) && !out.movedStar) out = { ...out, star: true, movedStar: true };
    return out;
  });
}

/** A track's sweep (its stored entry, else its titles, else its ATS roles, all on). */
const sweepOf = (s: V11State, c: CurationState['categories'][0]) =>
  sweepFor(s.sweeps, c.id, c.titles.length ? c.titles : c.atsRoles);

/** The track the profile's settings come from: the scored one, else the busiest design-systems
 *  track (its live boards, dreams, targets and sweep titles), live tracks first, then the board's
 *  order. `tracks` are the design-systems tracks only. */
function profileTrack(s: V11State) {
  const tracks = [...dsTracks(s)].sort(
    (a, b) => Number(a.archived) - Number(b.archived) || a.sortOrder - b.sortOrder,
  );
  const boards = new Map<string, number>();
  for (const x of tilesOf(s))
    if (x.live && parseBoardUrl(x.tile.url))
      boards.set(x.track.id, (boards.get(x.track.id) ?? 0) + 1);
  const busyness = (c: (typeof tracks)[0]) =>
    (boards.get(c.id) ?? 0) +
    (s.dreams[c.id]?.length ?? 0) +
    (s.targets[c.id]?.length ?? 0) +
    sweepOf(s, c).titles.length;
  const pool = tracks.filter((c) => scorerFor(s.mustInclude[c.id]));
  let best: (typeof tracks)[0] | null = null;
  for (const c of pool.length ? pool : tracks) if (!best || busyness(c) > busyness(best)) best = c;
  return { best, tracks };
}

/** Every design-systems track, `first` leading. */
const ordered = (tracks: CurationState['categories'], first: string | undefined) => [
  ...tracks.filter((c) => c.id === first),
  ...tracks.filter((c) => c.id !== first),
];

/** Titles and ATS roles from the tracks given, in that order, each once, with its on/off. */
function allTitles(s: V11State, tracks: CurationState['categories']) {
  const titles: string[] = [];
  const titlesOff: string[] = [];
  const atsRoles: string[] = [];
  const atsOff: string[] = [];
  const seen = new Set<string>();
  const seenAts = new Set<string>();
  const add = (t: string, off: boolean) => {
    if (!t.trim() || seen.has(norm(t))) return;
    seen.add(norm(t));
    titles.push(t.trim());
    if (off) titlesOff.push(t.trim());
  };
  for (const c of tracks) {
    // On = searched in v11: on the sweep (at most 12, activeTitles) of a live track. A track title
    // taken off its stored sweep list was not searched either: it comes in, off.
    const sw = sweepOf(s, c);
    const on = new Set(c.archived ? [] : activeTitles(sw).map(norm));
    for (const t of [...sw.titles, ...c.titles]) add(t, !on.has(norm(t)));
    const roleOff = new Set((s.mustInclude[c.id]?.atsOff ?? []).map(norm));
    for (const r of c.atsRoles) {
      if (!r.trim() || seenAts.has(norm(r))) continue;
      seenAts.add(norm(r));
      atsRoles.push(r.trim());
      if (c.archived || roleOff.has(norm(r))) atsOff.push(r.trim());
    }
  }
  return { titles, titlesOff, atsRoles, atsOff };
}

/** The Search profile the v11 account implies; null with no design-systems track. */
export function profileFromV11(s: V11State, now: string): Profile | null {
  const { best, tracks } = profileTrack(s);
  if (!best) return null;
  const rule = s.mustInclude[best.id];
  const t = allTitles(s, ordered(tracks, best.id));
  const p: Profile = {
    id: PROFILE_ID,
    label: best.label,
    titles: t.titles.slice(0, MAX_PROFILE_TITLES),
    titlesOff: t.titlesOff,
    ...(t.titlesOff.length && { movedOff: t.titlesOff }),
    atsRoles: t.atsRoles.slice(0, MAX_PROFILE_TITLES),
    atsOff: t.atsOff,
    include: {
      terms: cleanList(rule?.terms ?? []),
      ...(rule?.inTitle === false && { inTitle: false }),
      ...(rule?.inText === true && { inText: true }),
      ...(rule?.related === false && { related: false }),
      ...(rule?.relatedOff?.length && { relatedOff: rule.relatedOff }),
    },
    leaveOut: [],
    level: best.seniority,
    location: best.location,
    // No mode on the track: remote only, the profile's default (Adrian 2026-10-28).
    mode: s.modes[best.id] ?? 'remote',
    fromTrack: best.id,
    createdAt: now,
  };
  if (scorerFor(rule)) p.scorer = 'design-systems';
  return p;
}

/** The whole move as data: the profile, the Sources and the links offered as a .txt. */
export function moveV11(s: V11State, now: string) {
  const links: LeftoverLink[] = tilesOf(s)
    .filter(({ tile }) => !parseBoardUrl(tile.url))
    .map(({ tile, track }) => ({
      track: track.label,
      name: tile.name,
      url: tile.url,
      meta: tile.meta,
    }));
  return { profile: profileFromV11(s, now), sources: sourcesFromV11(s), links };
}

/** The links file: per design-systems track, each link's name over its URL. */
export function linksText(links: readonly LeftoverLink[]): string {
  const by = new Map<string, LeftoverLink[]>();
  for (const l of links) by.set(l.track, [...(by.get(l.track) ?? []), l]);
  return [...by]
    .map(([track, list]) => [track, ...list.map((l) => `${l.name}\n${l.url}`)].join('\n\n'))
    .join('\n\n\n');
}

/** The one-time offer of the links file. */
export const linksNotice = (n: number) =>
  `${n} link${n === 1 ? '' : 's'} on your old boards ${n === 1 ? "isn't a job board" : "aren't job boards"}, so ${n === 1 ? "it isn't" : "they aren't"} in Sources.`;

/** The v11 stores as the move reads them. */
export function readV11(): V11State {
  return {
    curation: getCurationState(),
    jobs: getAllJobs(),
    dreams: getAllDreams(),
    targets: getAllTargets(),
    sweeps: getAllSweeps(),
    mustInclude: getAllMustInclude(),
    modes: getAllModes(),
    evidence: readEvidence(),
    sampleTrack: loadPersisted<string | null>(SAMPLE_TRACK_KEY, null),
  };
}

/** Run the move on this device's stores. `moved` is true the one time it makes the profile (from
 *  a design-systems track); `links` are then the links to offer. Every run tops up Sources,
 *  add-only. */
export function runV12Move(now = new Date()): { moved: boolean; links: LeftoverLink[] } {
  const s = readV11();
  const profiles = getProfiles();
  if (!realTracks(s).length && !profiles.length) return { moved: false, links: [] };
  updateSources((cur) => topUpSources(cur, s, profiles[0]?.createdAt, now.toISOString()));
  if (profiles.length) {
    // Titles are no longer topped up (#389: no screen adds v11 titles now), so a title removed in
    // the Search profile stays removed. A profile moved before remote only became the default
    // (its track had no mode, read as 'any') gets it, once: `fromTrack` goes with the fix, and
    // the Search profile form drops it too, so the person's own choice is never changed back.
    const cur = profiles[0];
    if (cur.fromTrack && cur.mode === 'any' && !s.modes[cur.fromTrack]) {
      const { fromTrack: _, ...rest } = cur;
      replaceProfiles([{ ...rest, mode: 'remote' }, ...profiles.slice(1)]);
    }
    return { moved: false, links: [] };
  }
  const { profile, links } = moveV11(s, now.toISOString());
  // The evidence is the person's own text, not a track's: it becomes a Note even when no
  // design-systems track moves (the default profile follows, searchDefaults.ensureProfile).
  const text = s.evidence.trim();
  const noted = getAllDocuments().some(
    (d) =>
      d.id === EVIDENCE_NOTE_ID ||
      (d.kind === 'note' && d.versions.some((v) => v.text.trim() === text)),
  );
  if (text && !noted)
    createDocument({ id: EVIDENCE_NOTE_ID, kind: 'note', title: EVIDENCE_TITLE, text: s.evidence });
  if (!profile) return { moved: false, links: [] };
  replaceProfiles([profile]);
  return { moved: true, links };
}
