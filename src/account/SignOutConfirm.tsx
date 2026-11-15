// "Sign out and lose recent changes?" (Adrian's phone, 2026-11-15): the HDS confirm that took the
// place of window.confirm when sign-out finds changes the cloud does not hold yet. Cancel (also
// Escape, Back, the scrim) is the safe answer: nothing is wiped. Its own chunk: most sign-outs
// never show it.
import { AlertDialog, Button } from '@hirobius/design-system';
import { useBackCloses } from '../useBackCloses';
import { ExitButton } from '../hds-gaps/ExitButton';
import { focusAsHeading, pageHeadingNow } from '../focusRescue';
import { SIGN_OUT_UNSYNCED } from '../cloudMessages';

/** The host unmounts the dialog with the answer: focus goes to the page's h1, never <body>. */
const thenToHeading = (answer: () => void) => () => {
  answer();
  setTimeout(() => {
    const h = pageHeadingNow();
    if (h) focusAsHeading(h);
  });
};

export default function SignOutConfirmDialog({
  onSignOut,
  onCancel,
}: {
  onSignOut: () => void;
  onCancel: () => void;
}) {
  useBackCloses(true, thenToHeading(onCancel), 'sign-out-confirm');
  return (
    <AlertDialog open={true} onOpenChange={(o) => !o && thenToHeading(onCancel)()}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{SIGN_OUT_UNSYNCED.title}</AlertDialog.Title>
          <AlertDialog.Description>{SIGN_OUT_UNSYNCED.description}</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <ExitButton onClick={thenToHeading(onCancel)}>{SIGN_OUT_UNSYNCED.cancel}</ExitButton>
          <Button variant="primary" tone="danger" onClick={onSignOut}>
            {SIGN_OUT_UNSYNCED.confirm}
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
