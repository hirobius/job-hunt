// The save notice's view (rapid apply), rendered once in the shell; the state is saveNotice.ts.
import { useCallback } from 'react';
import { Button } from '@hirobius/design-system';
import ActionToast from './hds-gaps/ActionToast';
import { dismissNotice, useNotice } from './saveNotice';

export default function NoticeHost() {
  const n = useNotice();
  const close = useCallback(() => dismissNotice(), []);
  if (!n) return null;
  return (
    <ActionToast
      key={n.id}
      title={n.title}
      description={n.description}
      onClose={close}
      actions={n.actions.map((a) => (
        <Button
          key={a.label}
          size="sm"
          variant="secondary"
          onClick={() => {
            dismissNotice();
            a.run();
          }}
        >
          {a.label}
        </Button>
      ))}
    />
  );
}
