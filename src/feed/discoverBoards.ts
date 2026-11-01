// Method 2: automatic board discovery. A pasted list of company names, slugs or board URLs goes
// through the probe (src/feed/probe.ts) and comes back sorted into boards found, companies with no
// public board, and companies that could not be checked. Progressive: `onProgress` sees a snapshot
// as each company answers. Watched boards are left out of the results. A board found from a name
// that doesn't show it is the company's (probe.ts, boardIdentity.ts) comes back `unconfirmed`:
// listed with the reason, never watched without the user's say.
import { probeCompanies, parseCompanyLine, type ProbeOptions } from './probe';
import type { Board } from './sources/ats';

/** Names accepted per run (docs/specs/discovery-methods.md, open question 1). */
export const MAX_LIST = 500;

export interface ParsedList {
  /** Lines worth probing, deduped, at most MAX_LIST. */
  lines: string[];
  /** Lines that are neither a name, a slug nor a board URL. */
  ignored: string[];
  /** Lines left out because the list was over MAX_LIST. */
  trimmed: number;
}

export function parseList(text: string): ParsedList {
  const seen = new Set<string>();
  const lines: string[] = [];
  const ignored: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!parseCompanyLine(line)) {
      ignored.push(line);
      continue;
    }
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return {
    lines: lines.slice(0, MAX_LIST),
    ignored,
    trimmed: Math.max(0, lines.length - MAX_LIST),
  };
}

export interface FoundBoard {
  company: string;
  board: Board;
  /** Open roles when checked; zero means a board with no openings right now. */
  jobs?: number;
}

export interface UnconfirmedBoard extends FoundBoard {
  /** Why it isn't taken as the company's. */
  why: string;
}

/** The probe's `websites` option from (name, website) pairs; blanks are left out. */
export function websitesByName(
  companies: { name: string; website?: string }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of companies)
    if (c.website?.trim()) out.set(c.name.trim().toLowerCase(), c.website.trim());
  return out;
}

export interface DiscoverResult {
  found: FoundBoard[];
  /** Live boards for a name that don't show they are that company's: never watched. */
  unconfirmed: UnconfirmedBoard[];
  /** Companies where every ATS answered "no such board". */
  missed: string[];
  /** Companies we could not check (rate-limited, offline, blocked): lines to retry. */
  unknown: string[];
  /** Companies whose board the track already watches. */
  alreadyWatched: string[];
  done: number;
  total: number;
}

const same = (a: Board, b: Board) =>
  a.kind === b.kind && a.slug.toLowerCase() === b.slug.toLowerCase() && !a.eu === !b.eu;

export type DiscoverOptions = ProbeOptions & {
  /** Boards the track already watches: left out of `found`. */
  watched?: Board[];
  onProgress?: (snapshot: DiscoverResult) => void;
};

export async function discoverBoards(
  lines: string[],
  opts: DiscoverOptions,
): Promise<DiscoverResult> {
  const { watched = [], onProgress, ...probe } = opts;
  const out: DiscoverResult = {
    found: [],
    unconfirmed: [],
    missed: [],
    unknown: [],
    alreadyWatched: [],
    done: 0,
    total: lines.length,
  };
  const snapshot = (): DiscoverResult => ({
    ...out,
    found: [...out.found],
    unconfirmed: [...out.unconfirmed],
    missed: [...out.missed],
    unknown: [...out.unknown],
    alreadyWatched: [...out.alreadyWatched],
  });
  for await (const r of probeCompanies(lines, probe)) {
    out.done++;
    if (r.state === 'missed') out.missed.push(r.name);
    else if (r.state === 'unknown') out.unknown.push(r.input);
    else if (r.state === 'unconfirmed') {
      for (const h of r.unconfirmed) {
        if (watched.some((w) => same(w, h.board))) continue;
        out.unconfirmed.push({ company: r.name, board: h.board, jobs: h.jobs, why: h.why });
      }
    } else {
      let fresh = 0;
      for (const h of r.hits) {
        if (watched.some((w) => same(w, h.board))) continue;
        if (out.found.some((f) => same(f.board, h.board))) continue;
        out.found.push({ company: r.name, board: h.board, jobs: h.jobs });
        fresh++;
      }
      if (!fresh) out.alreadyWatched.push(r.name);
    }
    onProgress?.(snapshot());
  }
  return snapshot();
}
