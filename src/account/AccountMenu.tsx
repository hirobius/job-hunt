// The header's account menu (#115 Phase 1): sync status + sign-in/out, the data controls that
// used to crowd the Tracker toolbar (back up, restore, export), the theme and feedback — one
// home for everything about "my account and my data".
import { Button, Icon, Menu } from '@hirobius/design-system';
import { CircleUserRound } from 'lucide-react';
import { useColorMode } from '../ColorMode';
import { useDensity } from '../Density';
import { useCloudSync, useDataTools } from './accountContext';

const FEEDBACK_URL = 'https://github.com/hirobius/job-hunt/issues/new';

export default function AccountMenu() {
  const sync = useCloudSync();
  const data = useDataTools();
  const { mode, toggle } = useColorMode();
  const { density, toggle: toggleDensity } = useDensity();

  return (
    // Non-modal, so a dialog opened from an item (sign-in, restore) takes focus cleanly.
    <Menu modal={false}>
      <Menu.Trigger asChild>
        <Button variant="tertiary" size="sm" iconLeft={<Icon icon={CircleUserRound} />}>
          Account
        </Button>
      </Menu.Trigger>
      <Menu.Content align="end">
        <Menu.Label>{sync.user ? sync.status : 'Saved on this device only'}</Menu.Label>
        {sync.user ? (
          <>
            {sync.offline && <Menu.Item onSelect={sync.retry}>Retry sync</Menu.Item>}
            <Menu.Item onSelect={sync.signOut}>Sign out</Menu.Item>
            <Menu.Item onSelect={sync.deleteMyData}>Delete my data</Menu.Item>
          </>
        ) : (
          <Menu.Item onSelect={() => sync.setSignInOpen(true)}>Sign in to sync…</Menu.Item>
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
      </Menu.Content>
    </Menu>
  );
}
