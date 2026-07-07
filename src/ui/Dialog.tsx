// Dialog adapter — preserves the MUI `Dialog / DialogTitle / DialogContent / DialogActions`
// shape on top of HDS's compound Radix Dialog, so the three dialog surfaces migrate by import
// swap (issue #11). Routable upstream as a "simple dialog" convenience over the primitive.
import { type ReactNode } from 'react';
import { Dialog as HDS } from '@hirobius/design-system';

const MAXW: Record<string, number> = { xs: 444, sm: 600, md: 900, lg: 1200 };

export function Dialog({
  open,
  onClose,
  children,
  maxWidth = 'sm',
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  maxWidth?: keyof typeof MAXW;
  fullWidth?: boolean;
}) {
  return (
    <HDS
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose?.();
      }}
    >
      <HDS.Content
        style={{ width: '100%', maxWidth: MAXW[maxWidth], maxHeight: '85vh', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>{children}</div>
      </HDS.Content>
    </HDS>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return (
    <HDS.Header>
      <HDS.Title>{children}</HDS.Title>
    </HDS.Header>
  );
}

export function DialogContent({
  children,
  dividers,
}: {
  children: ReactNode;
  dividers?: boolean;
}) {
  return (
    <div
      style={{
        overflowY: 'auto',
        padding: '16px 4px',
        ...(dividers
          ? {
              borderTop: '1px solid var(--semantic-color-border-default)',
              borderBottom: '1px solid var(--semantic-color-border-default)',
              margin: '8px 0',
            }
          : {}),
      }}
    >
      {children}
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <HDS.Footer>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {children}
      </div>
    </HDS.Footer>
  );
}
