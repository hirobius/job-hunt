// The account seam (#115 Phase 1): what the header's account menu, the sync nudge and the
// sign-in dialog read. CloudSyncProvider and DataToolsProvider own the behaviour; these
// contexts are kept out of the component modules for fast refresh.
import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

export interface CloudSyncApi {
  /** The signed-in user, or null when signed out. */
  user: User | null;
  /** False until the stored session (or its absence) is known. */
  authResolved: boolean;
  /** One-line sync status ("Synced · a@b.c", "Saving…", the offline message…). */
  status: string;
  /** True once the session is known and no pull/push is in flight (signed out counts as
   *  settled). Views wait on this before deciding a record is really missing. */
  settled: boolean;
  /** True while the last pull/push failed — the menu offers Retry. */
  offline: boolean;
  /** Email a magic sign-in link. Resolves to an error message, or null when sent. */
  sendLink: (email: string) => Promise<string | null>;
  retry: () => void;
  signOut: () => void;
  deleteMyData: () => void;
  /** The sign-in dialog is opened from the menu and from the nudge. */
  signInOpen: boolean;
  setSignInOpen: (open: boolean) => void;
}

export interface DataToolsApi {
  backup: () => void;
  /** Opens the file picker; the confirm dialog follows a valid file. */
  chooseRestore: () => void;
  exportCsv: () => void;
  canExport: boolean;
}

export const CloudSyncContext = createContext<CloudSyncApi | null>(null);
export const DataToolsContext = createContext<DataToolsApi | null>(null);

export function useCloudSync(): CloudSyncApi {
  const v = useContext(CloudSyncContext);
  if (!v) throw new Error('useCloudSync must be used under <CloudSyncProvider>');
  return v;
}

export function useDataTools(): DataToolsApi {
  const v = useContext(DataToolsContext);
  if (!v) throw new Error('useDataTools must be used under <DataToolsProvider>');
  return v;
}
