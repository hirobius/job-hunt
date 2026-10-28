// Today, the home page and one of the two top tabs (simplify #383 + amendment 2, Q6;
// docs/specs/simplify.md). Top to bottom: the auto-scan's status (Scan now, "Last scanned · N new
// from M sources"), Review new as the Browse list itself (a row opens the in-app preview, Open
// posting one tap away), Apply, Follow up (what is due, with dates, and what falls due this week)
// and the companies the scan found (Follow / Ignore). The read model is today.ts; this lays it out.
import { useState } from 'react';
import { Button, Stack, Text } from '@hirobius/design-system';
import { Search } from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { Onboarding } from './routeViews';
import { CardList, ListCard, Panel, PanelBody } from './PipelinePanel';
import { FollowUpButton } from './FollowUp';
import { MetaCaption } from './MetaCaption';
import { JobPostingTitle } from './PostingLink';
import { NewCompanies, ScanStatus } from './AutoScanViews';
import ReviewView from './ReviewView';
import { useActiveTrack } from './activeTrack';
import { useJobs, jobIdOf } from './store';
import { navigate, useRoute, withOrigin } from './route';
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
  const track = useActiveTrack();
  const now = new Date();
  // Review new counts its own postings (the Browse list below); Today only orders the page.
  const m = today(jobs, { newToday: null, sources: 0 }, now, lastApplyJobId());
  const { due, waiting, upcoming } = m.followUp;
  // No track yet (jobs saved before setup): Review new asks for one, with the same steps as a
  // first run, in place.
  const [choosing, setChoosing] = useState(false);
  if (!track && choosing) return <Onboarding />;

  return (
    <Stack gap="px24">
      <Stack gap="px8">
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
        <ScanStatus categoryId={track?.id} />
      </Stack>

      {/* Every design-system posting, newest first, as a list (the Deck is a toggle inside). */}
      {track ? (
        <ReviewView categoryId={track.id} label="Review new" />
      ) : (
        <Panel label="Review new" title="Review new">
          <PanelBody>
            <EmptyState
              centered
              icon={Search}
              title="Pick a track to search"
              description="A track holds your job titles, location and saved links."
              action={
                <Button variant="primary" onClick={() => setChoosing(true)}>
                  Choose a track
                </Button>
              }
            />
          </PanelBody>
        </Panel>
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

      <NewCompanies categoryId={track?.id} />
    </Stack>
  );
}

/** A due follow-up: the company (or title) with its posting one tap away, the day it fell due,
 *  and its one action. */
function DueRow({ job, now }: { job: Job; now: Date }) {
  const date = followUpDate(job, now);
  const name = job.company?.trim() || titleOf(job);
  return (
    <ListCard>
      <Stack direction="row" gap="px8" align="center" justify="space-between">
        <Stack gap="px4" align="start">
          <JobPostingTitle job={job}>
            <Text variant="body" as="span" weight="bold" className="rjb-card-title">
              {name}
            </Text>
          </JobPostingTitle>
          {date && (
            <Text variant="caption" as="span" tone="secondary">
              {`Due ${dayLabel(date, now)}`}
            </Text>
          )}
        </Stack>
        <FollowUpButton job={job} size="sm" />
      </Stack>
    </ListCard>
  );
}
