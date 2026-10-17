// Recently removed (src/trash.ts) in the UI: the Undo toast after a Remove, and the quiet link
// under the Pipeline list that opens the list of removed jobs, each with Restore and Delete forever.
import { useState } from 'react';
import { Box, Button, Dialog, Stack, Text } from '@hirobius/design-system';
import ActionToast from './hds-gaps/ActionToast';
import { SECONDARY } from './hds-gaps/tone';
import { titleOf } from './jobRow';
import { metaLines } from './metaLines';
import {
  clearLastRemoved,
  purgeJob,
  restoreJob,
  TRASH_DAYS,
  useLastRemoved,
  useTrash,
  type Removed,
} from './trash';

/** The toast after a Remove, wherever it happened. */
export function UndoRemove() {
  const url = useLastRemoved();
  const entry = useTrash().find((r) => r.job.url === url);
  if (!url || !entry) return null;
  return (
    <ActionToast
      key={url}
      message={`Removed “${titleOf(entry.job)}”`}
      actionLabel="Undo"
      onAction={() => restoreJob(url)}
      onClose={clearLastRemoved}
    />
  );
}

const daysAgo = (iso: string, now = Date.now()) => {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'Removed today' : `Removed ${d}d ago`;
};

function RemovedRow({ entry }: { entry: Removed }) {
  const title = titleOf(entry.job);
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="space-between">
      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Text variant="ui" as="span" className="rjb-semibold">
          {title}
        </Text>
        <Text variant="caption" as="span" style={SECONDARY}>
          {[...metaLines([entry.job.company]), daysAgo(entry.removedAt)].join(' · ')}
        </Text>
      </Box>
      <Stack direction="row" gap="tight">
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Restore: ${title}`}
          onClick={() => restoreJob(entry.job.url)}
        >
          Restore
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          tone="danger"
          aria-label={`Delete forever: ${title}`}
          onClick={() => purgeJob(entry.job.url)}
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
  const [open, setOpen] = useState(false);
  if (trash.length === 0) return null;
  return (
    <>
      <Button size="sm" variant="tertiary" onClick={() => setOpen(true)}>
        {`Recently removed (${trash.length})`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
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
        </Dialog.Content>
      </Dialog>
    </>
  );
}
