// Recently removed (src/trash.ts) in the UI: the quiet link under the Pipeline list that opens
// the list of removed jobs, each with its posting link, Restore and Delete forever. The Undo after
// a Remove is a save notice (saveNotice.removeWithUndo), so it never stacks with another notice.
// Delete forever has its own Undo (#212), shown in the dialog's footer while it is open
// (DialogNotice) and in the toast once it closes.
import { useEffect, useRef } from 'react';
import { Box, Button, Dialog, Stack, Text } from '@hirobius/design-system';
import { titleOf } from './jobRow';
import { metaLines } from './metaLines';
import { daysLeft, deleteForever, getTrash, TRASH_DAYS, useTrash, type Removed } from './trash';
import { jobIdOf } from './store';
import { pageHeading } from './focusRescue';
import { noticeToToast, notifyRemoved, restoreWithNotice } from './saveNotice';
import { DialogNotice } from './NoticeHost';
import { JobPostingTitle } from './PostingLink';
import { useBackSheet } from './useBackCloses';

const daysAgo = (iso: string, now = Date.now()) => {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'Removed today' : `Removed ${d}d ago`;
};

/** "Removed 27d ago · Deleted in 3 days" (#307): how long is left, not only how long it's been. */
const ageLine = (iso: string, now = Date.now()) => {
  const left = daysLeft(iso, now);
  return `${daysAgo(iso, now)} · Deleted in ${left} ${left === 1 ? 'day' : 'days'}`;
};

/** The last entry restored or deleted closes the dialog and takes its trigger with it, so focus
 *  would fall to <body> (#306). Once Radix has tried its trigger (and focus rescue has picked the
 *  next control along), focus the restored job's title in the list, else the Jobs panel's
 *  heading, else the page's heading: where the job went, or the top of the list. */
function focusAfterEmpty(restored: string | null) {
  const run = () => {
    const main = document.querySelector('main');
    const link =
      restored && main?.querySelector<HTMLElement>(`a[href="#/queue/${jobIdOf(restored)}"]`);
    if (link) return link.focus();
    const heading =
      main?.querySelector<HTMLElement>('section[aria-label="Jobs"] h3') ?? pageHeading();
    if (!heading) return;
    // A heading takes focus without becoming a tab stop or drawing a ring (base.css).
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.setAttribute('data-focus-heading', '');
    heading.focus({ preventScroll: true });
  };
  // Radix returns focus on a timer when the dialog unmounts: go after it.
  setTimeout(() => setTimeout(run));
}

function RemovedRow({ entry, onRestore }: { entry: Removed; onRestore: (url: string) => void }) {
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
        {metaLines([entry.job.company, ageLine(entry.removedAt)]).map((line) => (
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
          onClick={() => {
            onRestore(entry.job.url);
            restoreWithNotice(entry.job.url, { inDialog: true });
          }}
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
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!empty) return;
    if (openRef.current) focusAfterEmpty(restoredRef.current);
    onOpenChange(false);
  }, [empty, onOpenChange]);
  // With jobs in the list, the Pipeline drops this link in the same render it empties.
  useEffect(
    () => () => {
      if (openRef.current && getTrash().length === 0) focusAfterEmpty(restoredRef.current);
    },
    [],
  );
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
            <RemovedRow
              key={r.job.url}
              entry={r}
              onRestore={(url) => (restoredRef.current = url)}
            />
          ))}
        </Stack>
        <Dialog.Footer>
          <DialogNotice />
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
