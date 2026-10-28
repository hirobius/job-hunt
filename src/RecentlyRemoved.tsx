// Recently removed (src/trash.ts) in the UI: the quiet link under the Pipeline list that opens
// the list of removed jobs, each with its posting link, Restore and Delete forever. The Undo after
// a Remove is a save notice (saveNotice.removeWithUndo), so it never stacks with another notice.
// Delete forever has its own Undo (#212), shown in the dialog's footer while it is open
// (DialogNotice) and in the toast once it closes.
import { useEffect } from 'react';
import { Box, Button, Dialog, Stack, Text } from '@hirobius/design-system';
import { titleOf } from './jobRow';
import { metaLines } from './metaLines';
import { deleteForever, TRASH_DAYS, useTrash, type Removed } from './trash';
import { noticeToToast, notifyRemoved, restoreWithNotice } from './saveNotice';
import { DialogNotice } from './NoticeHost';
import { JobPostingTitle } from './PostingLink';
import { useBackSheet } from './useBackCloses';

const daysAgo = (iso: string, now = Date.now()) => {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'Removed today' : `Removed ${d}d ago`;
};

function RemovedRow({ entry }: { entry: Removed }) {
  const title = titleOf(entry.job);
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="space-between">
      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* A removed job has no page, but its posting is still one tap away. */}
        <JobPostingTitle job={entry.job}>
          <Text variant="ui" as="span" className="rjb-semibold">
            {title}
          </Text>
        </JobPostingTitle>
        {metaLines([entry.job.company, daysAgo(entry.removedAt)]).map((line) => (
          <Text key={line} variant="caption" as="span" tone="secondary">
            {line}
          </Text>
        ))}
      </Box>
      <Stack direction="row" gap="tight">
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Restore: ${title}`}
          onClick={() => restoreWithNotice(entry.job.url, { inDialog: true })}
        >
          Restore
        </Button>
        <Button
          size="sm"
          variant="secondary"
          tone="danger"
          aria-label={`Delete forever: ${title}`}
          onClick={() => {
            const undo = deleteForever(entry.job.url);
            notifyRemoved(`Deleted “${title}” for good`, undo, undefined, { inDialog: true });
          }}
        >
          Delete forever
        </Button>
      </Stack>
    </Stack>
  );
}

/** The quiet link under the Pipeline list; nothing when the trash is empty. */
export function RecentlyRemovedLink() {
  const trash = useTrash();
  // The browser's Back closes it (return paths); emptied (the last one restored or deleted), it
  // closes too, so its entry goes with it.
  const sheet = useBackSheet('recently-removed');
  const empty = trash.length === 0;
  const { onOpenChange, open } = sheet;
  useEffect(() => {
    if (empty) onOpenChange(false);
  }, [empty, onOpenChange]);
  // Closed (or gone): an Undo it was showing moves to the toast, so it stays in reach.
  useEffect(() => {
    if (!open) noticeToToast();
    return noticeToToast;
  }, [open]);
  if (empty) return null;
  return (
    <Dialog {...sheet}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="tertiary">
          {`Recently removed (${trash.length})`}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Recently removed</Dialog.Title>
          <Dialog.Description>
            {`Removed jobs stay here for ${TRASH_DAYS} days, with their notes, to-dos and interviews.`}
          </Dialog.Description>
        </Dialog.Header>
        <Stack gap="normal">
          {trash.map((r) => (
            <RemovedRow key={r.job.url} entry={r} />
          ))}
        </Stack>
        <Dialog.Footer>
          <DialogNotice />
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
