// The auto-scan's React seam (#415): what to scan for (the Search profile and Sources, through the
// Feed's own `useFeedInputs`; with no profile yet, the design-system titles, since the app's one job
// is design-system openings) and the host that scans on app open, once sync has settled so a
// signed-in user's profile is here first.
import { useEffect, useMemo, useRef } from 'react';
import { DESIGN_SYSTEMS_TITLES } from '../searchDefaults';
import { canWrite, useCloudSync } from '../account/accountContext';
import { useFeedInputs } from './useFeed';
import { boardUrlsOf } from './profile';
import { cancelScan, scanOnOpen, type ScanInput } from './autoScan';

/** What to scan for: the profile's titles, inclusion check, Remote only and leave-out words, and
 *  the followed boards. */
export function useScanInput(): ScanInput {
  const { profile, sources } = useFeedInputs();
  return useMemo<ScanInput>(
    () =>
      profile.titles.length
        ? {
            terms: profile.titles,
            include: profile.include,
            boardUrls: boardUrlsOf(sources),
            remoteOnly: profile.mode === 'remote',
            exclude: profile.exclude,
          }
        : { terms: [...DESIGN_SYSTEMS_TITLES], boardUrls: boardUrlsOf(sources) },
    [profile, sources],
  );
}

/** Mounted once in the shell: scans on open when a scan is due. Signed in only, and never behind
 *  the sign-in screen (2026-11-07: on a phone the scan's hundreds of board reads made it crawl,
 *  8 → 300 MB heap and ~1 s long tasks). Signed out, nothing scans on open: the server's sync reads
 *  the boards every 15 minutes for an account, and Scan now still works. The sign-in screen makes
 *  it wait, and a run in flight when it opens stops (what it found is kept, and the next start
 *  finishes it). */
export function AutoScanOnOpen(): null {
  const sync = useCloudSync();
  const { signInOpen, user } = sync;
  const settled = canWrite(sync);
  const signedIn = !!user;
  const input = useScanInput();
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  }, [input]);
  // Stop a run only on a sign-out, never merely for being signed out: a signed-out Scan now must
  // not be cut short when sync settles under it (2026-11-07).
  const wasSignedIn = useRef(signedIn);
  useEffect(() => {
    const signedOut = wasSignedIn.current && !signedIn;
    wasSignedIn.current = signedIn;
    if (signInOpen || signedOut) {
      cancelScan();
      return;
    }
    if (!settled || !signedIn) return;
    return scanOnOpen(() => latest.current);
  }, [settled, signInOpen, signedIn]);
  return null;
}
