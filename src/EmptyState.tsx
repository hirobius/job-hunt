// Shared empty-state block: a muted message with an optional action, centered. Replaces the
// ad-hoc plain-text "nothing here" lines so empties read consistently across views.
import { Box, Typography } from './ui/box';
import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  message,
  action,
  dense = false,
}: {
  title?: string;
  message: ReactNode;
  /** An action node (e.g. a Button) shown under the message. */
  action?: ReactNode;
  /** Tighter padding for inline use within a section. */
  dense?: boolean;
}) {
  return (
    <Box sx={{ textAlign: 'center', py: dense ? 2 : 4, px: 2 }}>
      {title && (
        <Typography variant="subtitle1" sx={{ color: 'text.primary', mb: 0.5 }}>
          {title}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  );
}
