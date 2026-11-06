// Apply mode (rapid apply, #/apply/<jobId>; rev-3 E, mobile slice 2): one job at a time from the
// To apply queue. One top row (Back to the Pipeline, and an HDS compact pager "‹ 1 of N ›"), the
// job's badges and title, Open application as the one primary, then Mark applied and Not a fit as
// one row of two. Below: the Apply sheet's templates (every Outreach message filled for the job,
// #239) and the Application kit, as panels of expandable rows (HDS Disclosure variant="row": a
// one-line preview, Copy beside it, the full text when open). Works one-handed on a phone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ExternalLink, ListChecks } from 'lucide-react';
import { Alert, Box, Button, Icon, Pagination, Stack, Text } from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { PageHeader } from '@hirobius/design-system/patterns';
import { BackToPipeline } from './JobHeader';
import { JobBadges } from './JobRowParts';
import { MetaCaption } from './MetaCaption';
import { statusAgo } from './jobState';
import { findJobById, jobIdOf, useJobs } from './store';
import { getRoute, goBack, navigate, openApply, type Route } from './route';
import { scrollToTop } from './scrollMemory';
import { titleOf } from './jobRow';
import { toApplyQueue } from './applyQueue';
import { followUpDate, respondByDate } from './jobEvents';
import { dayLabel } from './dayLabel';
import { usePageTitle } from './pageTitle';
import type { Job } from './types';
import { useArrived } from './feedback';
import { ApplicationKit, ApplyTemplates } from './ApplySheet';
import { markAppliedWithUndo, setAsideWithUndo } from './applyActions';

const PIPELINE: Route = { tab: 'queue', sub: null, pillar: null, jobId: null };
/** How long after a Not a fit another one is ignored (the second tap of a double tap). */
const DOUBLE_TAP_MS = 700;

