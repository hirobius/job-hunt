// Shared empty state: HDS `EmptyState` (title + muted description) plus what it does not carry
// yet — up to two actions under the message (21st.dev empty-state rule P1: the action that fills
// the screen is the primary button). Kept as a composition, not a local primitive, so it can
// collapse into the HDS component once that grows an action slot (hds#654).
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
  /** Accepted for existing call sites; HDS EmptyState has one density. */
  dense?: boolean;
}) {
  const empty = title ? (
    <HdsEmptyState title={title} description={message} />
  ) : (
    <HdsEmptyState title={message} />
  );
  if (!action && !secondaryAction) return empty;
  return (
    <Stack gap="tight" align="center">
      {empty}
      <Stack direction="row" gap="gap" align="center" justify="center" wrap="wrap">
        {action}
        {secondaryAction}
      </Stack>
    </Stack>
  );
}
