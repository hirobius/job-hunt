// Add job: the button. Its dialog is AddJobDialog (#551), a component of its own so other hosts
// open the same one. Used by the Apply list's header and empty state, the lg list column and the
// phone filter bar (#471).
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@hirobius/design-system';
import { AddJobDialog } from './AddJobDialog';

export default function AddJobButton({
  variant = 'secondary',
  size,
}: {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  // The dialog opens outside its Root, so it has no Trigger: remember which button opened it and
  // give focus back there on close (a11y pass).
  const opener = useRef<HTMLElement | null>(null);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        iconLeft={<Plus size={16} />}
        onClick={(e) => {
          opener.current = e.currentTarget;
          setOpen(true);
        }}
      >
        Add job
      </Button>
      <AddJobDialog open={open} onOpenChange={setOpen} opener={opener} />
    </>
  );
}
