// Data tools (#100) as a provider (#115 Phase 1): download a full-account backup, restore one
// (merge or replace, with a safety backup first on replace), and export the job list as CSV.
// The account menu triggers them through DataToolsContext; this owns the hidden file picker and
// the restore confirm dialog, and reports failures as toasts.
import { useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Stack, Text, useToast } from '@hirobius/design-system';
import { returnFocus } from './returnFocus';
import { useBackCloses } from '../useBackCloses';
import {
  applyBackup,
  buildBackup,
  parseBackup,
  summarizeRestore,
  type AccountState,
  type Backup,
} from '../backup';
import { toCsv } from '../csv';
import { download } from '../download';
import { getAllJobs, replaceAll, useJobs } from '../store';
import { getSnippets, replaceSnippets } from '../copyDeckStore';
import { getCurationState, replaceCurationState } from '../curation/curationStore';
import { pushRestoredCuration } from '../curation/sync';
import { getTileTriage, replaceTriage } from '../tileTriage';
import { getAllTargets, replaceTargets } from '../feed/targets';
import { getAllFilters, replaceFilters } from '../feed/savedFilters';
import { readEvidence, replaceEvidence } from '../radar/evidenceStore';
import { getTrash, replaceTrash } from '../trash';
import { getAllModes, replaceModes } from '../trackModes';
import { getAllDreams, replaceDreams } from '../feed/dreams';
import { getAllDocuments, replaceDocuments } from '../documents';
import { getApplyKit, replaceApplyKit } from '../applyKit';
import { getAllSweeps, replaceSweeps } from '../feed/sweepTitles';
import { BRAND } from '../brand';
import { EVIDENCE_TRIMMED, evidenceMergeOverflows } from '../radar/evidenceStore';
import { DataToolsContext, type DataToolsApi } from './accountContext';

const JSON_MIME = 'application/json';
const day = () => new Date().toISOString().slice(0, 10);

function currentState(): AccountState {
  return {
    jobs: getAllJobs(),
    copydeck: getSnippets(),
    curation: getCurationState(),
    triage: getTileTriage(),
    targets: getAllTargets(),
    filters: getAllFilters(),
    evidence: readEvidence(),
    modes: getAllModes(),
    trash: getTrash(),
    dreams: getAllDreams(),
    documents: getAllDocuments(),
    kit: getApplyKit(),
    sweeps: getAllSweeps(),
  };
}

function downloadBackup(prefix: string) {
  const text = JSON.stringify(buildBackup(currentState(), new Date()), null, 2);
  download(`${prefix}-${day()}.json`, text, JSON_MIME);
}

function applyState(next: AccountState) {
  replaceAll(next.jobs);
  replaceSnippets(next.copydeck);
  replaceCurationState(next.curation);
  replaceTriage(next.triage);
  replaceTargets(next.targets);
  replaceFilters(next.filters);
  replaceEvidence(next.evidence);
  replaceModes(next.modes);
  replaceTrash(next.trash);
  replaceDreams(next.dreams);
  replaceDocuments(next.documents);
  replaceApplyKit(next.kit);
  replaceSweeps(next.sweeps);
}

export default function DataToolsProvider({ children }: { children: ReactNode }) {
  const jobs = useJobs();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  // The browser's Back closes the Restore dialog and stays on the page (return paths).
  useBackCloses(pending !== null, () => setPending(null), 'restore-backup');
  const fail = (title: string, description: string) =>
    toast({ title, description, tone: 'danger', duration: 8000 });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be chosen again
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (parsed.ok) setPending(parsed.backup);
    else {
      setPending(null);
      fail("Can't restore that file", parsed.reason);
    }
  };

  const restore = (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace') downloadBackup(`${BRAND.slug}-before-restore`);
    const before = currentState();
    applyState(applyBackup(before, pending, mode));
    if (mode === 'merge' && evidenceMergeOverflows(pending.evidence, before.evidence))
      toast({ ...EVIDENCE_TRIMMED, tone: 'warning', duration: 10000 });
    setPending(null);
    // Tracks live in their own cloud tables: mirror the restore there too, or the next sync
    // would merge the old cloud rows back in (a "replace" silently becoming a merge).
    void pushRestoredCuration(mode).then((ok) => {
      if (!ok)
        fail(
          'Cloud copy not updated',
          'Restored on this device, but the cloud copy of your tracks could not be updated. Try again when you are back online.',
        );
    });
  };

  const summary = pending ? summarizeRestore(currentState(), pending) : null;

  const api: DataToolsApi = {
    backup: () => downloadBackup(`${BRAND.slug}-backup`),
    chooseRestore: () => fileRef.current?.click(),
    exportCsv: () => download(`${BRAND.slug}.csv`, toCsv(getAllJobs()), 'text/csv'),
    canExport: jobs.length > 0,
  };

  return (
    <DataToolsContext.Provider value={api}>
      {children}
      {/* HDS has no file picker; a hidden native input behind "Restore…" is the gap. */}
      {/* eslint-disable-next-line hds/no-raw-controls */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        aria-label="Choose a backup file to restore"
        hidden
        onChange={onFile}
      />
      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <Dialog.Content style={{ width: '100%', maxWidth: 520 }} onCloseAutoFocus={returnFocus}>
          <Dialog.Header>
            <Dialog.Title>Restore from backup</Dialog.Title>
            <Dialog.Description>
              Merge adds the backup into your current data (the backup wins on a shared item).
              Replace swaps your data for the backup, after saving a safety copy of what you have
              now.
            </Dialog.Description>
          </Dialog.Header>
          {summary && (
            <Stack gap="tight">
              <Text variant="body">
                Backup: {summary.next.jobs} jobs, {summary.next.snippets} snippets,{' '}
                {summary.next.tracks} tracks, {summary.next.links} links
              </Text>
              <Text variant="body">
                Now: {summary.current.jobs} jobs, {summary.current.snippets} snippets,{' '}
                {summary.current.tracks} tracks, {summary.current.links} links
              </Text>
            </Stack>
          )}
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button variant="secondary" onClick={() => restore('merge')}>
              Merge into my data
            </Button>
            <Button onClick={() => restore('replace')}>Replace my data</Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </DataToolsContext.Provider>
  );
}
