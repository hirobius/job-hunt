// The Pipeline's agenda (#236, Calm list 2/7; was Today, #128): one Follow up section (the due
// ones first, each with its one action, then the rest with the day they fall due) and the next 7
// days of interviews and calls. The read models are pure (jobEvents.ts, applyQueue.ts); this only
// lays them out. A section with nothing in it renders nothing. Roomy layout: each is a section of
// item cards (ItemCard) on the canvas.
import type { ReactNode } from 'react';
import { Badge, Box, InlineLink, Stack, Text } from '@hirobius/design-system';
import { Panel, PanelRow, PanelRows } from './PipelinePanel';
import ItemCard from './ItemCard';
import { FollowUpButton } from './FollowUp';
import { deriveJobState } from './jobState';
import { followUpJobs } from './applyQueue';
import { dueFollowUps, followUpDate, KIND_WORD, UPCOMING_DAYS, upcomingEvents } from './jobEvents';
import { dayLabel } from './dayLabel';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { titleOf } from './jobRow';
import { metaLines } from './metaLines';
import { timeLabel } from './agendaTime';
import { JobPostingLink, PostingLink } from './PostingLink';
import type { Job } from './types';

const jobHref = (url: string) => jobHash(jobIdOf(url));
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** When the clock last started: the last follow-up, else the application. */
function sinceNote(job: Job, now: Date) {
  const s = deriveJobState(job, now);
  if (s.followUp.loggedDaysAgo != null) return `Followed up ${days(s.followUp.loggedDaysAgo)} ago`;
  return s.appliedDaysAgo != null ? `Applied ${days(s.appliedDaysAgo)} ago` : '';
}

/** One agenda card: the company's initial, an optional badge above the title (rev-3 B), the title
 * (the job's link) with the job's posting link beside it, note lines, an optional action. State is
 * text (a Badge or the title's own words), never a status dot (#193). */
function AgendaCard({
  avatar,
  title,
  posting,
  badge,
  notes,
  action,
}: {
  avatar: string;
  title: ReactNode;
  /** The job's PostingLink: one tap to the posting from every row (Adrian 2026-10-22). */
  posting: ReactNode;
  badge?: ReactNode;
  notes: string[];
  action?: ReactNode;
}) {
  return (
    <PanelRow>
      <ItemCard avatar={avatar} actions={action}>
        <Stack gap="px8" align="start">
          {badge}
          <Stack gap="px4">
            <Stack direction="row" gap="px4" align="center">
              <Box sx={{ minWidth: 0 }}>
                <Text variant="body" as="span" className="rjb-card-title rjb-semibold">
                  {title}
                </Text>
              </Box>
              {posting}
            </Stack>
            {notes.map((n, i) => (
              <Text key={i} variant="caption" as="span" tone="secondary">
                {n}
              </Text>
            ))}
          </Stack>
        </Stack>
      </ItemCard>
    </PanelRow>
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
    <Panel
      kind="list"
      label={`Follow up (${count})`}
      title="Follow up"
      count={count}
      countLabel={jobs$(count)}
    >
      <PanelRows>
        {due.map((job) => (
          <AgendaCard
            key={job.url}
            avatar={job.company || titleOf(job)}
            title={
              <InlineLink href={jobHref(job.url)} externalIcon={false}>
                {titleOf(job)}
              </InlineLink>
            }
            posting={<JobPostingLink job={job} />}
            badge={<Badge tone="warning">Due</Badge>}
            notes={metaLines([job.company, sinceNote(job, now)])}
            action={<FollowUpButton job={job} size="md" />}
          />
        ))}
        {waiting.map((job) => {
          const date = followUpDate(job, now);
          return (
            <AgendaCard
              key={job.url}
              avatar={job.company || titleOf(job)}
              title={
                <InlineLink href={jobHref(job.url)} externalIcon={false}>
                  {titleOf(job)}
                </InlineLink>
              }
              posting={<JobPostingLink job={job} />}
              notes={metaLines([
                deriveJobState(job, now).status,
                date ? `Follow up ${dayLabel(date, now)}` : '',
              ])}
            />
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
      kind="list"
      label={`Next ${UPCOMING_DAYS} days (${upcoming.length})`}
      title={`Next ${UPCOMING_DAYS} days`}
      count={upcoming.length}
      countLabel={jobs$(upcoming.length, 'event')}
    >
      <PanelRows>
        {upcoming.map((it) => (
          // The title is the job's link (roomy: no separate Open button).
          <AgendaCard
            key={`${it.jobUrl}-${it.id}`}
            avatar={it.company || it.label}
            title={
              <InlineLink href={jobHref(it.jobUrl)} externalIcon={false}>
                {`${KIND_WORD[it.kind]} · ${it.label}`}
              </InlineLink>
            }
            posting={<PostingLink url={it.jobUrl} title={it.label} company={it.company} />}
            notes={metaLines([
              `${dayLabel(it.date, now)}, ${timeLabel(it.time)}`,
              it.company,
              it.note,
            ])}
          />
        ))}
      </PanelRows>
    </Panel>
  );
}
