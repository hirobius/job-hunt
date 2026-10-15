// First-run sync nudge (#115 Phase 1): signed out, one dismissible Callout offers sync. Once
// dismissed it never comes back on this device (sign-in stays in the account menu). Sign-out
// clears rjb_* keys, so the next person on a shared browser sees it again.
import { useState } from 'react';
import { Button, Callout, Icon, Stack, Text } from '@hirobius/design-system';
import { Cloud, X } from 'lucide-react';
import { useJobs } from '../store';
import { useCloudSync } from './accountContext';
import { SECONDARY } from '../hds-gaps/tone';

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
  // Nothing to sync yet → no nudge; the first-use screen keeps one call to action.
  const hasData = useJobs().length > 0;
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!authResolved || user || dismissed || !hasData) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* storage blocked: hidden for this visit only */
    }
  };

  // Banner hierarchy (21st.dev banner/announcement references): icon · message · one action
  // under the message · dismiss pinned top-right, so nothing competes with the page's own CTA.
  return (
    <Callout tone="accent" role="region" aria-label="Sync your data">
      <Stack direction="row" gap="tight" align="start">
        <span style={{ display: 'inline-flex', paddingTop: 'var(--primitive-space-1)' }}>
          <Icon icon={Cloud} />
        </span>
        <Stack gap="tight" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="ui" as="p" className="rjb-semibold">
            Sync across your devices
          </Text>
          <Text variant="caption" as="p" style={SECONDARY}>
            Your jobs are saved in this browser only. Sign in to keep them everywhere.
          </Text>
          <div>
            <Button size="sm" variant="secondary" onClick={() => setSignInOpen(true)}>
              Sign in
            </Button>
          </div>
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
    </Callout>
  );
}
