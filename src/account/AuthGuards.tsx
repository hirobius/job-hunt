// The confirm that stops this device's data going into an account it has not synced with ("Add
// this device's 3 jobs to x@y.com?"; security audit). The other one, a sign-in link this browser pii-allow
// did not ask for ("Sign in as x@y.com?"), is LinkConfirmScreen (the sign-in layout). Closing either one is the safe answer: pii-allow
// the link is dropped, the data stays on this device only. Plain buttons (not Action/Cancel):
// each answer runs once, and Escape or Back is the safe one.
import { AlertDialog, Button } from '@hirobius/design-system';
import { useBackCloses } from '../useBackCloses';
import { focusAsHeading, pageHeadingNow } from '../focusRescue';

/** The dialog leaves with the answer (its host unmounts it), so no close-focus runs: once it has
 *  gone, focus goes to the page's own h1, never <body> (#516 review). */
const thenToHeading = (answer: () => void) => () => {
  answer();
  setTimeout(() => {
    const h = pageHeadingNow();
    if (h) focusAsHeading(h);
  });
};

export default function MergeConfirmDialog({
  question,
  onAdd,
  onKeep,
}: {
  question: string | null;
  onAdd: () => void;
  onKeep: () => void;
}) {
  const open = question !== null;
  useBackCloses(open, thenToHeading(onKeep), 'merge-confirm');
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && thenToHeading(onKeep)()}>
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
          <Button variant="secondary" onClick={thenToHeading(onKeep)}>
            Don't add
          </Button>
          <Button variant="primary" onClick={thenToHeading(onAdd)}>
            Add to account
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
