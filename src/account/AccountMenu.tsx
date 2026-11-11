// The header's account menu (#115 Phase 1): sync status + sign-in/out, Documents (#240, #227: no
// tab), the data controls that used to crowd the Tracker toolbar (back up, restore, export), the
// theme, feedback and the Privacy and terms pages (#43) — one home for everything about "my account and my data".
// Troubleshooting (rev-3 O) holds the error page's two actions: Reload app, and Reset local data
// behind a confirm that says exactly what goes. Reset is never a loose button on a page.
import { useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
  AlertDialog,
  Avatar,
  Button,
  Dialog,
  Icon,
  Menu,
  Stack,
  Text,
} from '@hirobius/design-system';
import { useJobs } from '../store';
import { useDocuments } from '../documents';
import { clearLocalData } from '../localReset';
import { useColorMode } from '../ColorMode';
import { refocusAccount, useCloudSync, useDataTools } from './accountContext';
import { openDocuments, openLegal } from '../route';
import { useBackCloses } from '../useBackCloses';
import { openExportLinks } from '../exportLinks';
import {
  CompaniesDialog,
  ScanDetailsDialog,
  SearchProfileDialog,
  useLoadedWhen,
} from '../lazyDialogs';
import { openRecentlyRemoved } from '../jobDialogs';
import { useTrash } from '../trash';
import './sheet.css';
import { setReturnFocus } from './returnFocus';
import { motionPaused, setMotionPaused } from '../motionPref';
import { ExitButton } from '../hds-gaps/ExitButton';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenu() {
  const sync = useCloudSync();
  const { accountTrigger, setAccountTrigger } = sync;
  const data = useDataTools();
  const { mode, toggle } = useColorMode();
  const [resetting, setResetting] = useState(false);
  // Followed and Ignored companies (simplify Q6: the Companies tab's place).
  const [companies, setCompanies] = useState(false);
  useBackCloses(companies, () => setCompanies(false), 'companies');
  const companiesReady = useLoadedWhen(CompaniesDialog, companies, () => setCompanies(false));
  // Kept across this menu's own renders: the menu closes as the dialog takes focus, and redrawing
  // the list then held the dialog's first paint past 300 ms (#212).
  const companiesDialog = useMemo(
    () => <CompaniesDialog onCloseAutoFocus={refocusAccount(accountTrigger)} />,
    [accountTrigger],
  );
  // The Search profile (#388: Calibrate's and Manage track's place).
  const [profile, setProfile] = useState(false);
  useBackCloses(profile, () => setProfile(false), 'search-profile');
  const profileReady = useLoadedWhen(SearchProfileDialog, profile, () => setProfile(false));
  // Scan details (Adrian 2026-11-08): Find's freshness, source health and "not shown" counts.
  const [details, setDetails] = useState(false);
  useBackCloses(details, () => setDetails(false), 'scan-details');
  const detailsReady = useLoadedWhen(ScanDetailsDialog, details, () => setDetails(false));
  // Controlled, so the browser's Back closes the open menu instead of leaving the page.
  const [open, setOpen] = useState(false);

  useBackCloses(open, () => setOpen(false), 'account-menu');
  // Fetch the two lazy dialogs' chunks as the menu opens, so Companies and Search profile answer
  // within 300 ms of the press (#212) instead of waiting on the fetch. A failure is retried on
  // the item's press (useLoadedWhen), which closes the sheet and raises the reload notice.
  const openMenu = (next: boolean) => {
    if (next)
      for (const view of [CompaniesDialog, SearchProfileDialog]) view.preload().catch(() => {});
    setOpen(next);
  };
  useBackCloses(resetting, () => setResetting(false), 'reset-local-data');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** Run an item that opens a dialog; the dialog gives focus back to this trigger on close. */
  const opensDialog = (open: () => void) => () => {
    setReturnFocus(triggerRef.current);
    open();
  };
  // The trigger is the HDS Avatar (rev-3 P): your initial when signed in, a neutral person icon
  // when not. No unsynced dot (Adrian 2026-10-22): the menu's sync line says where data lives.
  const initial = sync.user?.email?.trim()[0]?.toUpperCase();
  // Recently removed moved here from the Jobs page (#416); shown only when there is something.
  const removed = useTrash().length;

  // Header lines are Menu.Labels (not focusable, not clickable). The email is plain text;
  // index.html's format-detection meta stops iOS turning it into a mailto link.
  return (
    <>
      {/* Non-modal, so a dialog opened from an item (sign-in, restore) takes focus cleanly. */}
      <Menu modal={false} open={open} onOpenChange={openMenu}>
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
                className="rjb-avatar"
              />
            }
            label="Account"
            className="rjb-account"
          />
        </Menu.Trigger>
        <Menu.Content align="end" className="rjb-account-menu">
          {/* The phone sheet's grab handle (theme/late.css); nothing on a wider screen. */}
          <span className="rjb-sheet-handle" aria-hidden="true" />
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
          {/* Documents (was Templates, #227) is a dialog over the page (#471 slice 4); it opens from
              here and the Apply sheet, and Back or Close returns to the page under it. */}
          <Menu.Item onSelect={() => openDocuments('')}>Documents</Menu.Item>
          <Menu.Item onSelect={opensDialog(() => setProfile(true))}>Search profile</Menu.Item>
          <Menu.Item onSelect={opensDialog(() => setCompanies(true))}>Companies</Menu.Item>
          <Menu.Item onSelect={opensDialog(() => setDetails(true))}>Scan details</Menu.Item>
          <Menu.Separator />
          {/* Data (account menu PR): everything that copies your data in or out, together. */}
          <Menu.Label>Data</Menu.Label>
          <Menu.Item onSelect={data.backup}>Back up</Menu.Item>
          <Menu.Item onSelect={opensDialog(data.chooseRestore)}>Restore…</Menu.Item>
          <Menu.Item onSelect={data.exportCsv} disabled={!data.canExport}>
            Export CSV
          </Menu.Item>
          <Menu.Item onSelect={() => openExportLinks('all')} disabled={!data.canExport}>
            Export links
          </Menu.Item>
          {/* Removed jobs come back from here: data, so it sits with the Data group. */}
          {removed > 0 && (
            <Menu.Item onSelect={opensDialog(openRecentlyRemoved)}>
              {`Recently removed (${removed})`}
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item onSelect={toggle}>{mode === 'dark' ? 'Light' : 'Dark'} theme</Menu.Item>
          {/* WCAG 2.2.2: the app bar's flame loops on; this stops it (motionPref.ts). */}
          {/* Read fresh each time the menu opens (its content renders only then), so another
              tab's choice or a system change shows here too (#516 review). */}
          <Menu.Item onSelect={() => setMotionPaused(!motionPaused())}>
            {motionPaused() ? 'Play animations' : 'Pause animations'}
          </Menu.Item>
          <Menu.Item onSelect={() => window.open(FEEDBACK_URL, '_blank', 'noopener')}>
            Send feedback
          </Menu.Item>
          <Menu.Item onSelect={() => openLegal('privacy')}>Privacy and terms</Menu.Item>
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
      <Dialog open={companies && companiesReady} onOpenChange={setCompanies}>
        {companies && companiesReady && companiesDialog}
      </Dialog>
      <Dialog open={details && detailsReady} onOpenChange={setDetails}>
        {details && detailsReady && (
          <ScanDetailsDialog onCloseAutoFocus={refocusAccount(accountTrigger)} />
        )}
      </Dialog>
      <Dialog open={profile && profileReady} onOpenChange={setProfile}>
        {profile && profileReady && (
          <SearchProfileDialog
            onDone={() => setProfile(false)}
            onCloseAutoFocus={refocusAccount(accountTrigger)}
          />
        )}
      </Dialog>
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
      {/* Placed like the other shell dialogs with a field (`.rjb-sheet`, sheet.css). */}
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

// The status reads "Synced · <email>"; the header already names the email, so drop it here.
function syncLine(status: string): string {
  return status.startsWith('Synced') ? 'Synced' : status;
}
