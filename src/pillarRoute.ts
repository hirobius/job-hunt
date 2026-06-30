// The seam between the URL hash and the active career pillar, in one place. The active pillar
// lives in pillarStore; the hash carries ?pillar=<id>. This bridge owns the bidirectional
// projection so views don't juggle both stores: it restores a pillar named in the hash, and
// reflects the active pillar back into the hash (only when non-default, to keep common URLs
// clean). Mounted once (in App).
import { useEffect } from 'react';
import { useRoute, navigate, getRoute } from './route';
import { usePillars, useActivePillarId, setActivePillar, getActivePillarId } from './pillarStore';

export function useSyncPillarRoute(): void {
  const route = useRoute();
  const activePillarId = useActivePillarId();
  const pillars = usePillars();
  const defaultPillarId = pillars[0]?.id;

  // URL → store: restore a pillar named in the hash (invalid ids are ignored by
  // setActivePillar and self-heal via the store → URL effect below).
  useEffect(() => {
    if (route.pillar && route.pillar !== getActivePillarId()) setActivePillar(route.pillar);
  }, [route.pillar]);

  // Store → URL: reflect the active pillar, but only when it isn't the default, so common URLs
  // stay clean (#/discover, not #/discover?pillar=<default>). Replace — a pillar switch is a
  // filter, not a new navigation step.
  useEffect(() => {
    const wanted = defaultPillarId && activePillarId !== defaultPillarId ? activePillarId : null;
    if ((getRoute().pillar ?? null) !== wanted) navigate({ pillar: wanted }, true);
  }, [activePillarId, defaultPillarId]);
}
