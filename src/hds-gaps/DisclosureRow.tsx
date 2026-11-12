// HDS Disclosure variant="row" without the jump (2026-11-12, a phone recording: the Copy into
// the form rows "Why this company" / "Cover note" and Daily picks' "Draft note" jumped on open and
// close). HDS 0.41's row variant animates the body's height from 0 while, in the same frame, its
// wrapper's gap snaps from 0 to 8px and the closed preview line is removed: two instant shifts under
// one animated one. Here the gap stays 0, the body carries its own top padding, and it opens at once
// (the chevron still turns). Upstream ask: docs/hds-upstream-asks-0.9.md "Disclosure row jump".
// hds-gap: hirobius/hds#1508 (Disclosure row opens without a jump)
import type { ComponentProps } from 'react';
import { Box, Disclosure } from '@hirobius/design-system';
import './DisclosureRow.css';

export function DisclosureRow(props: Omit<ComponentProps<typeof Disclosure>, 'variant'>) {
  return (
    <Box className="rjb-disclosure-row">
      <Disclosure {...props} variant="row" />
    </Box>
  );
}
