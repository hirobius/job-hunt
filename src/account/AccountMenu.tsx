// The header's account menu (#115 Phase 1): sync status + sign-in/out, the data controls that
// used to crowd the Tracker toolbar (back up, restore, export), the theme and feedback — one
// home for everything about "my account and my data".
import { Button, Icon, Menu } from '@hirobius/design-system';
import { CircleUserRound } from 'lucide-react';
import { useColorMode } from '../ColorMode';
import { useDensity } from '../Density';
import { useCloudSync, useDataTools } from './accountContext';
import { useUnsynced } from './useUnsynced';
import { DANGER } from '../hds-gaps/tone';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenu() {
  const sync = useCloudSync();
  const data = useDataTools();
  const unsynced = useUnsynced();
  const { mode, toggle } = useColorMode();
  const { density, toggle: toggleDensity } = useDensity();

  // Header lines are Menu.Labels (not focusable, not clickable). The email is plain text;
  // index.html's format-detection meta stops iOS turning it into a mailto link.
  return (
    // Non-modal, so a dialog opened from an item (sign-in, restore) takes focus cleanly.
    <Menu modal={false}>
      <Menu.Trigger asChild>
        <Button
          variant="tertiary"
          size="sm"
          iconLeft={<Icon icon={CircleUserRound} />}
          title={unsynced ? 'Saved on this device only' : undefined}
        >
          Account
        </Button>
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
        <Menu.Item onSelect={data.backup}>Back up</Menu.Item>
        <Menu.Item onSelect={data.chooseRestore}>Restore…</Menu.Item>
        <Menu.Item onSelect={data.exportCsv} disabled={!data.canExport}>
          Export CSV
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item onSelect={toggle}>{mode === 'dark' ? 'Light' : 'Dark'} theme</Menu.Item>
        <Menu.Item onSelect={toggleDensity}>
          {density === 'compact' ? 'Comfortable' : 'Compact'} spacing
        </Menu.Item>
        <Menu.Item onSelect={() => window.open(FEEDBACK_URL, '_blank', 'noopener')}>
          Send feedback
        </Menu.Item>
        {sync.user && (
          <>
            <Menu.Separator />
            <Menu.Item onSelect={sync.signOut}>Sign out</Menu.Item>
            {/* HDS Menu.Item has no danger tone; the feedback token marks the destructive item. */}
            <Menu.Item onSelect={sync.deleteMyData} style={DANGER}>
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
