// Sheet: the v1 prototype's bottom sheet, built on HDS Dialog (focus trap, Escape, scrim, portal)
// because HDS has no Sheet/Drawer yet (HDS gap, see docs/design/v1-build-spec.md). On phones it
// docks to the bottom edge with a grab handle; from 640px it is HDS's centred dialog. Styling is
// token-only, in src/theme/base.css (`.app-sheet`). API mirrors HDS Dialog: controlled `open` /
// `onOpenChange`, a required `title`, an optional `description`, children, and a `footer` slot.
import type { ReactNode } from 'react';
import { Button, Dialog, Stack, Text } from '@hirobius/design-system';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions pinned under the content (e.g. Cancel + Save). */
  footer?: ReactNode;
}

export function Sheet({ open, onOpenChange, title, description, children, footer }: SheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="app-sheet">
        <div className="app-sheet-grab" aria-hidden="true" />
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          {description ? <Dialog.Description>{description}</Dialog.Description> : null}
        </Dialog.Header>
        {children}
        {footer ? <Dialog.Footer>{footer}</Dialog.Footer> : null}
      </Dialog.Content>
    </Dialog>
  );
}

export interface SheetMenuItem {
  label: ReactNode;
  onSelect: () => void;
  /** Marks the current choice (sort, status, track). */
  selected?: boolean;
  tone?: 'danger';
}

/** A list of full-width actions inside a Sheet — the v1 replacement for small dropdown menus. */
export function SheetMenu({ items, label }: { items: SheetMenuItem[]; label: string }) {
  return (
    <Stack as="ul" gap="xs" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((it, i) => (
        <li key={i}>
          <Button
            variant="tertiary"
            className="app-sheet-item"
            data-tone={it.tone}
            aria-current={it.selected ? 'true' : undefined}
            onClick={it.onSelect}
          >
            <Text variant="body" as="span" style={{ color: 'inherit' }}>
              {it.label}
            </Text>
            {it.selected ? (
              <Text variant="caption" as="span" style={{ color: 'inherit' }}>
                Current
              </Text>
            ) : null}
          </Button>
        </li>
      ))}
    </Stack>
  );
}
