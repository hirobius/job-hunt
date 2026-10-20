// Recently removed (src/trash.ts) in the UI: the quiet link under the Pipeline list that opens
// the list of removed jobs, each with Restore and Delete forever. The Undo after a Remove is a
// save notice (saveNotice.removeWithUndo), so it never stacks with another notice.
import { useState } from 'react';
import { Box, Button, Dialog, Stack, Text } from '@hirobius/design-system';
import { titleOf } from './jobRow';
import { metaLines } from './metaLines';
import { deleteForever, TRASH_DAYS, useTrash, type Removed } from './trash';
import { restoreWithNotice } from './saveNotice';

const daysAgo = (iso: string, now = Date.now()) => {
  const d = Math.floor((now - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? 'Removed today' : `Removed ${d}d ago`;
};

function RemovedRow({ entry }: { entry: Removed }) {
  const title = titleOf(entry.job);
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="space-between">
      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Text variant="ui" as="span" weight="bold">
          {title}
        </Text>
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
          onClick={() => restoreWithNotice(entry.job.url)}
        >
          Restore
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          tone="danger"
          aria-label={`Delete forever: ${title}`}
          onClick={() => deleteForever(entry.job.url)}
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
    <Dialog open={open} onOpenChange={setOpen}>
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
      </Dialog.Content>
    </Dialog>
  );
}
