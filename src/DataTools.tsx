// Data tools toolbar (#100): download a full-account backup, restore one (merge or replace,
// with a safety backup first on replace), and export the job list as CSV. HDS components only.
import { useRef, useState } from 'react';
import { Alert, Button, Cluster, Dialog, Stack, Text } from '@hirobius/design-system';
import {
  applyBackup,
  buildBackup,
  parseBackup,
  summarizeRestore,
  type AccountState,
  type Backup,
} from './backup';
import { toCsv } from './csv';
import { download } from './download';
import { getAllJobs, replaceAll, useJobs } from './store';
import { getSnippets, replaceSnippets } from './copyDeckStore';
import { getCurationState, replaceCurationState } from './curation/curationStore';
import { getTileTriage, replaceTriage } from './tileTriage';

const JSON_MIME = 'application/json';
const day = () => new Date().toISOString().slice(0, 10);

function currentState(): AccountState {
  return {
    jobs: getAllJobs(),
    copydeck: getSnippets(),
    curation: getCurationState(),
    triage: getTileTriage(),
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
}

export default function DataTools() {
  const jobs = useJobs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be chosen again
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (parsed.ok) {
      setError(null);
      setPending(parsed.backup);
    } else {
      setPending(null);
      setError(parsed.reason);
    }
  };

  const restore = (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace') downloadBackup('apply-board-before-restore');
    applyState(applyBackup(currentState(), pending, mode));
    setPending(null);
  };

  const summary = pending ? summarizeRestore(currentState(), pending) : null;

  return (
    <Stack gap="tight">
      <Cluster gap="tight">
        <Button size="sm" variant="tertiary" onClick={() => downloadBackup('apply-board-backup')}>
          Back up
        </Button>
        <Button size="sm" variant="tertiary" onClick={() => fileRef.current?.click()}>
          Restore…
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          disabled={jobs.length === 0}
          onClick={() => download('apply-board.csv', toCsv(getAllJobs()), 'text/csv')}
        >
          Export CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Choose a backup file to restore"
          hidden
          onChange={onFile}
        />
      </Cluster>

      {error && (
        <Alert tone="danger" title="Can't restore that file">
          {error}
        </Alert>
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <Dialog.Content style={{ width: '100%', maxWidth: 520 }}>
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
    </Stack>
  );
}
