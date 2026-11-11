// A Badge with a leading 16px icon (redesign §3, #538): the amber deadline and follow-up badges.
// HDS Badge has `dot`, not an icon, so the icon goes in as a child. Delete this when HDS Badge
// takes an icon.
// hds-gap: hirobius/hds#1437 (G6: Badge with a leading icon)
import type { LucideIcon } from 'lucide-react';
import { Badge, Icon } from '@hirobius/design-system';

export function IconBadge({
  icon,
  tone = 'neutral',
  children,
}: {
  icon: LucideIcon;
  tone?: 'neutral' | 'warning';
  children: string;
}) {
  return (
    <Badge tone={tone}>
      <Icon icon={icon} size="small" aria-hidden="true" />
      {children}
    </Badge>
  );
}
