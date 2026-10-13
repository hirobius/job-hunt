// First-run sync nudge (#115 Phase 1): signed out, one dismissible Callout offers sync. Once
// dismissed it never comes back on this device (sign-in stays in the account menu). Sign-out
// clears rjb_* keys, so the next person on a shared browser sees it again.
import { useState } from 'react';
import { Button, Callout, Icon, Stack, Text } from '@hirobius/design-system';
import { X } from 'lucide-react';
import { useCloudSync } from './accountContext';

const DISMISSED_KEY = 'rjb_sync_banner_hidden';

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function SyncNudge() {
  const { user, authResolved, setSignInOpen } = useCloudSync();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!authResolved || user || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* storage blocked: hidden for this visit only */
    }
  };

  return (
    <Callout tone="accent" role="region" aria-label="Sync your data">
      <Stack direction="row" gap="tight" align="center" justify="space-between">
        <Text variant="body" as="p" style={{ margin: 0, flex: 1, minWidth: 0 }}>
          Your data is saved in this browser. Sign in to sync it across your devices.
        </Text>
        <Stack direction="row" gap="tight" align="center">
          <Button size="sm" variant="secondary" onClick={() => setSignInOpen(true)}>
            Sign in
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            iconOnly
            iconLeft={<Icon icon={X} />}
            label="Dismiss"
            onClick={dismiss}
          />
        </Stack>
      </Stack>
    </Callout>
  );
}
