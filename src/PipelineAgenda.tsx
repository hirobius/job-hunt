// The Pipeline's agenda (#236, Calm list 2/7; was Today, #128): one Follow up section (the due
// ones first, each with its one action, then the rest with the day they fall due) and the next 7
// days of interviews and calls. The read models are pure (jobEvents.ts, applyQueue.ts); this only
// lays them out. A section with nothing in it renders nothing. Each is a panel (rev-3 mock).
import type { ReactNode } from 'react';
import { Badge, Box, Button, InlineLink, Stack, Text } from '@hirobius/design-system';
import { Panel, PanelRow, PanelRows } from './PipelinePanel';
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
import type { Job } from './types';

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

/** One agenda row: an optional badge above the title (rev-3 B), note lines, an optional trailing
 * action. State is text (a Badge or the title's own words), never a status dot (#193). */
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
        <Stack gap="px4" align="start">
          {badge}
          <Text variant="body" as="span" className="rjb-card-title">
            {title}
          </Text>
          {notes.map((n, i) => (
            <Text key={i} variant="caption" as="span" tone="secondary">
              {n}
            </Text>
          ))}
        </Stack>
      </Box>
      {trailing}
    </Stack>
  );
}

const jobs$ = (n: number, noun = 'job') => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** Applied or interviewing jobs: the due ones first (most overdue first), then the rest by date. */
export function FollowUpSection({ jobs, now }: { jobs: Job[]; now: Date }) {
  const due = dueFollowUps(jobs, now).map((d) => d.job);
  const dueUrls = new Set(due.map((j) => j.url));
  const waiting = followUpJobs(jobs, now).filter((j) => !dueUrls.has(j.url));
  const count = due.length + waiting.length;
  if (count === 0) return null;
  return (
    <Panel label={`Follow up (${count})`} title="Follow up" count={count} countLabel={jobs$(count)}>
      <PanelRows>
        {due.map((job) => (
          <PanelRow key={job.url}>
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
          </PanelRow>
        ))}
        {waiting.map((job) => {
          const date = followUpDate(job, now);
          return (
            <PanelRow key={job.url}>
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
            </PanelRow>
          );
        })}
      </PanelRows>
    </Panel>
  );
}

/** Interviews, calls and other events from today through the next 6 days. */
export function NextDaysSection({ jobs, now }: { jobs: Job[]; now: Date }) {
  const upcoming = upcomingEvents(jobs, now);
  if (upcoming.length === 0) return null;
  return (
    <Panel
      label={`Next ${UPCOMING_DAYS} days (${upcoming.length})`}
      title={`Next ${UPCOMING_DAYS} days`}
      count={upcoming.length}
      countLabel={jobs$(upcoming.length, 'event')}
    >
      <PanelRows>
        {upcoming.map((it) => (
          <PanelRow key={`${it.jobUrl}-${it.id}`}>
            <AgendaRow
              title={`${KIND_WORD[it.kind]} · ${it.label}`}
              notes={metaLines([
                `${dayLabel(it.date, now)}, ${it.time ?? 'all day'}`,
                it.company,
                it.note,
              ])}
              trailing={
                <Button asChild variant="secondary">
                  <a href={jobHref(it.jobUrl)} aria-label={`Open job: ${it.label}`}>
                    Open
                  </a>
                </Button>
              }
            />
          </PanelRow>
        ))}
      </PanelRows>
    </Panel>
  );
}
