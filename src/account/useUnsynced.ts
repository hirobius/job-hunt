// The Account Avatar's warning dot (rev-3 P): this device holds work the cloud doesn't have.
// Signed out with something worth syncing (#133), or signed in while sync is failing (a pull/push
// outage or a refused track write, `offline`). Drives the "Account, not synced" name and the
// "Saved on this device only" title.
import { useJobs } from '../store';
import { useCloudSync } from './accountContext';

export function useUnsynced(): boolean {
  const { user, authResolved, offline } = useCloudSync();
  const hasData = useJobs().length > 0;
  if (!authResolved) return false;
  return user ? offline : hasData;
}
