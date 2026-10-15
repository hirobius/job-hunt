// Shared empty state: HDS `EmptyState` (title + muted description) plus the two things it does not
// carry yet: an optional icon above the title and an optional action under the message (hds#654).
// One pattern for every teaching empty (#132): icon (optional), title (what this will hold), one
// sentence (what to do), one primary action, at most one quiet secondary. Kept as a composition,
// not a local primitive, so it can collapse into the HDS component once that grows the slots.
import { EmptyState as HdsEmptyState, Icon, Stack } from '@hirobius/design-system';
import type { ComponentProps, ReactNode } from 'react';

export default function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title?: string;
  message: ReactNode;
  /** An action node (e.g. a Button, or a row of two) shown under the message. */
  action?: ReactNode;
  /** An icon (a lucide component) shown above the title. */
  icon?: ComponentProps<typeof Icon>['icon'];
}) {
  const empty = title ? (
    <HdsEmptyState title={title} description={message} />
  ) : (
    <HdsEmptyState title={message} />
  );
  // Always the same centred column, with or without an icon or action, so empties match within a view.
  return (
    <Stack gap="tight" align="center">
      {icon && <Icon icon={icon} />}
      {empty}
      {action}
    </Stack>
  );
}
