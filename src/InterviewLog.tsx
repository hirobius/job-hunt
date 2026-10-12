import { useState } from 'react';
import {
  Button,
  Cluster,
  DateInput,
  IconButton,
  Input,
  SegmentedControl,
  Stack,
  Text,
  TimeInput,
} from '@hirobius/design-system';
import { CalendarPlus, X } from 'lucide-react';
import { buildIcs } from './ics';
import { download } from './download';
import { addEvent, jobIcsEvents, removeEvent } from './jobEvents';
import { updateJob } from './store';
import type { Job, JobEventKind } from './types';

const KINDS: { value: JobEventKind; label: string }[] = [
  { value: 'interview', label: 'Interview' },
  { value: 'call', label: 'Call' },
  { value: 'other', label: 'Other' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'job';

/** Interview / call log for one job, with an "Add to calendar" (.ics) export. */
export default function InterviewLog({ job }: { job: Job }) {
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<JobEventKind>('interview');
  const [note, setNote] = useState('');
  const events = job.events ?? [];

  const add = () => {
    if (!date) return;
    const next = addEvent(job.events, { kind, date: toYmd(date), time: time || undefined, note });
    if (next.length === events.length) return;
    updateJob(job.url, { events: next });
    setDate(undefined);
    setTime('');
    setNote('');
  };

  const upcoming = jobIcsEvents(job, new Date());
  const exportIcs = () => {
    const now = new Date();
    const ics = buildIcs(jobIcsEvents(job, now), { now, uidDomain: 'apply-board' });
    download(`${slug(job.label)}.ics`, ics, 'text/calendar');
  };

  return (
    <Stack gap="normal">
      {events.length > 0 && (
        <Stack gap="tight" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map((e) => (
            <li key={e.id}>
              <Cluster gap="tight" align="center">
                <Text variant="ui" as="span">
                  {e.date}
                  {e.time ? ` ${e.time}` : ''}
                </Text>
                <Text
                  variant="ui"
                  as="span"
                  style={{ color: 'var(--semantic-color-content-secondary)' }}
                >
                  {KINDS.find((k) => k.value === e.kind)?.label}
                  {e.note ? ` · ${e.note}` : ''}
                </Text>
                <IconButton
                  size="sm"
                  variant="tertiary"
                  icon={X}
                  label={`Remove ${e.kind} on ${e.date}`}
                  onClick={() => updateJob(job.url, { events: removeEvent(job.events, e.id) })}
                />
              </Cluster>
            </li>
          ))}
        </Stack>
      )}

      <Cluster gap="tight" align="end">
        <DateInput
          aria-label="Event date"
          displayFormat="yyyy-MM-dd"
          value={date}
          onChange={setDate}
        />
        <TimeInput
          aria-label="Event time (optional)"
          size="md"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <SegmentedControl
          aria-label="Event kind"
          size="sm"
          options={KINDS}
          value={kind}
          onChange={(v) => setKind(v as JobEventKind)}
        />
      </Cluster>
      <Cluster gap="tight" align="end">
        <div style={{ flex: 1, minWidth: 160 }}>
          <Input
            aria-label="Event note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button size="sm" variant="secondary" disabled={!date} onClick={add}>
          Add
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          iconLeft={<CalendarPlus size={16} />}
          disabled={upcoming.length === 0}
          onClick={exportIcs}
        >
          Add to calendar
        </Button>
      </Cluster>
    </Stack>
  );
}
