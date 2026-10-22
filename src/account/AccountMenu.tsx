// The header's account menu (#115 Phase 1): sync status + sign-in/out, Documents (#240, #227: no
// tab), the data controls that used to crowd the Tracker toolbar (back up, restore, export), the
// theme, feedback and the Privacy and terms pages (#43) — one home for everything about "my account and my data".
// Troubleshooting (rev-3 O) holds the error page's two actions: Reload app, and Reset local data
// behind a confirm that says exactly what goes. Reset is never a loose button on a page.
import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { AlertDialog, Avatar, Button, Icon, Menu, Stack, Text } from '@hirobius/design-system';
import { useJobs } from '../store';
import { useDocuments } from '../documents';
import { clearLocalData } from '../localReset';
import { useColorMode } from '../ColorMode';
import { refocusAccount, useCloudSync, useDataTools } from './accountContext';
import { useUnsynced } from './useUnsynced';
import { navigate } from '../route';
import { LEGAL_ROUTE } from '../legal';
import { openExportLinks } from '../exportLinks';
import './sheet.css';
import { setReturnFocus } from './returnFocus';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenu() {
  const sync = useCloudSync();
  const { accountTrigger, setAccountTrigger } = sync;
  const data = useDataTools();
  const unsynced = useUnsynced();
  const { mode, toggle } = useColorMode();
  const [resetting, setResetting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** Run an item that opens a dialog; the dialog gives focus back to this trigger on close. */
  const opensDialog = (open: () => void) => () => {
    setReturnFocus(triggerRef.current);
    open();
  };
  // The trigger is the HDS Avatar (rev-3 P): your initial when signed in, a neutral person icon
  // when not, and a warning Badge dot while jobs are saved on this device only.
  const initial = sync.user?.email?.trim()[0]?.toUpperCase();
  const name = unsynced ? 'Account, not synced' : 'Account';

  // Header lines are Menu.Labels (not focusable, not clickable). The email is plain text;
  // index.html's format-detection meta stops iOS turning it into a mailto link.
  return (
    <>
      {/* Non-modal, so a dialog opened from an item (sign-in, restore) takes focus cleanly. */}
      <Menu modal={false}>
        <Menu.Trigger asChild>
          <Button
            ref={(el: HTMLButtonElement | null) => {
              triggerRef.current = el;
              setAccountTrigger?.(el);
            }}
            variant="tertiary"
            iconOnly
            iconLeft={
              <Avatar
                size="sm"
                alt=""
                initials={initial}
                fallback={initial ? 'initials' : 'icon'}
                status={unsynced ? 'warning' : undefined}
                className="rjb-avatar"
              />
            }
            label={name}
            className="rjb-account"
            title={unsynced ? 'Saved on this device only' : undefined}
          />
        </Menu.Trigger>
        <Menu.Content align="end">
          {sync.user ? (
            <>
              <Menu.Label data-account-line>Signed in as {sync.user.email}</Menu.Label>
              <Menu.Label data-account-line>{syncLine(sync.status)}</Menu.Label>
              {sync.offline && <Menu.Item onSelect={sync.retry}>Retry sync</Menu.Item>}
            </>
          ) : (
            <>
              <Menu.Label data-account-line>Saved on this device only</Menu.Label>
              <Menu.Item onSelect={opensDialog(() => sync.setSignInOpen(true))}>
                Sign in to sync…
              </Menu.Item>
            </>
          )}
          <Menu.Separator />
          {/* Documents (was Templates, #227) has no tab (#240); it opens from here and the Apply sheet. */}
          <Menu.Item onSelect={() => navigate({ tab: 'copy-deck', sub: null, jobId: null })}>
            Documents
          </Menu.Item>
          <Menu.Item onSelect={data.backup}>Back up</Menu.Item>
          <Menu.Item onSelect={opensDialog(data.chooseRestore)}>Restore…</Menu.Item>
          <Menu.Item onSelect={data.exportCsv} disabled={!data.canExport}>
            Export CSV
          </Menu.Item>
          <Menu.Item onSelect={() => openExportLinks('all')} disabled={!data.canExport}>
            Export links
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item onSelect={toggle}>{mode === 'dark' ? 'Light' : 'Dark'} theme</Menu.Item>
          <Menu.Item onSelect={() => window.open(FEEDBACK_URL, '_blank', 'noopener')}>
            Send feedback
          </Menu.Item>
          <Menu.Item onSelect={() => navigate({ tab: LEGAL_ROUTE, sub: 'privacy', jobId: null })}>
            Privacy and terms
          </Menu.Item>
          <Menu.Separator />
          <Menu.Label>Troubleshooting</Menu.Label>
          <Menu.Item onSelect={() => window.location.reload()}>Reload app</Menu.Item>
          <Menu.Item onSelect={opensDialog(() => setResetting(true))} tone="danger">
            Reset local data…
          </Menu.Item>
          {sync.user && (
            <>
              <Menu.Separator />
              <Menu.Item onSelect={sync.signOut}>Sign out</Menu.Item>
              <Menu.Item onSelect={sync.deleteMyData} tone="danger">
                Delete my data
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu>
      <ResetLocalData
        open={resetting}
        onOpenChange={setResetting}
        signedIn={!!sync.user}
        onBackup={data.backup}
        returnFocus={accountTrigger}
      />
    </>
  );
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

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
      {/* Placed like the sign-in dialog (`.rjb-sheet`): every shell dialog sits in one place. */}
      <AlertDialog.Content className="rjb-sheet" onCloseAutoFocus={refocusAccount(returnFocus)}>
        <AlertDialog.Header>
          <AlertDialog.Title>Reset local data?</AlertDialog.Title>
          {/* The safety copy is body 15 (rev-3 #s-reset-*), never the smallest text in the dialog. */}
          <AlertDialog.Description asChild>
            <Text variant="body" as="p" tone="secondary">
              {signedIn
                ? 'This clears jobs, documents and settings from this browser only. Your synced jobs come back after you sign in.'
                : `This deletes everything in this browser: ${plural(jobs, 'job')}, ${plural(docs, 'document')}, your tracks and your kit. You are not signed in, so nothing comes back.`}
            </Text>
          </AlertDialog.Description>
          {/* rev-3 #s-reset-signed-out: Back up first sits under the text, on its left edge, not
              as a centred button between the text and the actions. */}
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
            <Button variant="secondary">Cancel</Button>
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

// The status reads "Synced · <email>"; the header already names the email, so drop it here.
function syncLine(status: string): string {
  return status.startsWith('Synced') ? 'Synced' : status;
}
