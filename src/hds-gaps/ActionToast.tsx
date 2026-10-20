// A toast with action buttons (Open, Undo). HDS `useToast` takes only title/description/tone — no
// action slot yet (hds#815, fix in hds#816). Built from HDS Card + Text + Button, pinned to
// the bottom of the viewport, announced politely, and dismissed after `duration` ms. Collapse into
// HDS Toast when it grows actions.
import { useEffect, type ReactNode } from 'react';
import { Box, Button, Card, Icon, Stack, Text } from '@hirobius/design-system';
import { X } from 'lucide-react';

export default function ActionToast({
  title,
  description,
  actions,
  onClose,
  duration = 8000,
}: {
  title: string;
  description?: string;
  actions: ReactNode;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [title, description, duration, onClose]);
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        // Inset keys take no t-shirt names (only spacing keys do): the token var itself.
        left: 0,
        right: 0,
        bottom: 'var(--semantic-space-scale-sm)',
        px: 'sm',
        zIndex: 50,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <Box sx={{ pointerEvents: 'auto', width: '100%', maxWidth: '30rem' }}>
        <Card bordered padding="none">
          <Box sx={{ p: 'sm' }}>
            <Stack direction="row" gap="tight" align="center" justify="space-between" wrap="wrap">
              <Box sx={{ minWidth: 0, flex: '1 1 10rem' }}>
                <Text variant="ui" as="p" weight="bold">
                  {title}
                </Text>
                {description && (
                  <Text variant="caption" as="p" tone="secondary">
                    {description}
                  </Text>
                )}
              </Box>
              <Stack direction="row" gap="tight" align="center">
                {actions}
                <Button
                  size="sm"
                  variant="tertiary"
                  iconOnly
                  iconLeft={<Icon icon={X} />}
                  label="Dismiss"
                  onClick={onClose}
                />
              </Stack>
            </Stack>
          </Box>
        </Card>
      </Box>
    </Box>
  );
}
