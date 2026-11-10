// HDS EmptyState with two gaps closed (docs/hds-upstream-asks-0.9.md):
//   - HDS 0.30 sets its title in italic (`hds-type-ui italic`). Rev-3 has no italic anywhere, so
//     every empty state here is `not-italic` (tailwind-merge in HDS's `cn` lets it win).
//   - HDS's empty state is a left-aligned typographic line with a bare icon. The rev-3 mock's
//     teaching empty (Pipeline, empty; filtered to nothing) is centred: an icon tile, a bold title,
//     one sentence and the actions in one centred column. `centered` draws that; `framed` also
//     puts it in one panel (a raised fill, no outline) when it sits loose on the page (not inside a Panel already).
//   - HDS's children sit gap-1 (4px) apart, so the actions crowd the sentence; centred empties put
//     16px more above the actions (rev-3: about 16-20px).
// Every app empty state imports this one, not HDS's, so the italic can't come back on a new screen.
// hds-gap: hirobius/hds#1441 (G10: the italic EmptyState title)
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

const NOT_ITALIC = 'not-italic';
const CENTERED = 'not-italic items-center text-center';

export function EmptyState({
  centered = false,
  framed = false,
  icon,
  title,
  titleId,
  className,
  ...rest
}: EmptyStateProps & {
  /** An id for the title, so focus can land on it (a list whose last row left). */
  titleId?: string;
  /** Centre it with an icon tile and a bold title (rev-3 teaching empty). */
  centered?: boolean;
  /** Also frame it in one panel (implies `centered`). */
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
            bgcolor: 'var(--semantic-color-surface-muted)',
            color: 'content.primary',
          }}
        >
          <Icon icon={icon} size="medium" />
        </Box>
      )}
      <HdsEmptyState
        {...rest}
        // HDS lays the children out with gap-1 (4px): the actions get 16px more under the sentence.
        action={rest.action ? <Box sx={{ pt: 'sm' }}>{rest.action}</Box> : undefined}
        title={
          <Text as="span" variant="body" weight="bold" tone="primary" id={titleId}>
            {title}
          </Text>
        }
        className={className ? `${CENTERED} ${className}` : CENTERED}
      />
    </Stack>
  );
  if (!framed) return body;
  return (
    <Card padding="none">
      <Box sx={{ px: 'md', py: 'lg' }}>{body}</Box>
    </Card>
  );
}
