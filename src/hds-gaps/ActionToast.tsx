// HDS gap: a toast with an action (Undo). HDS Toast takes a title and description only, so this
// is an HDS Card in a polite live region, placed like the toast viewport, that closes itself
// after `duration`. Ask: an `action` slot on HDS ToastOptions. Delete this when it lands.
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Box, Button, Card, Icon, Stack, Text } from '@hirobius/design-system';
import './ActionToast.css';

export default function ActionToast({
  message,
  actionLabel,
  onAction,
  onClose,
  duration = 8000,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);
  return (
    <Card className="action-toast" bordered padding="item" role="status" aria-live="polite">
      <Stack direction="row" gap="tight" align="center">
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Text variant="ui" as="span">
            {message}
          </Text>
        </Box>
        <Button size="sm" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={X} />}
          label="Dismiss"
          onClick={onClose}
        />
      </Stack>
    </Card>
  );
}
