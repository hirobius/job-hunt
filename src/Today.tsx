// Today, the home page and one of the two top tabs (simplify #383 + amendment 2, Q6;
// docs/specs/simplify.md). Top to bottom: the auto-scan's status (Scan now, "Last scanned · N new
// from M sources"), Review new as the Browse list itself (a row opens the in-app preview, Open
// posting one tap away), Apply, Follow up (what is due, with dates, and what falls due this week)
// and the companies the scan found (Follow / Ignore). The read model is today.ts; this lays it out.
import { Button, InlineLink, Skeleton, Stack, Text } from '@hirobius/design-system';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { FollowUpButton } from './FollowUp';
import { MetaCaption } from './MetaCaption';
import { JobPostingTitle } from './PostingLink';
import { NewCompanies, ScanStatus } from './AutoScanViews';
import ReviewView from './ReviewView';
import { useProfile } from './profile';
import { useCloudSync } from './account/accountContext';
import { useJobs, jobIdOf } from './store';
import { jobHash, navigate, useRoute, withOrigin } from './route';
import { metaLines } from './metaLines';
import { lastApplyJobId } from './tabMemory';
import { followUpDate } from './jobEvents';
import { dayLabel } from './dayLabel';
import { titleOf } from './jobRow';
import { applyLine, today, upcomingLine } from './today';
import type { Job } from './types';

const jobs$ = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

export default function Today() {
  const route = useRoute();
  const jobs = useJobs();
  const profile = useProfile();
  const { offline } = useCloudSync();
  const now = new Date();
  const m = today(jobs, now, lastApplyJobId());
  const { due, waiting, upcoming } = m.followUp;
  return (
    <Stack gap="px24">
      <Stack gap="px4">
        <Text as="h2" variant="title">
          Today
        </Text>
        <MetaCaption
          items={[
            now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          ]}
        />
      </Stack>

      {/* The scan's status, then every design-system posting, newest first, as a list (the Deck is
          a toggle inside). Review new hosts the status, so its counts are the Feed's own. */}
      {profile ? (
        <ReviewView label="Review new" scanStatus />
      ) : (
        // The design-systems profile is made on its own once sync settles (searchDefaults.ts
        // `ensureProfile`); until then Review new holds its place, or says why it can't.
        <Stack gap="normal">
          <ScanStatus />
          <Panel label="Review new" title="Review new">
            <PanelBody>
              {offline ? (
                <Text variant="caption" as="p" tone="secondary">
                  Couldn&apos;t reach your account. Your search loads once you&apos;re back online.
                </Text>
              ) : (
                <Stack gap="tight">
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="40%" />
                </Stack>
              )}
            </PanelBody>
          </Panel>
        </Stack>
      )}

      <Panel
        label={`Apply (${m.apply.count})`}
        title="Apply"
        count={m.apply.count}
        countLabel={jobs$(m.apply.count)}
      >
        <PanelBody>
          <Stack gap="normal" align="start">
            <Text variant="caption" as="p" tone="secondary">
              {applyLine(m.apply.count)}
            </Text>
            <Button
              variant="primary"
              disabled={!m.apply.start}
              // Apply mode's Back (and its end) comes back here (return paths).
              onClick={() =>
                m.apply.start &&
                navigate(withOrigin({ tab: 'apply', sub: jobIdOf(m.apply.start.url) }, route))
              }
            >
              {m.apply.resumeAt > 0
                ? `Resume applying (${m.apply.resumeAt + 1} of ${m.apply.count})`
                : 'Start applying'}
            </Button>
          </Stack>
        </PanelBody>
      </Panel>

      <Panel
        label={`Follow up (${due.length} due)`}
        title="Follow up"
        count={due.length}
        countLabel={`${jobs$(due.length)} due`}
        description={due.length || waiting ? upcomingLine(upcoming) : undefined}
      >
        {due.length > 0 ? (
          // The most overdue first; Mark as sent in the dialog moves the next one up.
          <CardList label="Due follow-ups">
            {due.map((j) => (
              <DueRow key={j.url} job={j} now={now} />
            ))}
          </CardList>
        ) : (
          <PanelBody>
            <Text variant="caption" as="p" tone="secondary">
              {waiting ? 'Nothing due today' : 'Nothing waiting on a reply'}
            </Text>
          </PanelBody>
        )}
      </Panel>

      <NewCompanies />
    </Stack>
  );
}

/** A due follow-up, like the Pipeline's: the title opens the job's page, its posting one tap away
 *  beside it; then the company and the day it fell due; then its one action. */
function DueRow({ job, now }: { job: Job; now: Date }) {
  const date = followUpDate(job, now);
  return (
    <ListCard>
      <Stack direction="row" gap="px8" align="center" justify="space-between">
        <Stack gap="px4" align="start">
          <JobPostingTitle job={job}>
            <Text variant="body" as="span" weight="bold" className="rjb-card-title">
              <InlineLink href={jobHash(jobIdOf(job.url))} externalIcon={false}>
                {titleOf(job)}
              </InlineLink>
            </Text>
          </JobPostingTitle>
          {metaLines([job.company, date && `Due ${dayLabel(date, now)}`]).map((line) => (
            <Text key={line} variant="caption" as="span" tone="secondary">
              {line}
            </Text>
          ))}
        </Stack>
        <FollowUpButton job={job} size="sm" />
      </Stack>
    </ListCard>
  );
}
