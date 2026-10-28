// The auto-scan's React seam (#415): what to scan for (the active track's Search profile and
// Sources, through the Feed's own `useFeedInputs`; with no track yet, the Design Systems titles,
// since the app's one job is design-system openings) and the host that scans on app open, once sync
// has settled so a signed-in user's tracks are here first.
import { useEffect, useMemo, useRef } from 'react';
import { useCategories } from '../curation/curationStore';
import { DESIGN_SYSTEMS_PACK } from '../curation/packContent';
import { useCloudSync } from '../account/accountContext';
import { useFeedInputs } from './useFeed';
import { boardUrlsOf } from './profile';
import { scanOnOpen, type ScanInput } from './autoScan';
import { loadActiveCategory } from '../activeTrack';

/** The track Discover has open (else the first one), or null with no track. */
export function useActiveTrackId(): string | null {
  const categories = useCategories();
  return categories.length ? loadActiveCategory(categories) : null;
}

/** What to scan for: `trackId`'s profile and Sources (the open track when not given). */
export function useScanInput(trackId?: string | null): {
  input: ScanInput;
  categoryId: string | null;
} {
  const active = useActiveTrackId();
  const categoryId = trackId ?? active;
  const { profile, sources } = useFeedInputs(categoryId ?? '');
  const input = useMemo<ScanInput>(
    () =>
      categoryId && profile.titles.length
        ? {
            terms: profile.titles,
            include: profile.include,
            boardUrls: boardUrlsOf(sources),
            trackId: categoryId,
          }
        : {
            terms: [...DESIGN_SYSTEMS_PACK.titles],
            boardUrls: boardUrlsOf(sources),
            trackId: null,
          },
    [categoryId, profile, sources],
  );
  return { input, categoryId };
}

/** Mounted once in the shell: scans on open when a scan is due. */
export function AutoScanOnOpen(): null {
  const { settled } = useCloudSync();
  const { input } = useScanInput();
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  }, [input]);
  useEffect(() => {
    if (settled) return scanOnOpen(() => latest.current);
  }, [settled]);
  return null;
}
