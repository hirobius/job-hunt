// The "Getting started" panel over the Pipeline's agenda (#132; on Today until #236; a panel with
// ticked rows since the rev-3 mock): three steps with checkboxes that show what is already true.
// Shown once there is a job of your own, until it is dismissed on this device.
import { useContext, useState } from 'react';
import { X } from 'lucide-react';
import { Box, Button, Checkbox, Icon, Stack, Text } from '@hirobius/design-system';
import { CloudSyncContext } from './account/accountContext';
import {
  dismissGettingStarted,
  gettingStartedItems,
  isGettingStartedDismissed,
} from './gettingStarted';
import { Panel, PanelRow, PanelRows } from './PipelinePanel';
import type { Job } from './types';

export default function GettingStarted({ jobs }: { jobs: Job[] }) {
  const [dismissed, setDismissed] = useState(isGettingStartedDismissed);
  // Read the context directly: this view also renders on its own in tests, outside the provider.
  const signedIn = !!useContext(CloudSyncContext)?.user;
  const items = gettingStartedItems(jobs, signedIn);
  if (dismissed || !items[0].done) return null;
  const done = items.filter((it) => it.done).length;
  return (
    <Panel
      label="Getting started"
      title="Getting started"
      badge={`${done} of ${items.length}`}
      trailing={
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
      }
    >
      {/* Ticks are computed, not clicked: the boxes are display-only. */}
      <PanelRows>
        {items.map((it) => (
          <PanelRow key={it.id}>
            <Stack gap="px4">
              <Checkbox label={it.label} checked={it.done} disabled onChange={() => {}} />
              {/* The note lines up under the label, past the box and its gap. */}
              <Box sx={{ pl: 'var(--primitive-space-6)' }}>
                <Text variant="caption" as="p" tone="secondary">
                  {it.note}
                </Text>
              </Box>
            </Stack>
          </PanelRow>
        ))}
      </PanelRows>
    </Panel>
  );
}
