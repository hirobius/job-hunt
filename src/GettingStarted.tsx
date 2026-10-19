// The "Getting started" card over the Pipeline's agenda (#132; on Today until #236): three steps
// with checkboxes that show what is already true. Shown once there is a job of your own, until it
// is dismissed on this device.
import { useContext, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card, Checkbox, Icon, Stack, Text } from '@hirobius/design-system';
import { CloudSyncContext } from './account/accountContext';
import {
  dismissGettingStarted,
  gettingStartedItems,
  isGettingStartedDismissed,
} from './gettingStarted';
import type { Job } from './types';

export default function GettingStarted({ jobs }: { jobs: Job[] }) {
  const [dismissed, setDismissed] = useState(isGettingStartedDismissed);
  // Read the context directly: this view also renders on its own in tests, outside the provider.
  const signedIn = !!useContext(CloudSyncContext)?.user;
  const items = gettingStartedItems(jobs, signedIn);
  if (dismissed || !items[0].done) return null;
  return (
    <Card bordered role="region" aria-label="Getting started">
      <Stack gap="tight">
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <Text variant="ui" as="h3" className="rjb-semibold">
            Getting started
          </Text>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            iconLeft={<Icon icon={X} />}
            label="Dismiss"
            onClick={() => {
              setDismissed(true);
              dismissGettingStarted();
            }}
          />
        </Stack>
        {/* Ticks are computed, not clicked: the boxes are display-only. */}
        {items.map((it) => (
          <Checkbox key={it.id} label={it.label} checked={it.done} disabled onChange={() => {}} />
        ))}
      </Stack>
    </Card>
  );
}
