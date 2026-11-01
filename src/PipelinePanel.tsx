// One Pipeline panel (rev-3 mock, mobile slice 1): an HDS Card with a header (the section's name,
// its count as an HDS Badge, an optional trailing control) over padded content and hairline rows.
// No cards within cards, ever (Adrian 2026-11-01, #449): a list inside a panel is rows in the
// panel's flow, split by spacing and a hairline (`ItemList` of `ItemRow`s), never a Card per item.
// `flat` drops the panel's own surface: the heading, count and metadata declare the group (Review new).
// Getting started, To apply, Follow up, Next 7 days and Jobs all use it, so they read as one set.
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { Badge, Box, Card, Stack, Text } from '@hirobius/design-system';

/** Inside a flat panel, content lines up with the page gutter instead of a card's inset. */
const FlatPanel = createContext(false);

export function Panel({
  label,
  title,
  count,
  countLabel,
  badge,
  trailing,
  description,
  flat = false,
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
  /** No card: a plain section in the page flow, declared by its heading (#449). */
  flat?: boolean;
  children?: ReactNode;
}) {
  const body = (
    <>
      <Box sx={{ px: flat ? 0 : 'md', pt: flat ? 0 : 'md', pb: children ? 'xs' : 'md' }}>
        <Stack direction="row" gap="px8" align="center" justify="space-between">
          <Stack gap="px4">
            <Stack direction="row" gap="px8" align="center">
              <Text variant="body" as="h2" weight="bold">
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
    </>
  );
  return flat ? (
    <FlatPanel.Provider value>
      <Box as="section" aria-label={label}>
        {body}
      </Box>
    </FlatPanel.Provider>
  ) : (
    <Card as="section" aria-label={label} padding="none">
      {body}
    </Card>
  );
}

/** Padded content under a panel's header. */
export function PanelBody({ children }: { children: ReactNode }) {
  const flat = useContext(FlatPanel);
  return <Box sx={{ px: flat ? 0 : 'md', pb: 'md' }}>{children}</Box>;
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

/** A list of things inside a panel (#449: no cards within cards): rows in the panel's flow, a
 *  hairline between them (`.rjb-items` in base.css). Inset from the panel's edges like its header
 *  (`inset`), or flush inside something already padded. */
export function ItemList({
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
  const flat = useContext(FlatPanel);
  const pad = flat ? 'none' : inset;
  return (
    <Box
      as={as}
      aria-label={label}
      aria-hidden={hidden || undefined}
      className="rjb-items"
      style={style}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        ...(pad === 'none' ? {} : { px: pad, pb: pad }),
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </Box>
  );
}

/** One item of an ItemList: a plain row, never a Card (#449). */
export function ItemRow({
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
  /** No padding: the child pads itself. */
  flush?: boolean;
}) {
  return (
    <Box as={as} aria-label={label} sx={flush ? {} : { py: dense ? 1 : 3 }}>
      {children}
    </Box>
  );
}
