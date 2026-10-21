// The save notice's view (rapid apply), rendered once in the shell; the state is saveNotice.ts.
// An HDS Toast with up to two actions (Open, Undo; HDS 0.28, hds#815). One at a time: a new
// notice, or dismissNotice(), closes the one showing.
import { useEffect, useRef } from 'react';
import { useToast, type ToastAction } from '@hirobius/design-system';
import { dismissNotice, useNotice } from './saveNotice';

export default function NoticeHost() {
  const n = useNotice();
  const { toast, dismiss } = useToast();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current) dismiss(shown.current);
    shown.current = null;
    if (!n) return;
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
