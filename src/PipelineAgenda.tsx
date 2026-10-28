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
  respondByJobs,
  UPCOMING_DAYS,
  upcomingEvents,
} from './jobEvents';
import { dayLabel } from './dayLabel';
import { jobIdOf } from './store';
import { jobHash } from './route';
import { postingOf, titleOf } from './jobRow';
import { metaLines } from './metaLines';
import { timeLabel } from './agendaTime';
import { PostingTitle } from './PostingLink';
import type { Job } from './types';

const jobHref = (url: string) => jobHash(jobIdOf(url));
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** When the clock last started: the last follow-up, else the application. */
function sinceNote(job: Job, now: Date) {
  const s = deriveJobState(job, now);
  if (s.followUp.loggedDaysAgo != null) return `Followed up ${days(s.followUp.loggedDaysAgo)} ago`;
  return s.appliedDaysAgo != null ? `Applied ${days(s.appliedDaysAgo)} ago` : '';
}

/** One agenda row: an optional badge above the title (rev-3 B), the title with the job's posting
 * link beside it, note lines, an optional trailing action. State is text (a Badge or the title's
 * own words), never a status dot (#193). */
function AgendaRow({
  title,
  posting,
  badge,
  notes,
  trailing,
}: {
  title: ReactNode;
  /** The job whose posting opens from beside the title, in one tap (Adrian 2026-10-22). */
  posting: { url: string; title?: string; company?: string };
  badge?: ReactNode;
  notes: string[];
  trailing?: ReactNode;
}) {
  return (
    <Stack direction="row" gap="px8" align="center" justify="space-between">
      <Box sx={{ minWidth: 0 }}>
        <Stack gap="px4" align="start">
          {badge}
          <PostingTitle {...posting}>
            <Text variant="body" as="span" weight="bold" className="rjb-card-title">
              {title}
            </Text>
          </PostingTitle>
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

/** Applied or interviewing jobs: the due ones first (most overdue first), then the rest by date.
 *  Saved jobs closing this week (#308) are under Next 7 days (#419). */
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
              posting={postingOf(job)}
              badge={<Badge tone="warning">Follow-up due</Badge>}
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
                posting={postingOf(job)}
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

/** Interviews, calls and other events from today through the next 6 days, and the saved jobs
 *  whose applications close in that window (#419; a closing day sits first on its day, like an
 *  all-day event). */
export function NextDaysSection({ jobs, now }: { jobs: Job[]; now: Date }) {
  const upcoming = upcomingEvents(jobs, now);
  const closing = respondByJobs(jobs, now);
  const count = upcoming.length + closing.length;
  if (count === 0) return null;
  const rows = [
    ...closing.map(({ job, dueDate }) => ({ date: dueDate, closes: job })),
    ...upcoming.map((it) => ({ date: it.date, event: it })),
  ].sort(
    (a, b) => a.date.localeCompare(b.date) || ('closes' in b ? 1 : 0) - ('closes' in a ? 1 : 0),
  );
  return (
    <Panel
      label={`Next ${UPCOMING_DAYS} days (${count})`}
      title={`Next ${UPCOMING_DAYS} days`}
      count={count}
      countLabel={jobs$(count, 'item')}
    >
      <PanelRows>
        {rows.map((r) =>
          'closes' in r ? (
            <PanelRow key={`close-${r.closes.url}`}>
              <AgendaRow
                title={
                  <InlineLink href={jobHref(r.closes.url)} externalIcon={false}>
                    {`Applications close · ${titleOf(r.closes)}`}
                  </InlineLink>
                }
                posting={postingOf(r.closes)}
                notes={metaLines([dayLabel(r.date, now), r.closes.company])}
              />
            </PanelRow>
          ) : (
            <PanelRow key={`${r.event.jobUrl}-${r.event.id}`}>
              <AgendaRow
                title={`${KIND_WORD[r.event.kind]} · ${r.event.label}`}
                posting={{ url: r.event.jobUrl, title: r.event.label, company: r.event.company }}
                notes={metaLines([
                  `${dayLabel(r.event.date, now)}, ${timeLabel(r.event.time)}`,
                  r.event.company,
                  r.event.note,
                ])}
                trailing={
                  // Opens the job's page (one page since #416; the event stays on the job).
                  <Button asChild variant="secondary">
                    <a
                      href={jobHash(jobIdOf(r.event.jobUrl))}
                      aria-label={`Open job: ${r.event.label}`}
                    >
                      Open
                    </a>
                  </Button>
                }
              />
            </PanelRow>
          ),
        )}
      </PanelRows>
    </Panel>
  );
}
