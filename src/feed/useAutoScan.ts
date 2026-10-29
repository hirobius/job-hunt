// The auto-scan's React seam (#415): what to scan for (the Search profile and Sources, through the
// Feed's own `useFeedInputs`; with no profile yet, the design-system titles, since the app's one job
// is design-system openings) and the host that scans on app open, once sync has settled so a
// signed-in user's profile is here first.
import { useEffect, useMemo, useRef } from 'react';
import { DESIGN_SYSTEMS_TITLES } from '../searchDefaults';
import { useCloudSync } from '../account/accountContext';
import { useFeedInputs } from './useFeed';
import { boardUrlsOf } from './profile';
import { scanOnOpen, type ScanInput } from './autoScan';

/** What to scan for: the profile's titles and inclusion check, and the followed boards. */
export function useScanInput(): ScanInput {
  const { profile, sources } = useFeedInputs();
  return useMemo<ScanInput>(
    () =>
      profile.titles.length
        ? { terms: profile.titles, include: profile.include, boardUrls: boardUrlsOf(sources) }
        : { terms: [...DESIGN_SYSTEMS_TITLES], boardUrls: boardUrlsOf(sources) },
    [profile, sources],
  );
}

/** Mounted once in the shell: scans on open when a scan is due. */
export function AutoScanOnOpen(): null {
  const { settled } = useCloudSync();
  const input = useScanInput();
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  }, [input]);
  useEffect(() => {
    if (settled) return scanOnOpen(() => latest.current);
  }, [settled]);
  return null;
}
