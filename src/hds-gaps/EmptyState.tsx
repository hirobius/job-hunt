// HDS EmptyState with two gaps closed (docs/hds-upstream-asks-0.9.md):
//   - HDS 0.30 sets its title in italic (`hds-type-ui italic`). Rev-3 has no italic anywhere, so
//     every empty state here is `not-italic` (tailwind-merge in HDS's `cn` lets it win).
//   - HDS's empty state is a left-aligned typographic line with a bare icon. The rev-3 mock's
//     teaching empty (Pipeline, empty; filtered to nothing) is centred: an icon tile, a bold title,
//     one sentence and the actions in one centred column. `centered` draws that; `framed` also
//     puts it on one filled card (no outline, roomy) when it sits loose on the page.
// Every app empty state imports this one, not HDS's, so the italic can't come back on a new screen.
import type { ReactNode } from 'react';
import {
  Box,
  Card,
  EmptyState as HdsEmptyState,
  Icon,
  Stack,
  Text,
  type EmptyStateProps,
} from '@hirobius/design-system';
import { useCardPadding } from '../cardPadding';

const NOT_ITALIC = 'not-italic';
const CENTERED = 'not-italic items-center text-center';

export function EmptyState({
  centered = false,
  framed = false,
  icon,
  title,
  className,
  ...rest
}: EmptyStateProps & {
  /** Centre it with an icon tile and a bold title (rev-3 teaching empty). */
  centered?: boolean;
  /** Also set it on one filled card (implies `centered`). */
  framed?: boolean;
}) {
  if (!centered && !framed)
    return (
      <HdsEmptyState
        {...rest}
        icon={icon}
        title={title}
        className={className ? `${NOT_ITALIC} ${className}` : NOT_ITALIC}
      />
    );
  const body: ReactNode = (
    <Stack gap="xs" align="center">
      {icon && (
        <Box
          aria-hidden="true"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 'var(--primitive-space-10)',
            height: 'var(--primitive-space-10)',
            borderRadius: 'md',
            // A step off what it sits on: overlay on a card, a raised tile on the canvas.
            bgcolor: framed ? 'surface.overlay' : 'surface.raised',
            color: 'content.primary',
          }}
        >
          <Icon icon={icon} size="medium" />
        </Box>
      )}
      <HdsEmptyState
        {...rest}
        title={
          <Text as="span" variant="body" className="rjb-semibold" tone="primary">
            {title}
          </Text>
        }
        className={className ? `${CENTERED} ${className}` : CENTERED}
      />
    </Stack>
  );
  if (!framed) return body;
  return <FramedCard>{body}</FramedCard>;
}

function FramedCard({ children }: { children: ReactNode }) {
  const padding = useCardPadding();
  return (
    <Card padding={padding} className="border-0">
      <Box sx={{ py: 'fixed-sm' }}>{children}</Box>
    </Card>
  );
}
