// One section of a page (roomy layout, Adrian 2026-10-22: "wayyyyyy less outlines", generous inner
// padding). Every section has one form: a label on the page canvas (its name, its count as an HDS
// Badge, an optional trailing control and caption), then its content on filled surfaces, never in
// a stroke:
//   - kind="block": one borderless HDS Card around the content (a form, a short list of tray rows);
//   - kind="list":  a list of item cards on the canvas, each its own borderless Card.
// Cards never sit inside cards and no list inside a card uses rules: rows in a block are told
// apart by space. 21 views use it, so the outline rule lives here.
import { createContext, useContext, type ReactNode } from 'react';
import { Badge, Box, Card, Stack, Text } from '@hirobius/design-system';
import { useCardPadding } from './cardPadding';

export type PanelKind = 'block' | 'list';
const KindContext = createContext<PanelKind>('block');

export function Panel({
  label,
  title,
  count,
  countLabel,
  badge,
  trailing,
  description,
  kind = 'block',
  busy = false,
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
  description?: ReactNode;
  /** `block` (default): the content on one card. `list`: item cards (PanelRow) on the canvas. */
  kind?: PanelKind;
  /** Marks the section busy while its content loads. */
  busy?: boolean;
  children?: ReactNode;
}) {
  const padding = useCardPadding();
  return (
    <Box as="section" aria-label={label} aria-busy={busy || undefined}>
      <KindContext.Provider value={kind}>
        {/* 16 from the label to its content (roomy rhythm step 4). */}
        <Stack gap="px16">
          {/* The label row (name, count, trailing control), then its caption at full width, 4
              under it, so a phone's caption never squeezes beside the control. */}
          <Stack gap="px4">
            <Stack direction="row" gap="px8" align="center" justify="space-between">
              <Stack direction="row" gap="px8" align="center">
                <Text variant="ui" as="h3" className="rjb-semibold">
                  {title}
                </Text>
                {count != null && <Badge count={count} label={countLabel} />}
                {badge && <Badge>{badge}</Badge>}
              </Stack>
              {trailing}
            </Stack>
            {description &&
              (typeof description === 'string' ? (
                <Text variant="caption" as="p" tone="secondary">
                  {description}
                </Text>
              ) : (
                // Lines of their own (a status, several captions): a block, not a paragraph.
                <Text variant="caption" as="div" tone="secondary">
                  {description}
                </Text>
              ))}
          </Stack>
          {children != null &&
            children !== false &&
            (kind === 'block' ? (
              <Card padding={padding} className="border-0">
                {children}
              </Card>
            ) : (
              children
            ))}
        </Stack>
      </KindContext.Provider>
    </Box>
  );
}

/** Content under a section's label: inside a block the card pads it; in a list it sits on the
 *  canvas (a toolbar, a caption). */
export function PanelBody({ children }: { children: ReactNode }) {
  return <Box>{children}</Box>;
}

/** A section's list. In a list section: item cards, 20 apart on a phone and 28 from sm (inner
 *  padding never more than the gap between cards). In a block: tray rows, 8 apart, no rules. */
export function PanelRows({ children, label }: { children: ReactNode; label?: string }) {
  const kind = useContext(KindContext);
  return (
    <Box
      as="ul"
      aria-label={label}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: kind === 'list' ? { base: 'sm', sm: 'md' } : 'xs',
      }}
    >
      {children}
    </Box>
  );
}

/** One row. In a list section, an item card; in a block, a tray row 48 tall at least, with no
 *  padding or rule of its own. `flush`: a bare item whose child is its own card (a job card). */
export function PanelRow({
  children,
  as = 'li',
  flush = false,
}: {
  children: ReactNode;
  as?: 'li' | 'div';
  flush?: boolean;
}) {
  const kind = useContext(KindContext);
  const padding = useCardPadding();
  if (flush) return <Box as={as}>{children}</Box>;
  if (kind === 'list')
    return (
      <Card as={as} padding={padding} className="border-0">
        {children}
      </Card>
    );
  return (
    <Box
      as={as}
      sx={{
        minHeight: 'var(--semantic-size-row-comfortable)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {children}
    </Box>
  );
}
