// The Data dialog (redesign §5.9, #550): every action that copies your data in or out, or repairs
// this device, in one place the Account menu opens with one item ("Data"). Its own chunk
// (lazyDialogs.ts), so none of it, nor Reset's confirm, loads with the app. Below sm it is a bottom
// sheet (`.rjb-bottom-sheet`: HDS Dialog set as a sheet, G2 hds#1433, since HDS Sheet would grow the
// entry). Rows are one list (no cards): each a tertiary key with its icon and one line on what it
// does. Restore, Export links, Recently removed and Delete my data open their own dialogs or toasts:
// this one closes first (a modal would hide the toast's actions), and focus goes back to the Account
// button. Reset's confirm opens over it.
// hds-gap: hirobius/hds#1433 (G2)
import { useId, useState, type ReactNode } from 'react';
import {
  ArchiveRestore,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Link2,
  RotateCw,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { AlertDialog, Button, Dialog, Icon, Stack, Text } from '@hirobius/design-system';
import { useJobs } from '../store';
import { useDocuments } from '../documents';
import { clearLocalData } from '../localReset';
import { useTrash } from '../trash';
import { openExportLinks } from '../exportLinks';
import { openRecentlyRemoved } from '../jobDialogs';
import { hasCloudSession } from '../demo/sampleSession';
import { importFresh } from '../staleBuild';
import { navigate } from '../route';
import { useBackCloses } from '../useBackCloses';
import { ItemList, ItemRow } from '../PipelinePanel';
import { ExitButton } from '../hds-gaps/ExitButton';
import { refocusAccount, useCloudSync, useDataTools } from './accountContext';
import { setReturnFocus } from './returnFocus';

const loadSampleModule = importFresh(() => import('../demo/loadSample'));
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** One row: the action as a tertiary key with its icon, and one line on what it does. */
function DataRow({
  icon,
  label,
  line,
  onPress,
  disabled,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  line: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const id = useId();
  return (
    <ItemRow dense>
      <Stack gap="hairline" align="start">
        <Button
          variant="tertiary"
          tone={danger ? 'danger' : undefined}
          flush
          iconLeft={<Icon icon={icon} size="small" />}
          onClick={onPress}
          disabled={disabled}
          aria-describedby={id}
        >
          {label}
        </Button>
        <Text variant="caption" as="p" tone="secondary" id={id}>
          {line}
        </Text>
      </Stack>
    </ItemRow>
  );
}

export default function DataDialog({
  onClose,
  onCloseAutoFocus,
}: {
  /** Close this dialog (before another one opens in its place). */
  onClose: () => void;
  onCloseAutoFocus?: () => void;
}) {
  const sync = useCloudSync();
  const data = useDataTools();
  const jobs = useJobs().length;
  const removed = useTrash().length;
  const [resetting, setResetting] = useState(false);
  useBackCloses(resetting, () => setResetting(false), 'reset-local-data');
  /** Close, then open another dialog that hands focus back to the Account button. */
  const handOff = (open: () => void) => () => {
    setReturnFocus(sync.accountTrigger ?? null);
    onClose();
    open();
  };
  // The sample seeds only an empty tracker, never into an account (demo/loadSample.ts).
  const sampleOffered = !sync.user && !hasCloudSession() && jobs === 0;
  const trySample = () => {
    void loadSampleModule()
      .then(({ loadSample }) => {
        if (hasCloudSession() || !loadSample()) return;
        onClose();
        navigate({ tab: 'apply', sub: null, jobId: null });
      })
      .catch(() => {});
  };
  return (
    <Dialog.Content className="rjb-dialog rjb-bottom-sheet" onCloseAutoFocus={onCloseAutoFocus}>
      <Dialog.Header>
        <span className="rjb-sheet-handle" aria-hidden="true" />
        <Dialog.Title>Data</Dialog.Title>
        <Dialog.Description>
          {sync.user
            ? 'Copy your data in or out, or fix this device.'
            : 'Your data is on this device only. Copy it in or out, or fix this device.'}
        </Dialog.Description>
      </Dialog.Header>
      <Stack gap="spacious" className="rjb-dialog-body">
        <Stack gap="tight" as="section" aria-labelledby="rjb-data-copy">
          <Text variant="body" as="h2" className="rjb-semibold" id="rjb-data-copy">
            Your data
          </Text>
          <ItemList label="Your data" inset="none">
            <DataRow
              icon={Download}
              label="Back up"
              line="Download every job, document and setting as one file."
              onPress={data.backup}
            />
            <DataRow
              icon={Upload}
              label="Restore…"
              line="Merge a backup file into your data, or replace your data with it."
              onPress={handOff(data.chooseRestore)}
            />
            <DataRow
              icon={FileSpreadsheet}
              label="Export CSV"
              line="Your jobs as a spreadsheet."
              onPress={data.exportCsv}
              disabled={!data.canExport}
            />
            <DataRow
              icon={Link2}
              label="Export links"
              line="Copy or download the links to your jobs."
              onPress={handOff(() => openExportLinks('all'))}
              disabled={!data.canExport}
            />
            {removed > 0 && (
              <DataRow
                icon={ArchiveRestore}
                label={`Recently removed (${removed})`}
                line="Jobs you removed in the last 30 days. Restore them or delete them for good."
                onPress={handOff(openRecentlyRemoved)}
              />
            )}
          </ItemList>
        </Stack>
        <Stack gap="tight" as="section" aria-labelledby="rjb-data-fix">
          <Text variant="body" as="h2" className="rjb-semibold" id="rjb-data-fix">
            This device
          </Text>
          <ItemList label="This device" inset="none">
            {sampleOffered && (
              <DataRow
                icon={FlaskConical}
                label="Try with sample data"
                line="Fill Apply with fictional jobs to look around. Clear them any time."
                onPress={trySample}
              />
            )}
            <DataRow
              icon={RotateCw}
              label="Reload app"
              line="Load the app again. Nothing is lost."
              onPress={() => window.location.reload()}
            />
            <DataRow
              icon={Trash2}
              label="Reset local data…"
              line="Clear this browser's copy. You confirm first."
              onPress={() => setResetting(true)}
              danger
            />
            {sync.user && (
              <DataRow
                icon={Trash2}
                label="Delete my data"
                line="Delete your synced data from the cloud and this device. You confirm first."
                onPress={handOff(sync.deleteMyData)}
                danger
              />
            )}
          </ItemList>
        </Stack>
      </Stack>
      <ResetLocalData
        open={resetting}
        onOpenChange={setResetting}
        signedIn={!!sync.user}
        onBackup={data.backup}
        returnFocus={sync.accountTrigger}
      />
    </Dialog.Content>
  );
}

/** The confirm for Reset local data: what goes, and whether anything comes back. */
function ResetLocalData({
  open,
  onOpenChange,
  signedIn,
  onBackup,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
  onBackup: () => void;
  returnFocus?: HTMLButtonElement | null;
}) {
  const jobs = useJobs().length;
  const docs = useDocuments().length;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Placed like the other shell dialogs with a field (`.rjb-sheet`, sheet.css). Cancel puts
          focus back on the Reset row under it (Radix); refocusAccount only when that is gone. */}
      <AlertDialog.Content className="rjb-sheet" onCloseAutoFocus={refocusAccount(returnFocus)}>
        <AlertDialog.Header>
          <AlertDialog.Title>Reset local data?</AlertDialog.Title>
          {/* The safety copy is body 15 (rev-3 #s-reset-*), never the smallest text in the dialog.
              HDS's Description is already a <p> (Radix asChild inside), so the body Text is a span. */}
          <AlertDialog.Description>
            <Text variant="body" as="span" tone="secondary">
              {signedIn
                ? 'This clears jobs, documents and settings from this browser only. Your synced jobs come back after you sign in.'
                : `This deletes everything in this browser: ${plural(jobs, 'job')}, ${plural(docs, 'document')}, your tracks and your kit. You are not signed in, so nothing comes back.`}
            </Text>
          </AlertDialog.Description>
          {/* rev-3 #s-reset-signed-out: Back up first sits under the text, on its left edge. */}
          {!signedIn && (
            <Stack align="start">
              <Button
                variant="tertiary"
                size="sm"
                iconLeft={<Icon icon={Download} />}
                onClick={onBackup}
              >
                Back up first
              </Button>
            </Stack>
          )}
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel asChild>
            <ExitButton>Cancel</ExitButton>
          </AlertDialog.Cancel>
          <AlertDialog.Action asChild>
            {/* The app's one destructive style: HDS secondary + tone="danger". */}
            <Button variant="secondary" tone="danger" onClick={clearLocalData}>
              Reset local data
            </Button>
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
