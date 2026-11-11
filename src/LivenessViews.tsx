// Where liveness shows (#601): one quiet place on Apply, the list's status line ("Active · 33 jobs ·
// 1 closed on the board") with the check action beside it; each closed job's Closed badge (card and
// job header) says the rest. No page-top line, no second link to a job already in the list. Closed means the company's board no longer lists the posting; nothing here
// changes a job's status.
import { useMemo, useState } from 'react';
import { Button, Spinner, Stack, Text } from '@hirobius/design-system';
import { eligibleJobs } from './feed/liveness';
import { runLivenessCheck } from './livenessStore';
import type { Job } from './types';

/** The quiet "Check which are still open" action (inside Filters on a phone, under the status line
 *  in the lg list column); it speaks only when a check could not finish (#601). */
export function LivenessCheck({ jobs }: { jobs: Job[] }) {
  const eligible = useMemo(() => eligibleJobs(jobs), [jobs]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (eligible.length === 0) return null;

  const onCheck = async () => {
    setBusy(true);
    setNote('');
    const r = await runLivenessCheck(eligible, { force: true });
    setBusy(false);
    if (r.checked === 0 && r.couldNot > 0)
      setNote('Could not check right now. Nothing was changed.');
    else if (r.couldNot > 0) setNote(`Could not check ${r.couldNot}. The rest are up to date.`);
  };

  return (
    <Stack direction="row" wrap="wrap" gap="xs" align="center">
      <Button
        size="sm"
        variant="tertiary"
        className="rjb-flush-start"
        onClick={onCheck}
        disabled={busy}
      >
        Check which are still open
      </Button>
      {busy && <Spinner size="sm" label="Checking company boards" />}
      <Text variant="caption" as="span" tone="secondary" role="status">
        {note}
      </Text>
    </Stack>
  );
}
