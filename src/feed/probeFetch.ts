// The fetcher the discovery panels hand to the board probe. It never keeps a response body (a
// board's payload is not worth memory, only the answer is, in rjb_probe), unlike the live-postings
// fetcher. Kept out of probe.ts so tests that mock fetchFeed don't trip over it at import time.
import { createFetchJson } from './fetchFeed';

export const probeFetchJson = createFetchJson({ budgetChars: 0 });
