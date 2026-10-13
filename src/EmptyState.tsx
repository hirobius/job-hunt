// Shared empty state: HDS `EmptyState` (title + muted description) plus what it does not carry
// yet — up to two actions under the message (the action that fills the screen is the primary
// one). Kept as a composition, not a local primitive, so it can collapse into the HDS component
// once that grows an action slot (hds#654).
import { EmptyState as HdsEmptyState, Stack } from '@hirobius/design-system';
import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  message,
  action,
  secondaryAction,
}: {
  title?: string;
  message: ReactNode;
  /** Primary action node (e.g. a Button) shown under the message. */
  action?: ReactNode;
  /** Optional lower-emphasis action beside the primary one. */
  secondaryAction?: ReactNode;
}) {
  const empty = title ? (
    <HdsEmptyState title={title} description={message} />
  ) : (
    <HdsEmptyState title={message} />
  );
  // Always the same centred column, with or without an action, so empties match within a view.
  return (
    <Stack gap="tight" align="center">
      {empty}
      {(action || secondaryAction) && (
        <Stack direction="row" gap="gap" align="center" justify="center" wrap="wrap">
          {action}
          {secondaryAction}
        </Stack>
      )}
    </Stack>
  );
}
