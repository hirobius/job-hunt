import { useState } from 'react';
import {
  Box,
  Button,
  Grid,
  Icon,
  Input,
  SegmentedControl,
  Stack,
  Text,
} from '@hirobius/design-system';
import { CalendarPlus, X } from 'lucide-react';
import { buildIcs } from './ics';
import { download } from './download';
import { addEvent, jobIcsEvents, removeEvent } from './jobEvents';
import { dayLabel } from './dayLabel';
import { timeLabel } from './agendaTime';
import { updateJob } from './store';
import type { Job, JobEventKind } from './types';

const KINDS: { value: JobEventKind; label: string }[] = [
  { value: 'interview', label: 'Interview' },
  { value: 'call', label: 'Call' },
  { value: 'other', label: 'Other' },
];

/** When an event is, as the Pipeline's Next 7 days writes it: "Tue, Oct 20, 2:00 PM" (no time, just
 *  the day). */
const whenOf = (date: string, time: string | undefined, now: Date) =>
  time ? `${dayLabel(date, now)}, ${timeLabel(time)}` : dayLabel(date, now);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'job';

/** The .ics export of the job's upcoming events; the Interviews panel's header holds it. */
export function AddToCalendar({ job }: { job: Job }) {
  const upcoming = jobIcsEvents(job, new Date());
  const exportIcs = () => {
    const now = new Date();
    const ics = buildIcs(jobIcsEvents(job, now), { now, uidDomain: 'apply-board' });
    download(`${slug(job.label)}.ics`, ics, 'text/calendar');
  };
  return (
    <Button
      size="md"
      variant="secondary"
      iconLeft={<Icon icon={CalendarPlus} />}
      disabled={upcoming.length === 0}
      onClick={exportIcs}
    >
      Add to calendar
    </Button>
  );
}

/** Interview / call log for one job: the booked ones, then the form that adds one (rev-3: each
 *  field on its own row on a phone, the kind full width, Add interview last). */
export default function InterviewLog({ job }: { job: Job }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [kind, setKind] = useState<JobEventKind>('interview');
  const [note, setNote] = useState('');
  const events = job.events ?? [];
  const now = new Date();

  const add = () => {
    if (!date) return;
    const next = addEvent(job.events, { kind, date, time: time || undefined, note });
    if (next.length === events.length) return;
    updateJob(job.url, { events: next });
    setDate('');
    setTime('');
    setNote('');
  };

  const caption = (text: string) => (
    <Text variant="caption" as="span" tone="secondary">
      {text}
    </Text>
  );

  return (
    <Stack gap="normal" className="rjb-form-full">
      {/* One row per event, split by the Calm list hairline (.rjb-rows): the day over its kind
          and note, the remove button at the end. */}
      {events.length > 0 && (
        <Box as="ul" className="rjb-rows" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {events.map((e) => {
            const when = whenOf(e.date, e.time, now);
            return (
              <li key={e.id}>
                <Stack direction="row" gap="px8" align="center" wrap="nowrap">
                  <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
                    <Stack gap="px4">
                      <Text variant="ui" as="span" weight="medium">
                        {when}
                      </Text>
                      <Text variant="caption" as="span" tone="secondary">
                        {KINDS.find((k) => k.value === e.kind)?.label}
                        {e.note ? ` · ${e.note}` : ''}
                      </Text>
                    </Stack>
                  </Box>
                  <Button
                    size="sm"
                    variant="tertiary"
                    iconOnly
                    iconLeft={<Icon icon={X} />}
                    label={`Remove ${e.kind} on ${when}`}
                    onClick={() => updateJob(job.url, { events: removeEvent(job.events, e.id) })}
                  />
                </Stack>
              </li>
            );
          })}
        </Box>
      )}

      <Grid layout="auto-fit" minItemWidth="200px" gap="medium" align="end">
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
      </Grid>
      <Stack gap="tight">
        {caption('Kind')}
        <SegmentedControl
          aria-label="Event kind"
          size="sm"
          fullWidth
          options={KINDS}
          value={kind}
          onChange={(v) => setKind(v as JobEventKind)}
        />
      </Stack>
      <Stack gap="tight">
        {caption('Note (optional)')}
        <Input aria-label="Event note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Stack>
      <Box>
        <Button size="md" variant="secondary" disabled={!date} onClick={add}>
          Add interview
        </Button>
      </Box>
    </Stack>
  );
}
