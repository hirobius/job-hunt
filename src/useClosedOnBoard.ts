// The Apply list's liveness tail (#601): see LivenessViews.tsx.
import { useContext, useEffect, useMemo } from 'react';
import { CloudSyncContext } from './account/accountContext';
import { eligibleJobs } from './feed/liveness';
import { autoLivenessCheck, checkFor, useLiveness } from './livenessStore';
import type { Job } from './types';

/** Runs the once-a-session check and says how many of these jobs are closed on the board, as a
 *  tail for the list's status line (" · 1 closed on the board"), '' when none (#601). The closed
 *  jobs are already in the list with their Closed badge, so nothing links to them again. */
export function useClosedOnBoard(jobs: Job[]): string {
  const all = useLiveness();
  const eligible = useMemo(() => eligibleJobs(jobs), [jobs]);
  const hasEligible = eligible.length > 0;
  // Held behind the sign-in screen (2026-11-09); runs once it closes.
  const held = !!useContext(CloudSyncContext)?.signInOpen;
  useEffect(() => {
    if (hasEligible && !held) void autoLivenessCheck(eligible);
    // Once per session: the first Apply open with something to check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEligible, held]);
  const closed = eligible.filter((j) => checkFor(all, j.url)?.state === 'closed').length;
  return closed > 0 ? ` · ${closed} closed on the board` : '';
}
