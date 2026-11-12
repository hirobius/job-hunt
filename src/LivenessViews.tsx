// Liveness on open (#602, Adrian 2026-11-11): no "Check which are still open" button. Like the
// auto-scan (AutoScanOnOpen), the check runs by itself once sync has settled, signed in only and
// never behind the sign-in screen: once per page load, each board read once, and a job checked in
// the last 6 hours is not asked again (feed/liveness.ts dueJobs). A failed read never marks a job
// closed (livenessStore keeps what it knew). The answer shows on the Apply list's status line
// ("To apply · 21 jobs · 1 closed on the board", useClosedOnBoard) and each closed job's badge.
// Its own lazy chunk, mounted by App, so the entry never carries the check.
import { useEffect, useMemo } from 'react';
import { canWrite, useCloudSync } from './account/accountContext';
import { eligibleJobs } from './feed/liveness';
import { autoLivenessCheck } from './livenessStore';
import { useJobs } from './store';

export function LivenessOnOpen(): null {
  const sync = useCloudSync();
  const settled = canWrite(sync);
  const signedIn = !!sync.user;
  const jobs = useJobs();
  const eligible = useMemo(() => eligibleJobs(jobs), [jobs]);
  const ready = settled && signedIn && !sync.signInOpen && eligible.length > 0;
  useEffect(() => {
    if (ready) void autoLivenessCheck(eligible);
    // Once a page load: the first moment there is something to check (autoLivenessCheck holds it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return null;
}
