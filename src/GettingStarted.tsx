// The "Getting started" panel over the Pipeline's agenda (#132; on Today until #236; a panel with
// ticked rows since the rev-3 mock): three steps with ticks that show what is already true.
// Shown once there is a job of your own, until it is dismissed on this device.
import { useContext, useState } from 'react';
import { Square, SquareCheck, X } from 'lucide-react';
import { Button, Icon, Stack, Text, VisuallyHidden } from '@hirobius/design-system';
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
      {/* Ticks are computed, not clicked: display-only rows (rev-3), full-contrast text whether
          done or not. A disabled checkbox washed the labels out below AA and, at its 44px phone
          row, pushed the note ~35px under the label. */}
      <PanelRows label="Getting started steps">
        {items.map((it) => (
          <PanelRow key={it.id}>
            <Stack direction="row" gap="tight" align="start">
              <Icon icon={it.done ? SquareCheck : Square} aria-hidden />
              <Stack gap="px4">
                <Text variant="ui" as="span" weight="bold" tone="primary">
                  {it.label}
                  <VisuallyHidden>{it.done ? ', done' : ', not done'}</VisuallyHidden>
                </Text>
                <Text variant="caption" as="p" tone="secondary">
                  {it.note}
                </Text>
              </Stack>
            </Stack>
          </PanelRow>
        ))}
      </PanelRows>
    </Panel>
  );
}
