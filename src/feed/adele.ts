// Adele (2026-10-23): UXPin's public list of design systems (github.com/uxpin/adele, MIT), a
// one-time snapshot in data/adele.json (company name + the design system's site), so no new host.
// "Add companies with public design systems" runs the names through the board probe (its limits,
// its cache) and watches each live board as it is found. Re-take the snapshot by hand from
// ADELE.file; the credit and licence ride with the data.
import data from './data/adele.json';
import { discoverBoards, parseList, type DiscoverResult } from './discoverBoards';
import type { ProbeOptions } from './probe';
import { boardsFromUrls, canonicalBoardUrl } from './sources/ats';
import { addBoardTiles } from './watchlist';

export interface AdeleCompany {
  name: string;
  /** The company's public design system site ('' when the list has none). */
  site: string;
}

export const ADELE: {
  source: string;
  file: string;
  license: string;
  /** The MIT notice, kept with the copy as the licence asks. */
  licenseText: string;
  snapshot: string;
  companies: AdeleCompany[];
} = data;

export const ADELE_CREDIT = 'Adele, UXPin’s list of public design systems';

// Public bodies hire through civil-service portals, never an ATS board: probing them only finds
// a stranger's board under the same slug.
const PUBLIC_BODIES = new Set([
  'consumer financial protection bureau',
  'estonia',
  'gov.uk',
  '18f',
  'usajobs',
  'altinn',
  'digital transformation agency',
  'government of canada',
]);

/** The names the probe can read (parseList drops what it can't), public bodies left out. */
export const adeleNames = (): string[] =>
  parseList(
    ADELE.companies
      .map((c) => c.name)
      .filter((n) => !PUBLIC_BODIES.has(n.toLowerCase()))
      .join('\n'),
  ).lines;

export interface AdeleRun {
  /** Boards newly watched. */
  watched: number;
  missed: number;
  unknown: number;
  alreadyWatched: number;
  done: number;
  total: number;
}

const runOf = (r: DiscoverResult, watched: number): AdeleRun => ({
  watched,
  missed: r.missed.length,
  unknown: r.unknown.length,
  alreadyWatched: r.alreadyWatched.length,
  done: r.done,
  total: r.total,
});

/** Probe `names` and watch every live board found, as it is found (one bulk write per answer, so
 *  a run cut short keeps what it found). */
export async function watchAdeleBoards(
  categoryId: string,
  names: string[],
  opts: ProbeOptions & { boardUrls: string[]; onProgress?: (run: AdeleRun) => void },
): Promise<AdeleRun> {
  const { boardUrls, onProgress, ...probe } = opts;
  let taken = 0;
  let watched = 0;
  const take = (r: DiscoverResult) => {
    const fresh = r.found.slice(taken);
    taken = r.found.length;
    if (fresh.length)
      watched += addBoardTiles(
        categoryId,
        fresh.map((f) => canonicalBoardUrl(f.board)),
      );
  };
  const result = await discoverBoards(names, {
    ...probe,
    watched: boardsFromUrls(boardUrls, Infinity),
    onProgress: (s) => {
      take(s);
      onProgress?.(runOf(s, watched));
    },
  });
  take(result);
  return runOf(result, watched);
}
