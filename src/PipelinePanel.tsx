// One Pipeline panel (rev-3 mock, mobile slice 1): an HDS Card with a header (the section's name,
// its count as an HDS Badge, an optional trailing control) over padded content and hairline rows.
// Lists of things (companies, roles, openings, jobs, documents, the Apply sheet) are cards, not
// hairline rows (Adrian 2026-10-23): `CardList` of `ListCard`s.
// Getting started, To apply, Follow up, Next 7 days and Jobs all use it, so they read as one set.
import type { CSSProperties, ReactNode } from 'react';
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
    <Card as="section" aria-label={label} padding="none">
      <Box sx={{ px: 'md', pt: 'md', pb: children ? 'xs' : 'md' }}>
        <Stack direction="row" gap="px8" align="center" justify="space-between">
          <Stack gap="px4">
            <Stack direction="row" gap="px8" align="center">
              <Text variant="body" as="h3" weight="bold">
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
export function PanelRows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Box as="ul" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {children}
    </Box>
  );
}

export function PanelRow({
  children,
  as = 'li',
  flush = false,
  dense = false,
}: {
  children: ReactNode;
  as?: 'li' | 'div';
  /** No padding: the child (an HDS Card's parts) pads itself. */
  flush?: boolean;
  /** Less vertical padding: the child already stands 40px+ tall (an HDS Checkbox row). */
  dense?: boolean;
}) {
  return (
    <Box
      as={as}
      sx={{
        ...(flush ? { p: 0 } : dense ? { px: 'md', py: 'xs' } : { p: 'md' }),
        borderTop: 'thin solid',
        borderColor: 'border.default',
      }}
    >
      {children}
    </Box>
  );
}

/** A list as separate HDS Card surfaces, 8 apart (Adrian 2026-10-23: cards, not hairlines). Inset
 *  from the panel's edges like its header (`inset`), or flush inside something already padded. */
export function CardList({
  children,
  label,
  as = 'ul',
  inset = 'md',
  hidden,
  style,
}: {
  children: ReactNode;
  label?: string;
  as?: 'ul' | 'div';
  inset?: 'md' | 'sm' | 'none';
  /** aria-hidden, for a skeleton. */
  hidden?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Box
      as={as}
      aria-label={label}
      aria-hidden={hidden || undefined}
      className="rjb-cards"
      style={style}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        ...(inset === 'none' ? {} : { px: inset, pb: inset }),
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

/** One item of a CardList: an HDS Card, filled so it reads on the raised panel it sits in. */
export function ListCard({
  children,
  as = 'li',
  label,
  dense = false,
  flush = false,
}: {
  children: ReactNode;
  as?: 'li' | 'div' | 'article';
  label?: string;
  /** Less vertical padding: the child already stands 40px+ tall (an HDS Disclosure row). */
  dense?: boolean;
  /** No padding: the child (an HDS Card's parts) pads itself. */
  flush?: boolean;
}) {
  return (
    <Card as={as} aria-label={label} padding="none" className="rjb-card-inset">
      {flush ? children : <Box sx={{ px: 4, py: dense ? 1 : 3 }}>{children}</Box>}
    </Card>
  );
}
