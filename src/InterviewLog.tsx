import { useState } from 'react';
import { Button, Grid, Icon, Input, SegmentedControl, Stack, Text } from '@hirobius/design-system';
import { CalendarPlus, X } from 'lucide-react';
import { buildIcs } from './ics';
import { download } from './download';
import { addEvent, jobIcsEvents, removeEvent } from './jobEvents';
import { updateJob } from './store';
import type { Job, JobEventKind } from './types';
import { SECONDARY } from './hds-gaps/tone';

const KINDS: { value: JobEventKind; label: string }[] = [
  { value: 'interview', label: 'Interview' },
  { value: 'call', label: 'Call' },
  { value: 'other', label: 'Other' },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'job';

/** Interview / call log for one job, with an "Add to calendar" (.ics) export. */
export default function InterviewLog({ job }: { job: Job }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<JobEventKind>('interview');
  const [note, setNote] = useState('');
  const events = job.events ?? [];

  const add = () => {
    if (!date) return;
    const next = addEvent(job.events, { kind, date, time: time || undefined, note });
    if (next.length === events.length) return;
    updateJob(job.url, { events: next });
    setDate('');
    setTime('');
    setNote('');
  };

  const upcoming = jobIcsEvents(job, new Date());
  const exportIcs = () => {
    const now = new Date();
    const ics = buildIcs(jobIcsEvents(job, now), { now, uidDomain: 'apply-board' });
    download(`${slug(job.label)}.ics`, ics, 'text/calendar');
  };

  const caption = (text: string) => (
    <Text variant="caption" as="span" style={SECONDARY}>
      {text}
    </Text>
  );

  return (
    <Stack gap="normal">
      <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="space-between">
        <Text variant="ui" as="h4" className="rjb-semibold">
          Interviews & calls
        </Text>
        <Button
          size="sm"
          variant="tertiary"
          iconLeft={<CalendarPlus size={16} />}
          disabled={upcoming.length === 0}
          onClick={exportIcs}
        >
          Add to calendar
        </Button>
      </Stack>
      {events.length > 0 && (
        <Stack gap="tight" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map((e) => (
            <li key={e.id}>
              <Stack direction="row" wrap="wrap" gap="tight" align="center">
                <Text variant="ui" as="span">
                  {e.date}
                  {e.time ? ` ${e.time}` : ''}
                </Text>
                <Text variant="ui" as="span" style={SECONDARY}>
                  {KINDS.find((k) => k.value === e.kind)?.label}
                  {e.note ? ` · ${e.note}` : ''}
                </Text>
                <Button
                  size="sm"
                  variant="tertiary"
                  iconOnly
                  iconLeft={<Icon icon={X} />}
                  label={`Remove ${e.kind} on ${e.date}`}
                  onClick={() => updateJob(job.url, { events: removeEvent(job.events, e.id) })}
                />
              </Stack>
            </li>
          ))}
        </Stack>
      )}

      <Grid layout="auto-fit" minItemWidth="150px" gap="medium" align="end">
        <Stack gap="tight">
          {caption('Date')}
          <Input
            type="date"
            aria-label="Event date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Stack>
        <Stack gap="tight">
          {caption('Time (optional)')}
          <Input
            type="time"
            aria-label="Event time (optional)"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Stack>
        <Stack gap="tight">
          {caption('Kind')}
          <SegmentedControl
            aria-label="Event kind"
            size="sm"
            options={KINDS}
            value={kind}
            onChange={(v) => setKind(v as JobEventKind)}
          />
        </Stack>
      </Grid>
      <Stack direction="row" wrap="wrap" gap="tight" align="center">
        <div style={{ flex: 1, minWidth: 160 }}>
          <Input
            aria-label="Event note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button size="sm" variant="secondary" disabled={!date} onClick={add}>
          Add event
        </Button>
      </Stack>
    </Stack>
  );
}
