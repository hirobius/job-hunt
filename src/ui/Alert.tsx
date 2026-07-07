// Alert adapter — maps MUI's `severity` + dismiss `onClose` onto HDS's tone-based Alert
// (which has neither), so the AI dialogs migrate by import swap (issue #11).
import { type ReactNode } from 'react';
import { Alert as HdsAlert, IconButton } from '@hirobius/design-system';
import { X } from 'lucide-react';
import { Box, type Sx } from './box';

const TONE = { error: 'danger', warning: 'warning', info: 'info', success: 'success' } as const;

export function Alert({
  severity = 'info',
  onClose,
  children,
  sx,
}: {
  severity?: keyof typeof TONE;
  onClose?: () => void;
  children: ReactNode;
  sx?: Sx;
}) {
  return (
    <Box sx={{ position: 'relative', ...sx }}>
      <HdsAlert tone={TONE[severity]}>{children}</HdsAlert>
      {onClose && (
        <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
          <IconButton size="sm" variant="tertiary" icon={X} label="Dismiss" onClick={onClose} />
        </Box>
      )}
    </Box>
  );
}
