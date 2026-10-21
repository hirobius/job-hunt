// The header's account menu (#115 Phase 1): sync status + sign-in/out, Documents (#240, #227: no
// tab), the data controls that used to crowd the Tracker toolbar (back up, restore, export), the
// theme, feedback and the Privacy and terms pages (#43) — one home for everything about "my account and my data".
import { Avatar, Button, Menu } from '@hirobius/design-system';
import { useColorMode } from '../ColorMode';
import { useCloudSync, useDataTools } from './accountContext';
import { useUnsynced } from './useUnsynced';
import { navigate } from '../route';
import { LEGAL_ROUTE } from '../legal';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenu() {
  const sync = useCloudSync();
  const data = useDataTools();
  const unsynced = useUnsynced();
  const { mode, toggle } = useColorMode();
  // The trigger is the HDS Avatar (rev-3 P): your initial when signed in, a neutral person icon
  // when not, and a warning Badge dot while jobs are saved on this device only.
  const initial = sync.user?.email?.trim()[0]?.toUpperCase();
  const name = unsynced ? 'Account, not synced' : 'Account';

  // Header lines are Menu.Labels (not focusable, not clickable). The email is plain text;
  // index.html's format-detection meta stops iOS turning it into a mailto link.
  return (
    // Non-modal, so a dialog opened from an item (sign-in, restore) takes focus cleanly.
    <Menu modal={false}>
      <Menu.Trigger asChild>
        <Button
          variant="tertiary"
          iconOnly
          iconLeft={
            <Avatar
              size="sm"
              alt=""
              initials={initial}
              fallback={initial ? 'initials' : 'icon'}
              status={unsynced ? 'warning' : undefined}
            />
          }
          label={name}
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
            <Menu.Item onSelect={() => sync.setSignInOpen(true)}>Sign in to sync…</Menu.Item>
          </>
        )}
        <Menu.Separator />
        {/* Documents (was Templates, #227) has no tab (#240); it opens from here and the Apply sheet. */}
        <Menu.Item onSelect={() => navigate({ tab: 'copy-deck', sub: null, jobId: null })}>
          Documents
        </Menu.Item>
        <Menu.Item onSelect={data.backup}>Back up</Menu.Item>
        <Menu.Item onSelect={data.chooseRestore}>Restore…</Menu.Item>
        <Menu.Item onSelect={data.exportCsv} disabled={!data.canExport}>
          Export CSV
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item onSelect={toggle}>{mode === 'dark' ? 'Light' : 'Dark'} theme</Menu.Item>
        <Menu.Item onSelect={() => window.open(FEEDBACK_URL, '_blank', 'noopener')}>
          Send feedback
        </Menu.Item>
        <Menu.Item onSelect={() => navigate({ tab: LEGAL_ROUTE, sub: 'privacy', jobId: null })}>
          Privacy and terms
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
  );
}

// The status reads "Synced · <email>"; the header already names the email, so drop it here.
function syncLine(status: string): string {
  return status.startsWith('Synced') ? 'Synced' : status;
}
