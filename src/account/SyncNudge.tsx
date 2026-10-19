// Sync nudge (#115 Phase 1, slimmed in #133): signed out, one dismissible one-line note over the
// Pipeline list offers sync (#236, was on Today; the other routes get no banner; the Account
// trigger's title says it). Once
// dismissed it never comes back on this device (sign-in stays in the account menu). Sign-out
// clears rjb_* keys, so the next person on a shared browser sees it again.
import { useState } from 'react';
import { Box, Button, Icon, Stack, Text } from '@hirobius/design-system';
import { Cloud, X } from 'lucide-react';
import { useCloudSync } from './accountContext';
import { useUnsynced } from './useUnsynced';

const DISMISSED_KEY = 'rjb_sync_banner_hidden';

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function SyncNudge() {
  const { setSignInOpen } = useCloudSync();
  // Nothing to sync yet → no nudge; the first-use screen keeps one call to action.
  const unsynced = useUnsynced();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!unsynced || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* storage blocked: hidden for this visit only */
    }
  };

  // One line: icon · message · Sign in · dismiss. It wraps under the message on a phone.
  return (
    <Box as="section" aria-label="Sync your data">
      <Stack direction="row" gap="px8" align="center" justify="space-between">
        <Stack
          direction="row"
          gap="px8"
          align="center"
          wrap="wrap"
          style={{ flex: 1, minWidth: 0 }}
        >
          <Stack direction="row" gap="px8" align="start" style={{ flex: '1 1 16rem', minWidth: 0 }}>
            <Box as="span" sx={{ display: 'inline-flex', pt: 1 }}>
              <Icon icon={Cloud} />
            </Box>
            <Text variant="ui" as="p">
              <span className="rjb-semibold">Saved in this browser only.</span> Sign in to keep your
              jobs on every device.
            </Text>
          </Stack>
          <Button size="sm" variant="secondary" onClick={() => setSignInOpen(true)}>
            Sign in
          </Button>
        </Stack>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={X} />}
          label="Dismiss"
          onClick={dismiss}
        />
      </Stack>
    </Box>
  );
}
