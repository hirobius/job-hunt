// The "Getting started" section over the Pipeline's agenda (#132; on Today until #236; a flat
// section, no card, since #241): three steps with checkboxes that show what is already true. Shown once there is a job of your own, until it
// is dismissed on this device.
import { useContext, useState } from 'react';
import { X } from 'lucide-react';
import { Box, Button, Checkbox, Icon, Stack, Text } from '@hirobius/design-system';
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
    <Box as="section" aria-label="Getting started">
      <Stack gap="tight">
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <Text variant="ui" as="h3" weight="bold">
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
    </Box>
  );
}
