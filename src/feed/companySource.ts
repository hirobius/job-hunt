// Where the Companies tool finds companies for a track (#215). The source follows the track:
//   1. a GitHub topic search where the track's own terms name one (feed/teamTopics.ts: design
//      systems, ServiceNow), unless its label names a physical discipline that makes a bare
//      "design engineer" a CAD title ("Mechanical engineering");
//   2. otherwise the track's starter-pack directory (radar/directory.ts, by its label) and the YC
//      mirror's "hiring now" list (feed/yc.ts) filtered by the track's titles and ATS roles.
// So a trades or consulting track never lists design-system organisations, and the panel says in
// one line which source it used. No new hosts: the YC mirror and the ATS probes are already in CSP.
import { boardsForPack, packIdForLabel, STARTER_PACKS } from '../curation/starterPacks';
import { discoverBoards, websitesByName } from './discoverBoards';
import { httpUrl } from '../httpUrl';
import type { Limiter, ProbeOptions } from './probe';
import { boardsFromUrls, boardLabel } from './sources/ats';
import type { Board } from './sources/ats';
import type { FetchJson } from './sources/http';
import { termRegex } from './match';
import { teamSearchFor, type TeamSearch } from './teamTopics';
import { parseYcCompany, YC_BASE, type YcCompany } from './yc';
import { boardKey } from './teamRoles';

/** The YC mirror's companies hiring now (the same file the company type-ahead reads). */
export const YC_HIRING_URL = `${YC_BASE}companies/hiring.json`;
/** YC companies probed per run: each is up to a few ATS lookups. */
export const MAX_YC = 15;

export type CompanySource =
  | { kind: 'github'; search: TeamSearch }
  | {
      kind: 'suggested';
      /** The starter pack's label, when the track belongs to one with boards. */
      packLabel?: string;
      packBoards: readonly string[];
      yc: boolean;
      /** One plain line: which source this track uses, and why not GitHub. */
      line: string;
    }
  | { kind: 'none' };

export interface TrackLike {
  label: string;
  titles: string[];
  atsRoles: string[];
}

/** The company source for a track. `enabled` mirrors DISCOVERY_SOURCE_ENABLED. */
export function companySourceFor(
  track: TrackLike,
  enabled: { github: boolean; yc: boolean },
): CompanySource {
  const search = teamSearchFor([...track.titles, ...track.atsRoles], track.label);
  if (search) return enabled.github ? { kind: 'github', search } : { kind: 'none' };
  const packId = packIdForLabel(track.label);
  const packBoards = boardsForPack(packId);
  const yc = enabled.yc && trackTerms(track).length > 0;
  if (!packBoards.length && !yc) return { kind: 'none' };
  const packLabel = packBoards.length
    ? STARTER_PACKS.find((p) => p.id === packId)?.label
    : undefined;
  const from = [packLabel && `the ${packLabel} starter list`, yc && 'YC companies hiring now']
    .filter(Boolean)
    .join(' and ');
  return {
    kind: 'suggested',
    packLabel,
    packBoards,
    yc,
    line: `Suggestions come from ${from}. GitHub search only finds design-system and ServiceNow teams.`,
  };
}

/** The track's titles and ATS roles, deduped, ignoring case. */
export function trackTerms(track: Pick<TrackLike, 'titles' | 'atsRoles'>): string[] {
  const seen = new Set<string>();
  return [...track.titles, ...track.atsRoles]
    .map((t) => t.trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}

/** YC companies hiring now whose one-liner, tags or industries mention one of the terms as a
 *  phrase ("implementation consultant", not "consultant" alone), at most `limit`. */
export function ycMatches(body: unknown, terms: string[], limit = MAX_YC): YcCompany[] {
  const res = terms.map(termRegex).filter((r): r is RegExp => !!r);
  if (!res.length || !Array.isArray(body)) return [];
  const out: YcCompany[] = [];
  const seen = new Set<string>();
  for (const raw of body) {
    const c = parseYcCompany(raw);
    if (!c || seen.has(c.name.toLowerCase())) continue;
    const text = [c.oneLiner, ...c.tags, ...c.industries].join(' | ');
    if (!res.some((r) => r.test(text))) continue;
    seen.add(c.name.toLowerCase());
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** One suggested company, as the panel lists it. */
export interface SuggestedCompany {
  login: string;
  company: string;
  website?: string;
  board?: Board;
  /** No board and some ATS could not answer: never read as "none". */
  boardCheck?: 'unknown';
  from: 'pack' | 'yc';
}

export interface SuggestReport {
  /** The YC list could not be read (down, blocked, offline). */
  ycDown?: boolean;
  /** YC companies matching the track's terms (before the probe). */
  ycMatched: number;
}

export interface SuggestOptions {
  fetchJson: FetchJson;
  /** Boards the track already watches: never suggested again. */
  watched: Board[];
  terms: string[];
  limiter?: Limiter;
  signal?: AbortSignal;
  /** The probe cache (tests pass a memory one). */
  kv?: ProbeOptions['kv'];
  report: SuggestReport;
}

/** The suggested companies for a `suggested` source: the pack's boards the track doesn't watch
 *  yet, then the YC companies that match, each probed for a board. Yields as they are known. */
export async function* suggestTrackCompanies(
  source: Extract<CompanySource, { kind: 'suggested' }>,
  opts: SuggestOptions,
): AsyncGenerator<SuggestedCompany> {
  const { fetchJson, watched, terms, limiter, signal, kv, report } = opts;
  report.ycMatched = 0;
  delete report.ycDown;
  const known = new Set(watched.map(boardKey));
  for (const b of boardsFromUrls([...source.packBoards], Infinity)) {
    if (known.has(boardKey(b))) continue;
    known.add(boardKey(b));
    yield { login: boardKey(b), company: boardLabel(b), board: b, from: 'pack' };
  }
  if (!source.yc || signal?.aborted) return;
  let body: unknown;
  try {
    body = await fetchJson(YC_HIRING_URL);
  } catch {
    if (!signal?.aborted) report.ycDown = true;
    return;
  }
  const matches = ycMatches(body, terms);
  report.ycMatched = matches.length;
  if (!matches.length) return;
  const byName = new Map(matches.map((c) => [c.name.toLowerCase(), c]));
  const result = await discoverBoards(
    matches.map((c) => c.name),
    { fetchJson, signal, limiter, watched, kv, websites: websitesByName(matches) },
  );
  const login = (c: YcCompany) => `yc:${(c.slug || c.name).toLowerCase()}`;
  // The YC mirror is a third party: only an http(s) website becomes a link.
  const site = (name: string) => httpUrl(byName.get(name.toLowerCase())?.website);
  for (const f of result.found) {
    if (known.has(boardKey(f.board))) continue;
    known.add(boardKey(f.board));
    const c = byName.get(f.company.toLowerCase());
    yield {
      login: c ? login(c) : boardKey(f.board),
      company: c?.name ?? f.company,
      website: site(f.company),
      board: f.board,
      from: 'yc',
    };
  }
  // A board the name matched without the company's website on it is never suggested as theirs;
  // the company still is, as "couldn't check" (never as "no board").
  const unconfirmed = [...new Set(result.unconfirmed.map((u) => u.company))].filter(
    (n) => !result.found.some((f) => f.company === n),
  );
  for (const [names, unknown] of [
    [result.missed, false],
    [result.unknown, true],
    [unconfirmed, true],
  ] as const) {
    for (const name of names) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;
      yield {
        login: login(c),
        company: c.name,
        website: site(name),
        ...(unknown && { boardCheck: 'unknown' as const }),
        from: 'yc',
      };
    }
  }
}
