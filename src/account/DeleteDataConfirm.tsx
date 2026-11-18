// "Delete all your data?" (#793, Adrian 2026-11-18): the HDS confirm that took the place of
// window.confirm before Delete my data, the last browser dialog on the way to a person's data.
// Cancel has focus as it opens, and Cancel, Escape, Back and the scrim all delete nothing. Its own
// chunk: it shows only on this one press.
import { useRef } from 'react';
import { AlertDialog, Button } from '@hirobius/design-system';
import { useBackCloses } from '../useBackCloses';
import { ExitButton } from '../hds-gaps/ExitButton';
import { focusAsHeading, pageHeadingNow } from '../focusRescue';
import { DELETE_MY_DATA } from '../cloudMessages';

/** The host unmounts the dialog with the answer: focus goes to the page's h1, never <body>. */
const thenToHeading = (answer: () => void) => () => {
  answer();
  setTimeout(() => {
    const h = pageHeadingNow();
    if (h) focusAsHeading(h);
  });
};

export default function DeleteDataConfirmDialog({
  onDelete,
  onCancel,
}: {
  onDelete: () => void;
  onCancel: () => void;
}) {
  useBackCloses(true, thenToHeading(onCancel), 'delete-data-confirm');
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog open={true} onOpenChange={(o) => !o && thenToHeading(onCancel)()}>
      <AlertDialog.Content
        // Cancel takes focus as the dialog opens, so Enter deletes nothing.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancel.current?.focus();
        }}
      >
        <AlertDialog.Header>
          <AlertDialog.Title>{DELETE_MY_DATA.title}</AlertDialog.Title>
          <AlertDialog.Description>{DELETE_MY_DATA.description}</AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <ExitButton ref={cancel} onClick={thenToHeading(onCancel)}>
            {DELETE_MY_DATA.cancel}
          </ExitButton>
          <Button variant="primary" tone="danger" onClick={onDelete}>
            {DELETE_MY_DATA.confirm}
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
}
