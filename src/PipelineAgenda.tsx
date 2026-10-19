// The Pipeline's agenda (#236, Calm list 2/7; was Today, #128): one Follow up section (the due
// ones first, each with its one action, then the rest with the day they fall due) and the next 7
// days of interviews and calls. The read models are pure (jobEvents.ts, applyQueue.ts); this only
// lays them out. A section with nothing in it renders nothing. Flat sections, no cards (#241).
import type { ReactNode } from 'react';
import { Badge, Box, Button, InlineLink, Stack, Text } from '@hirobius/design-system';
import { FollowUpButton } from './FollowUp';
import { deriveJobState } from './jobState';
import { followUpJobs } from './applyQueue';
import {
  dueFollowUps,
  followUpDate,
  KIND_WORD,
  UPCOMING_DAYS,
  upcomingEvents,
  ymd,
} from './jobEvents';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { titleOf } from './jobRow';
import { metaLines } from './metaLines';
import { SECONDARY } from './hds-gaps/tone';
import type { Job } from './types';

const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;

const jobHref = (url: string) => jobHash(jobIdOf(url));
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** "Today", "Tomorrow", else "Fri, Oct 16". */
function dayLabel(date: string, now: Date) {
  if (date === ymd(now)) return 'Today';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (date === ymd(tomorrow)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** When the clock last started: the last follow-up, else the application. */
function sinceNote(job: Job, now: Date) {
  const s = deriveJobState(job, now);
  if (s.followUp.loggedDaysAgo != null) return `Followed up ${days(s.followUp.loggedDaysAgo)} ago`;
  return s.appliedDaysAgo != null ? `Applied ${days(s.appliedDaysAgo)} ago` : '';
}

/** One agenda row: title, up to a few note lines, an optional trailing action. State is text (a
 * Badge or the title's own words), never a status dot (#193). */
function AgendaRow({
  title,
  badge,
  notes,
  trailing,
}: {
  title: ReactNode;
  badge?: ReactNode;
  notes: string[];
  trailing?: ReactNode;
}) {
  return (
    <Stack direction="row" gap="px8" align="center" justify="space-between">
      <Box sx={{ minWidth: 0 }}>
        <Stack gap="px4">
          <Stack direction="row" gap="px8" align="center" wrap="wrap">
            <Text variant="ui" as="span">
              {title}
            </Text>
            {badge}
          </Stack>
          {notes.map((n) => (
            <Text key={n} variant="caption" as="span" style={SECONDARY}>
              {n}
            </Text>
          ))}
        </Stack>
      </Box>
      {trailing}
    </Stack>
  );
}

/** A titled flat list (#241): a region named by its heading, 24 under it, rows split by
 *  hairlines. No card around it. */
function AgendaSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box as="section" aria-label={title}>
      <Stack gap="normal">
        <Text variant="body" as="h3" className="rjb-semibold">
          {title}
        </Text>
        <Box as="ul" sx={LIST}>
          {children}
        </Box>
      </Stack>
    </Box>
  );
}

/** One flat row of a section's list. */
function AgendaItem({ children }: { children: ReactNode }) {
  return (
    <Box as="li" sx={{ py: 'xs', borderTop: 'thin solid', borderColor: 'border.default' }}>
      {children}
    </Box>
  );
}

/** Applied or interviewing jobs: the due ones first (most overdue first), then the rest by date. */
export function FollowUpSection({ jobs, now }: { jobs: Job[]; now: Date }) {
  const due = dueFollowUps(jobs, now).map((d) => d.job);
  const dueUrls = new Set(due.map((j) => j.url));
  const waiting = followUpJobs(jobs, now).filter((j) => !dueUrls.has(j.url));
  const count = due.length + waiting.length;
  if (count === 0) return null;
  return (
    <AgendaSection title={`Follow up (${count})`}>
      {due.map((job) => (
        <AgendaItem key={job.url}>
          <AgendaRow
            title={
              <InlineLink href={jobHref(job.url)} externalIcon={false}>
                {titleOf(job)}
              </InlineLink>
            }
            badge={<Badge tone="warning">Due</Badge>}
            notes={metaLines([job.company, sinceNote(job, now)])}
            trailing={<FollowUpButton job={job} />}
          />
        </AgendaItem>
      ))}
      {waiting.map((job) => {
        const date = followUpDate(job, now);
        return (
          <AgendaItem key={job.url}>
            <AgendaRow
              title={
                <InlineLink href={jobHref(job.url)} externalIcon={false}>
                  {titleOf(job)}
                </InlineLink>
              }
              notes={metaLines([
                deriveJobState(job, now).status,
                date ? `Follow up ${dayLabel(date, now)}` : '',
              ])}
            />
          </AgendaItem>
        );
      })}
    </AgendaSection>
  );
}

/** Interviews, calls and other events from today through the next 6 days. */
export function NextDaysSection({ jobs, now }: { jobs: Job[]; now: Date }) {
  const upcoming = upcomingEvents(jobs, now);
  if (upcoming.length === 0) return null;
  return (
    <AgendaSection title={`Next ${UPCOMING_DAYS} days (${upcoming.length})`}>
      {upcoming.map((it) => (
        <AgendaItem key={`${it.jobUrl}-${it.id}`}>
          <AgendaRow
            title={`${KIND_WORD[it.kind]} · ${it.label}`}
            notes={metaLines([dayLabel(it.date, now), it.time ?? 'All day', it.company, it.note])}
            trailing={
              <Button asChild variant="secondary">
                <a href={jobHref(it.jobUrl)} aria-label={`Open job: ${it.label}`}>
                  Open job
                </a>
              </Button>
            }
          />
        </AgendaItem>
      ))}
    </AgendaSection>
  );
}
