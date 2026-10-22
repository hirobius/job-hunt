// The save notice's view (rapid apply), rendered once in the shell; the state is saveNotice.ts.
// An HDS Toast with up to two actions (Open, Undo; HDS 0.28, hds#815). One at a time: a new
// notice, or dismissNotice(), closes the one showing. A notice raised inside a modal dialog shows
// in that dialog instead (DialogNotice), where the keyboard and a screen reader can reach its Undo.
import { useEffect, useRef } from 'react';
import { Box, Button, Stack, Text, useToast, type ToastAction } from '@hirobius/design-system';
import { dismissNotice, useNotice } from './saveNotice';

export default function NoticeHost() {
  const n = useNotice();
  const { toast, dismiss } = useToast();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current) dismiss(shown.current);
    shown.current = null;
    if (!n || n.inDialog) return;
    const actions = n.actions.slice(0, 2).map((a): ToastAction => ({
      label: a.label,
      onSelect: () => {
        dismissNotice();
        a.run();
      },
    })) as unknown as readonly [ToastAction] | readonly [ToastAction, ToastAction];
    shown.current = toast({
      title: n.title,
      description: n.description,
      ...(n.tone ? { tone: n.tone } : {}),
      duration: 8000,
      ...(actions.length ? { actions } : {}),
    });
  }, [n, toast, dismiss]);
  return null;
}

/** The current notice, when a modal dialog raised it: its title and actions as one line in the
 *  dialog (a live region, so it is announced). Nothing otherwise. */
export function DialogNotice() {
  const n = useNotice();
  return (
    <Box role="status" sx={{ flex: 1, minWidth: 0 }}>
      {n?.inDialog && (
        <Stack direction="row" gap="tight" align="center" wrap="wrap">
          <Text variant="ui">{n.title}</Text>
          {n.actions.map((a) => (
            <Button
              key={a.label}
              variant="tertiary"
              size="sm"
              onClick={() => {
                dismissNotice();
                a.run();
              }}
            >
              {a.label}
            </Button>
          ))}
        </Stack>
      )}
    </Box>
  );
}
