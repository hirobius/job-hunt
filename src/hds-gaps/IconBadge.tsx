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
      {/* HDS Badge trims its child to the text's cap height (`hds-cap-trim`). An inline-flex row
          takes its baseline from the icon, so the text sat 2px high and its top was cut. The text
          stays in the flow and the 16px icon sits beside it, centred on the line, out of the flow:
          16px + 4px (space.scale.2xs) of room on the left. */}
      <Box as="span" sx={{ position: 'relative', display: 'inline-block', pl: 5 }}>
        <Box
          as="span"
          sx={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
          }}
        >
          <Icon icon={icon} size="small" aria-hidden="true" />
        </Box>
        {children}
      </Box>
    </Badge>
  );
}
