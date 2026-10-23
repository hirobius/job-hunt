// The starter messages are the user's to add (Adrian 2026-10-22: a first run holds nothing the user
// didn't create). One tap adds whichever starters are missing (restoreStarterOutreach: each under
// its own kind, never over one that is there), from Documents' empty state and from every flow that
// fills a message: the follow-up dialog, the Apply sheet and the Application kit's letters.
import { useContext } from 'react';
import { Button } from '@hirobius/design-system';
import { CloudSyncContext } from './account/accountContext';
import { addStarterMessages } from './addStarters';

export function AddStarterMessages({
  variant = 'secondary',
  size = 'md',
  onAdded,
}: {
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'sm' | 'md';
  /** Runs once they are added (the follow-up dialog refills its message from the starter). */
  onAdded?: () => void;
}) {
  // Wait for sync like Documents does: on a new device the user's own edited messages arrive first,
  // and a stock one must not replace them. Outside the provider (tests) it counts as settled.
  const settled = useContext(CloudSyncContext)?.settled ?? true;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={!settled}
      onClick={() => {
        addStarterMessages();
        onAdded?.();
      }}
    >
      Add starter messages
    </Button>
  );
}
