// One-time "Today is home" notice (#128). Existing users opened on the Tracker for months; now
// they land on Today, so it says once where the list went. A first run (the shell's onboarding
// gate) marks it seen: a first run never had a Tracker to miss. Dismissed per device;
// sign-out clears rjb_* keys like the sync nudge's.
import { useState } from 'react';
import { Button, Callout, Icon, Stack, Text } from '@hirobius/design-system';
import { X } from 'lucide-react';
import { isTodayNoticeSeen, markTodayNoticeSeen } from './todayNoticeSeen';

export default function TodayNotice() {
  const [seen, setSeen] = useState(isTodayNoticeSeen);
  if (seen) return null;
  return (
    <Callout tone="info" role="region" aria-label="Tracker is now Pipeline">
      <Stack direction="row" gap="tight" align="start">
        <Text variant="ui" as="p" style={{ margin: 0, flex: 1, minWidth: 0 }}>
          <strong>Tracker is now Pipeline.</strong> Today is your new home: what's due, what's
          coming up and how it's going. Your full job list is one tab over.
        </Text>
        <Button
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={X} />}
          label="Dismiss"
          onClick={() => {
            setSeen(true);
            markTodayNoticeSeen();
          }}
        />
      </Stack>
    </Callout>
  );
}
