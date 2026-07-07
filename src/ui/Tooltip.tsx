// Tooltip adapter — preserves the MUI `<Tooltip title=…>{trigger}</Tooltip>` call shape on
// top of HDS's compound HdsTooltip (Radix), so the ~dozen call sites migrate by import swap
// (issue #11). HdsTooltip bakes in its own Radix provider, so each instance is self-contained.
import { type ReactElement, type ReactNode } from 'react';
import { HdsTooltip } from '@hirobius/design-system';

export function Tooltip({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactElement;
}) {
  if (!title) return children;
  return (
    <HdsTooltip>
      <HdsTooltip.Trigger asChild>{children}</HdsTooltip.Trigger>
      <HdsTooltip.Content>{title}</HdsTooltip.Content>
    </HdsTooltip>
  );
}
