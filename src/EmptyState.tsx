// Shared empty state: HDS `EmptyState` (title + muted description) plus the one thing it does not
// carry yet — an optional action under the message, which the teaching empties use ("Add roles",
// "Manage this track"). Kept as a composition, not a local primitive, so it can collapse into the
// HDS component once that grows an action slot.
import { EmptyState as HdsEmptyState, Stack } from '@hirobius/design-system';
import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  message,
  action,
}: {
  title?: string;
  message: ReactNode;
  /** An action node (e.g. a Button) shown under the message. */
  action?: ReactNode;
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
      {action}
    </Stack>
  );
}
