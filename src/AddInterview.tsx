// Add interview (#416, Adrian 2026-10-28): the Interviews log left the job page, but booking one
// stays one item in the job's ⋯ menu (and an Interviewing job's primary), so interview dates still
// feed Next 7 days and the follow-up clock. One dialog, mounted once in App like Follow up, so a
// card that leaves its list doesn't take the dialog with it. The job's events stay on the Job.
import { useState } from 'react';
import {
  Button,
  Dialog,
  Grid,
  Input,
  SegmentedControl,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import { closeAddInterview, focusInterviewOpener, useAddInterviewTarget } from './jobDialogs';
import { addEvent } from './jobEvents';
import { dayLabel } from './dayLabel';
import { timeLabel } from './agendaTime';
import { titleOf } from './jobRow';
import { findJobByUrl, updateJob, useJobs } from './store';
import { useBackCloses } from './useBackCloses';
import type { Job, JobEventKind } from './types';
import { ExitButton } from './hds-gaps/ExitButton';

const KINDS: { value: JobEventKind; label: string }[] = [
  { value: 'interview', label: 'Interview' },
  { value: 'call', label: 'Call' },
  { value: 'other', label: 'Other' },
];

/** The one Add interview dialog. Mount once. */
export function AddInterviewHost() {
  const url = useAddInterviewTarget();
  const job = useJobs().find((j) => j.url === url);
  // The browser's Back closes the sheet and stays on the page under it (return paths).
  useBackCloses(!!job, closeAddInterview, 'add-interview');
  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && closeAddInterview()}>
      {job && <AddInterviewContent key={job.url} job={job} />}
    </Dialog>
  );
}

function AddInterviewContent({ job }: { job: Job }) {
  const { toast } = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<JobEventKind>('interview');
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);

  const add = () => {
    if (!date) return;
    // Read the job as it is now: a sync may have landed since the dialog opened.
    const events = findJobByUrl(job.url)?.events;
    const next = addEvent(events, { kind, date, time: time || undefined, note });
    // A day the browser let through but addEvent refuses (no date picker): say so, save nothing.
    if (next.length === (events?.length ?? 0)) return setError(true);
    updateJob(job.url, { events: next });
    closeAddInterview();
    const when = time
      ? `${dayLabel(date, new Date())}, ${timeLabel(time)}`
      : dayLabel(date, new Date());
    toast({ title: `${KINDS.find((k) => k.value === kind)?.label} added`, description: when });
  };

  return (
    <Dialog.Content className="rjb-dialog" onCloseAutoFocus={focusInterviewOpener}>
      <Dialog.Header>
        <Dialog.Title>Add interview</Dialog.Title>
        <Dialog.Description>{titleOf(job)}</Dialog.Description>
      </Dialog.Header>
      <Stack gap="normal" className="rjb-form-full">
        <Grid layout="auto-fit" minItemWidth="200px" gap="medium" align="end">
          <Input
            type="date"
            label="Date"
            value={date}
            error={error}
            errorMessage={error ? 'Use a date like 2026-11-03' : undefined}
            onChange={(e) => {
              setDate(e.target.value);
              setError(false);
            }}
          />
          <Input
            type="time"
            label="Time (optional)"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Grid>
        <Stack gap="tight">
          <Text variant="caption" as="span" tone="secondary">
            Kind
          </Text>
          <SegmentedControl
            aria-label="Event kind"
            size="sm"
            fullWidth
            options={KINDS}
            value={kind}
            onChange={(v) => setKind(v as JobEventKind)}
          />
        </Stack>
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </Stack>
      <Dialog.Footer>
        <Dialog.Close asChild>
          <ExitButton>Cancel</ExitButton>
        </Dialog.Close>
        <Button variant="primary" disabled={!date} onClick={add}>
          Add interview
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  );
}
