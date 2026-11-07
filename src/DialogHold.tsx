// What a route dialog (Documents, Privacy and terms; #471 slice 4) shows while its lazy chunk loads:
// the dialog's own frame and title over the page, with Skeleton lines where its content will be. The
// title is the real one, so a screen reader names the dialog at once; Close, Escape and Back work.
import { Dialog, Skeleton, Stack, Text } from '@hirobius/design-system';
import { closeDialog } from './route';

export default function DialogHold({ title, size }: { title: string; size: 'lg' | 'xl' }) {
  return (
    <Dialog open={true} onOpenChange={(o) => !o && closeDialog()}>
      <Dialog.Content size={size} className="rjb-dialog" aria-describedby={undefined}>
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
        </Dialog.Header>
        <Stack gap="normal" aria-busy="true">
          <Text variant="ui" as="p" role="status" tone="secondary">
            Loading…
          </Text>
          <Stack gap="normal" aria-hidden="true">
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="rectangular" height={96} />
            <Skeleton variant="rectangular" height={96} />
          </Stack>
        </Stack>
      </Dialog.Content>
    </Dialog>
  );
}