export default function ApplyMode({ jobId }: { jobId: string | null }) {
  const jobs = useJobs();
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  const job = jobId ? findJobById(jobId, jobs) : undefined;
  usePageTitle(job ? `Apply: ${titleOf(job)}` : 'Apply');
  // Every job opened on this visit (Apply mode stays mounted from job to job; leaving it ends the
  // walk). Kept so a job applied to on the way still counts once you have moved on (QA).
  const [walked, setWalked] = useState<string[]>([]);
  if (job && !walked.includes(job.url)) setWalked([...walked, job.url]);
  // The pager walks the queue with this job, and the ones applied to on this walk, held in their
  // places: "2 of 3" stays put after Mark applied (the job leaves To apply), Next still means the
  // one after it, and the count holds as you go. A job set aside as Not a fit leaves the walk.
  const sequence = useMemo(() => {
    if (!job) return queue;
    const held = (j: Job) => j.url === job.url || (!j.archived && walked.includes(j.url));
    return toApplyQueue(
      jobs.map((j) => (held(j) ? { ...j, status: 'Saved', archived: false } : j)),
    );
  }, [jobs, job, queue, walked]);
  useEffect(() => scrollToTop(), [jobId]);
  // When the last Not a fit ran. The view is not keyed by job, so this outlives the job change.
  const lastNotAFit = useRef(0);
  // Mark applied here: the Applied note arrives with motion (not when a job opens applied).
  const applied = useArrived(!!job && job.status !== 'Saved', job?.url);

  if (!job) {
    return (
      <Stack gap="normal">
        <BackToPipeline />
        <EmptyState
          framed
          icon={ListChecks}
          title={queue.length ? 'Pick up where you left off' : 'To apply is empty'}
          description={
            queue.length
              ? `${queue.length} ${queue.length === 1 ? 'job is' : 'jobs are'} waiting to be applied to.`
              : 'Save postings from Review new on Find, or paste a link, then come back here to apply.'
          }
          action={
            queue.length ? (
              <Button variant="primary" onClick={() => openApply(jobIdOf(queue[0].url))}>
                Start applying
              </Button>
            ) : (
              // Never a dead end: the one action points to where jobs come from (rev-3 empty).
              <Button
                variant="secondary"
                onClick={() => navigate({ tab: 'today', sub: null, jobId: null })}
              >
                Review new postings
              </Button>
            )
          }
        />
      </Stack>
    );
  }

  const idx = sequence.findIndex((j) => j.url === job.url);
  const others = queue.filter((j) => j.url !== job.url);
  // After this one: the next job still to apply to, else the first, else back to where Apply mode
  // was opened from (the Pipeline). In place: Back skips a job set aside (return paths).
  const next = sequence.slice(idx + 1).find((j) => others.includes(j)) ?? others[0] ?? undefined;
  const goNext = () => (next ? openApply(jobIdOf(next.url), true) : goBack(PIPELINE));

  const markApplied = () => markAppliedWithUndo(job);
  const notAFit = () => {
    // A double tap's second tap lands on the next job's Not a fit, which renders under the finger.
    // Ignore Not a fit for a moment after one runs, so a double tap sets aside one job.
    const now = Date.now();
    if (now - lastNotAFit.current < DOUBLE_TAP_MS) return;
    lastNotAFit.current = now;
    const id = jobIdOf(job.url);
    // Undo puts the job back in To apply and reopens it here, at its place in the walk.
    setAsideWithUndo(job, () => openApply(id, getRoute().tab === 'apply'));
    goNext();
  };

  const company = job.company?.trim();
  // rev-3 B: company · location · the applied date once applied, else when it was saved.
  const when = statusAgo(job);
  const now = new Date();
  const dueOn = followUpDate(job, now);
  // A saved solicitation's deadline is a day to respond by, not to follow up on (#308).
  const respondBy = respondByDate(job, now);
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="normal">
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <BackToPipeline />
          {/* Hug the right edge: the pager is only as wide as its three parts. */}
          <Box sx={{ flex: '0 0 auto' }}>
            {sequence.length > 1 ? (
              <Pagination
                variant="compact"
                label="Jobs to apply"
                page={idx + 1}
                count={sequence.length}
                // In place: one Back leaves Apply mode, not every job paged through.
                onPageChange={(p) => openApply(jobIdOf(sequence[p - 1].url), true)}
              />
            ) : (
              <OnlyPage label="Jobs to apply" />
            )}
          </Box>
        </Stack>
        <PageHeader
          level={1}
          metadata={<JobBadges job={job} />}
          title={titleOf(job)}
          description={
            job.company || job.location || when || respondBy ? (
              // PageHeader wraps the description in a <p>: a span keeps the HTML valid.
              <MetaCaption
                as="span"
                items={[
                  company,
                  job.location?.trim(),
                  when,
                  respondBy && `Apply by ${dayLabel(respondBy, now)}`,
                ]}
              />
            ) : undefined
          }
        />
        <Box sx={{ display: 'flex', '& > *': { flex: '1 1 0%' } }}>
          <Button asChild variant="primary" size="md">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              <Icon icon={ExternalLink} />
              Open application
            </a>
          </Button>
        </Box>

        {job.status === 'Saved' ? (
          // One row of two equal secondaries under the primary (rev-3 E).
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'xs' }}>
            <Button
              variant="secondary"
              size="md"
              iconLeft={<Icon icon={Check} />}
              onClick={markApplied}
            >
              Mark applied
            </Button>
            <Button variant="secondary" size="md" onClick={notAFit}>
              Not a fit
            </Button>
          </Box>
        ) : (
          // A short title (the body step inside .rjb-inline-alerts); the company and the date,
          // written as the Pipeline writes it, go in the body.
          <Box className={applied ? 'rjb-inline-alerts rjb-arrive' : 'rjb-inline-alerts'}>
            <Alert tone="success" title="Applied">
              {[
                company ? `Applied to ${company}.` : '',
                "It's under Follow up in the Pipeline.",
                dueOn ? `Follow up on ${dayLabel(dueOn, now)}.` : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </Alert>
          </Box>
        )}
        {job.status !== 'Saved' && !next && (
          <Box>
            <Button variant="secondary" size="md" onClick={() => goBack(PIPELINE)}>
              To apply is empty · back to Pipeline
            </Button>
          </Box>
        )}

        <ApplyTemplates job={job} />
        <ApplicationKit job={job} />
      </Stack>
    </Box>
  );
}

const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;

/** The compact pager for a walk of one: "1 of 1" with both arrows off. HDS Pagination draws nothing
 *  for a single page, and the top row would change shape when the last job is left (QA). Same
 *  parts as HDS's compact pager (tertiary sm icon buttons around the ui-size count). */
function OnlyPage({ label }: { label: string }) {
  return (
    <nav aria-label={label}>
      <Stack as="ul" direction="row" gap="px4" align="center" style={LIST}>
        <li>
          <Button
            iconOnly
            size="sm"
            variant="tertiary"
            label="Previous page"
            disabled
            iconLeft={<Icon icon={ChevronLeft} size="small" />}
          />
        </li>
        <li>
          <Text variant="ui" as="span">
            1 of 1
          </Text>
        </li>
        <li>
          <Button
            iconOnly
            size="sm"
            variant="tertiary"
            label="Next page"
            disabled
            iconLeft={<Icon icon={ChevronRight} size="small" />}
          />
        </li>
      </Stack>
    </nav>
  );
}
