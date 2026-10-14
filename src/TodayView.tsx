// Today (#128), the home route `#/today`: what needs doing now. Due follow-ups and the next 7 days
// of interviews and calls as StatusListItem rows, each with one trailing action; one quick-add
// field; and the Insights band. The read models are pure (jobEvents.ts, metrics.ts); this view
// only lays them out.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'lucide-react';
import {
  Box,
  Button,
  InlineLink,
  Input as HdsInput,
  Stack,
  StatusListItem,
  Text,
  useToast,
} from '@hirobius/design-system';
import { Form, Page, PageHeader } from '@hirobius/design-system/patterns';
import { addJob, findJobByUrl, jobIdOf, logFollowUp, useJobs } from './store';
import { deriveJobState, FOLLOWUP_DAYS } from './jobState';
import { dueFollowUps, KIND_WORD, upcomingEvents, ymd } from './jobEvents';
import { jobHash } from './route';
import type { Job } from './types';
import Insights from './Insights';
import TodayNotice from './TodayNotice';
import EmptyState from './EmptyState';
import { SampleBanner, TrySampleButton } from './demo/SampleData';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;
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

/** A titled list: a region named by its heading, rows or one line saying it's empty. */
function Section({
  id,
  title,
  count,
  empty,
  children,
}: {
  id: string;
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  // A native <section>: Stack doesn't pass aria-* through.
  return (
    <section aria-labelledby={id}>
      <Stack gap="tight">
        <Text variant="ui" as="h3" id={id} style={{ margin: 0, fontWeight: 600 }}>
          {count > 0 ? `${title} · ${count}` : title}
        </Text>
        {count > 0 ? (
          <Stack as="ul" gap="tight" style={LIST}>
            {children}
          </Stack>
        ) : (
          <Text variant="caption" as="p" style={{ ...SECONDARY, margin: 0 }}>
            {empty}
          </Text>
        )}
      </Stack>
    </section>
  );
}

function QuickAdd() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  // The last add, with a link to its job. A toast can't carry one (HDS Toast has no action slot),
  // so the outcome stays here, under the field, until the next add.
  const [last, setLast] = useState<{ job: Job; added: boolean } | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    const added = addJob(u);
    const job = findJobByUrl(u);
    if (!job) return setError("That doesn't look like a link. Paste the job's web address.");
    setLast({ job, added });
    setUrl('');
  };
  return (
    <Form onSubmit={submit} noValidate>
      <Stack direction="row" gap="tight" align="start">
        <Box sx={{ flex: '1 1 0%', minWidth: 0, '& > *': { width: '100%' } }}>
          <HdsInput
            aria-label="Add a job"
            type="url"
            placeholder="Paste a job link to save it"
            leadingVisual={<Link size={16} />}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            error={!!error}
            errorMessage={error}
            style={{ width: '100%' }}
          />
        </Box>
        <Button type="submit" variant="primary" disabled={!url.trim()}>
          Add
        </Button>
      </Stack>
      {last && (
        <Text
          variant="caption"
          as="p"
          role="status"
          aria-label="Quick add"
          style={{ ...SECONDARY, margin: 0 }}
        >
          {last.added ? 'Saved to your Pipeline: ' : 'Already in your Pipeline: '}
          <InlineLink href={jobHref(last.job.url)}>{last.job.label}</InlineLink>
        </Text>
      )}
    </Form>
  );
}

export default function TodayView() {
  const jobs = useJobs();
  const { toast } = useToast();
  const now = new Date();
  const due = dueFollowUps(jobs, now);
  const upcoming = upcomingEvents(jobs, now);

  return (
    <Page maxWidth="content" paddingY="none">
      <Stack gap="normal">
        <PageHeader
          level={2}
          title="Today"
          status={
            <Text variant="caption" as="span" style={SECONDARY}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          }
        />
        <TodayNotice />
        <SampleBanner jobs={jobs} />
        <QuickAdd />
        {jobs.length === 0 ? (
          <EmptyState
            title="Nothing to follow up yet"
            message="Save a job above or from Discover. Follow-ups, interviews and calls you log will show up here."
            action={<TrySampleButton />}
          />
        ) : (
          <>
            <Section
              id="today-due"
              title="Follow-ups due"
              count={due.length}
              empty="Nothing due. Follow-ups fall due a week after you apply or last follow up."
            >
              {due.map(({ job }) => (
                <li key={job.url}>
                  <StatusListItem
                    tone="warning"
                    title={<InlineLink href={jobHref(job.url)}>{job.label}</InlineLink>}
                    notes={[[job.company, sinceNote(job, now)].filter(Boolean).join(' · ')]}
                    trailing={
                      <Button
                        variant="secondary"
                        aria-label={`Log follow-up: ${job.label}`}
                        onClick={() => {
                          logFollowUp(job.url);
                          toast({
                            title: 'Follow-up logged',
                            description: `${job.label}: the next one is due in ${days(FOLLOWUP_DAYS)}.`,
                            tone: 'success',
                          });
                        }}
                      >
                        Log follow-up
                      </Button>
                    }
                  />
                </li>
              ))}
            </Section>
            <Section
              id="today-next"
              title="Next 7 days"
              count={upcoming.length}
              empty="Nothing scheduled. Log interviews and calls on a job's page."
            >
              {upcoming.map((it) => (
                <li key={`${it.jobUrl}-${it.id}`}>
                  <StatusListItem
                    tone={it.kind === 'interview' ? 'info' : 'neutral'}
                    title={`${KIND_WORD[it.kind]} · ${it.label}`}
                    notes={[
                      `${dayLabel(it.date, now)} · ${it.time ?? 'All day'}`,
                      [it.company, it.note].filter(Boolean).join(' · '),
                    ].filter(Boolean)}
                    trailing={
                      <Button asChild variant="tertiary">
                        <a href={jobHref(it.jobUrl)} aria-label={`Open job: ${it.label}`}>
                          Open job
                        </a>
                      </Button>
                    }
                  />
                </li>
              ))}
            </Section>
            <Insights jobs={jobs} />
          </>
        )}
      </Stack>
    </Page>
  );
}
