// The two confirms that stop a login injection (security audit): a sign-in link this browser did
// not ask for ("Sign in as x@y.com?"), and this device's data going into an account it has not
// synced with ("Add this device's 3 jobs to x@y.com?"). Closing either one is the safe answer:
// the link is dropped, the data stays on this device only. Plain buttons (not Action/Cancel):
// each answer runs once, and Escape or Back is the safe one.
import { AlertDialog, Button } from '@hirobius/design-system';
import { useBackCloses } from '../useBackCloses';

export function LinkConfirmDialog({
  email,
  onSignIn,
  onCancel,
}: {
  email: string | null;
  onSignIn: () => void;
  onCancel: () => void;
}) {
  const open = email !== null;
  useBackCloses(open, onCancel, 'auth-link-confirm');
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Sign in as {email}?</AlertDialog.Title>
          <AlertDialog.Description>
            This link signs this browser in to that account. Only continue if you asked for it.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSignIn}>
            Sign in
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}

export function MergeConfirmDialog({
  question,
  onAdd,
  onKeep,
}: {
  question: string | null;
  onAdd: () => void;
  onKeep: () => void;
}) {
  const open = question !== null;
  useBackCloses(open, onKeep, 'merge-confirm');
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onKeep()}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{question}</AlertDialog.Title>
          <AlertDialog.Description>
            This account has not synced with this device before. Add copies this device's jobs,
            notes, kit and documents into it. Don't add signs out and keeps them on this device
            only.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <Button variant="secondary" onClick={onKeep}>
            Don't add
          </Button>
          <Button variant="primary" onClick={onAdd}>
            Add to account
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
