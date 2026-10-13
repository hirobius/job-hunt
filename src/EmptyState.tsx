// Shared empty state (21st.dev "empty state" pattern): a dashed, softly-sunken container with an
// icon medallion, a title, one line of guidance and up to two actions. Props stay back-compatible
// with the old text-only block, so every "nothing here" across the app upgrades at once.
import { Box, Stack, Typography } from './ui/box';
import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  message,
  action,
  secondaryAction,
  icon: Icon = Inbox,
  dense = false,
}: {
  title?: string;
  message: ReactNode;
  /** Primary action node (e.g. a Button) shown under the message. */
  action?: ReactNode;
  /** Optional second, lower-emphasis action rendered beside the primary one. */
  secondaryAction?: ReactNode;
  /** Lucide icon for the medallion. Defaults to an inbox. */
  icon?: LucideIcon;
  /** Tighter padding + smaller medallion for inline use within a section. */
  dense?: boolean;
}) {
  const size = dense ? 36 : 48;
  return (
    <Box
      role="status"
      sx={{
        textAlign: 'center',
        py: dense ? 2.5 : 5,
        px: 2,
        border: '1px dashed var(--semantic-color-border-default)',
        borderRadius: '12px',
        bgcolor: 'action.hover',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: size,
          height: size,
          mx: 'auto',
          mb: dense ? 1 : 1.5,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'primary.main',
          backgroundColor: 'color-mix(in srgb, var(--semantic-accent-rest) 14%, transparent)',
          boxShadow: '0 0 0 6px color-mix(in srgb, var(--semantic-accent-rest) 6%, transparent)',
        }}
      >
        <Icon size={dense ? 18 : 22} />
      </Box>
      {title && (
        <Typography
          variant="subtitle1"
          sx={{ color: 'text.primary', fontWeight: 600, mb: 0.5, lineHeight: 1.3 }}
        >
          {title}
        </Typography>
      )}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ maxWidth: 440, mx: 'auto', lineHeight: 1.5 }}
      >
        {message}
      </Typography>
      {(action || secondaryAction) && (
        <Stack
          direction="row"
          spacing={1}
          justifyContent="center"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: dense ? 1.5 : 2 }}
        >
          {action}
          {secondaryAction}
        </Stack>
      )}
    </Box>
  );
}
