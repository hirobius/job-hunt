// A Badge with a leading 16px icon (redesign §3, #538): the amber deadline and follow-up badges.
// HDS Badge has `dot`, not an icon, so the icon goes in as a child. Delete this when HDS Badge
// takes an icon.
// hds-gap: hirobius/hds#1437 (G6: Badge with a leading icon)
import type { LucideIcon } from 'lucide-react';
import { Badge, Box, Icon } from '@hirobius/design-system';

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
      {/* Badge sets no gap between children: 4px (space.scale.2xs) between icon and text. */}
      <Box as="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        <Icon icon={icon} size="small" aria-hidden="true" />
        {children}
      </Box>
    </Badge>
  );
}
