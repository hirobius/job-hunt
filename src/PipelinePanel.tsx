// One Pipeline panel (rev-3 mock, mobile slice 1): an HDS Card with a header (the section's name,
// its count as an HDS Badge, an optional trailing control) over padded content and hairline rows.
// Getting started, To apply, Follow up, Next 7 days and Jobs all use it, so they read as one set.
import type { ReactNode } from 'react';
import { Badge, Box, Card, Stack, Text } from '@hirobius/design-system';

export function Panel({
  label,
  title,
  count,
  countLabel,
  badge,
  trailing,
  description,
  children,
}: {
  /** The region's accessible name. */
  label: string;
  title: string;
  /** Shown as a neutral count Badge beside the title. */
  count?: number;
  /** Names the count for assistive tech ("3 jobs"). */
  countLabel?: string;
  /** A text badge in place of a count ("1 of 3"). */
  badge?: string;
  trailing?: ReactNode;
  /** A caption under the title ("Sent: Cover letter, Oct 9"). */
  description?: string;
  children?: ReactNode;
}) {
  return (
    <Card as="section" aria-label={label} padding="none" bordered>
      <Box sx={{ px: 'md', pt: 'md', pb: children ? 'xs' : 'md' }}>
        <Stack direction="row" gap="px8" align="center" justify="space-between">
          <Stack gap="px4">
            <Stack direction="row" gap="px8" align="center">
              <Text variant="body" as="h3" className="rjb-bold">
                {title}
              </Text>
              {count != null && <Badge count={count} label={countLabel} />}
              {badge && <Badge>{badge}</Badge>}
            </Stack>
            {description && (
              <Text variant="caption" as="p" tone="secondary">
                {description}
              </Text>
            )}
          </Stack>
          {trailing}
        </Stack>
      </Box>
      {children}
    </Card>
  );
}

/** Padded content under a panel's header. */
export function PanelBody({ children }: { children: ReactNode }) {
  return <Box sx={{ px: 'md', pb: 'md' }}>{children}</Box>;
}

/** A panel's list: rows split by hairlines, each padded like the header. */
export function PanelRows({ children }: { children: ReactNode }) {
  return (
    <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {children}
    </Box>
  );
}

export function PanelRow({
  children,
  as = 'li',
  flush = false,
}: {
  children: ReactNode;
  as?: 'li' | 'div';
  /** No padding: the child (an HDS Card's parts) pads itself. */
  flush?: boolean;
}) {
  return (
    <Box
      as={as}
      sx={{ p: flush ? 0 : 'md', borderTop: 'thin solid', borderColor: 'border.default' }}
    >
      {children}
    </Box>
  );
}
