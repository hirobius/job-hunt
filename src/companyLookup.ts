// A company name looked up on the board systems we check (feed/discoverBoards.ts: the probe's
// politeness and cache). Shared by Add a company (#237) and the Find box (#384); the result is
// shown by CompanyLookupResults.tsx.
import { discoverBoards, type DiscoverResult } from './feed/discoverBoards';
import { probeFetchJson } from './feed/probeFetch';
import { boardsFromUrls } from './feed/sources/ats';
import { boardUrlsFor } from './feed/watchlist';

/** Look one company up, leaving out boards the track already watches. */
export function lookUpCompany(
  name: string,
  categoryId: string,
  signal: AbortSignal,
  boardUrls: string[] = boardUrlsFor(categoryId),
): Promise<DiscoverResult> {
  return discoverBoards([name], {
    fetchJson: probeFetchJson,
    signal,
    watched: boardsFromUrls(boardUrls, Infinity),
  });
}
