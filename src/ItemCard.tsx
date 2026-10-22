// The lead layout of an item card (roomy layout, after the reference board Adrian sent 2026-10-22):
// a round initial, the item's text, and its actions. Job cards, follow-ups and events, company
// cards and postings share it. On a phone the actions sit on their own row under the text; from md
// they sit on the right, centred against the card. The card itself (a borderless HDS Card with
// useCardPadding) is the caller's, so it can be an article, a list item or a link.
import type { ReactNode } from 'react';
import { Avatar, Box, Stack, useAtLeast } from '@hirobius/design-system';
import { initialOf } from './initialOf';

export default function ItemCard({
  avatar,
  actions,
  children,
}: {
  /** The name the round initial is taken from (a company, else the title). No avatar when unset. */
  avatar?: string;
  /** The card's actions: its one next step and its menu. */
  actions?: ReactNode;
  /** The text column: badges, title, company, facts. */
  children: ReactNode;
}) {
  const md = useAtLeast('md');
  const initial = avatar ? initialOf(avatar) : '';
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { base: 'column', md: 'row' },
        alignItems: { base: 'stretch', md: 'center' },
        gap: { base: 'fixed-xs', md: 'fixed-md' },
      }}
    >
      <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
        <Stack direction="row" gap={md ? 'px16' : 'medium'} align="start">
          {initial && (
            // Decorative: the name is right beside it.
            <Avatar size={md ? 'lg' : 'sm'} alt="" initials={initial} className="rjb-item-avatar" />
          )}
          <Box sx={{ minWidth: 0, flex: '1 1 0%' }}>{children}</Box>
        </Stack>
      </Box>
      {actions && (
        <Stack direction="row" gap="gap" align="center" justify={md ? 'end' : 'space-between'}>
          {actions}
        </Stack>
      )}
    </Box>
  );
}
