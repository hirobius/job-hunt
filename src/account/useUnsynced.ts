// "Your jobs live only in this browser" (#133): signed out, with something worth syncing. Drives the
// Today nudge and the Account trigger's "Saved on this device only" title elsewhere.
import { useJobs } from '../store';
import { useCloudSync } from './accountContext';

export function useUnsynced(): boolean {
  const { user, authResolved } = useCloudSync();
  const hasData = useJobs().length > 0;
  return authResolved && !user && hasData;
}
