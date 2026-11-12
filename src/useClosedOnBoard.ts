// The Apply list's liveness tail (#601). The check itself runs on open (LivenessViews.tsx, #602).
import { useMemo } from 'react';
import { eligibleJobs } from './feed/liveness';
import { checkFor, useLiveness } from './livenessStore';
import type { Job } from './types';

/** How many of these jobs are closed on the board, as a tail for the list's status line
 *  (" · 1 closed on the board"), '' when none (#601). The closed jobs are already in the list
 *  with their Closed badge, so nothing links to them again. */
export function useClosedOnBoard(jobs: Job[]): string {
  const all = useLiveness();
  const eligible = useMemo(() => eligibleJobs(jobs), [jobs]);
  const closed = eligible.filter((j) => checkFor(all, j.url)?.state === 'closed').length;
  return closed > 0 ? ` · ${closed} closed on the board` : '';
}
