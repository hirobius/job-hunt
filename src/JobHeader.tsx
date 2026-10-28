// The job page's header (#130; rev-3 mobile slice 2): Back, one badge row above the title (status,
// a due follow-up, Closed, then fit), the title with its posting link beside it, company ·
// location · applied date, then one row of actions: the star, the job's one primary next step (it
// takes the row's room) and the menu of everything else (Remove included). The same column at
// every width. Back goes to the page the job was opened from (the Pipeline by default).
// An Interviewing job's primary is Add interview (opens its dialog, #416); a job with no next
// step (Offer, Rejected, retired, applied and not yet due) has none, so Star and More sit together.
import { Box, Button, Stack, Text } from '@hirobius/design-system';
import { MetaCaption } from './MetaCaption';
import { dateLabel } from './jobDates';
import { primaryAction, titleOf } from './jobRow';
import { goBack, type Route } from './route';
import BackLink from './BackLink';
import { checkFor, useLiveness } from './livenessStore';
import { JobBadges, RowMenu, RowPrimaryAction, StarButton } from './JobRowParts';
import { JobPostingTitle } from './PostingLink';
import { openAddInterview } from './jobDialogs';
import type { Job } from './types';
import CompanyLogo from './CompanyLogo';

const PIPELINE: Route = { tab: 'queue', sub: null, pillar: null, jobId: null };

/** "← Pipeline": a quiet link-like button back to where the page was opened from (return paths):
 *  the Pipeline by default, else the page that opened it, by name ("← Companies", "← Acme
 *  Metals"). Its name says where it goes. Apply mode uses it too. */
export function BackToPipeline() {
  return <BackLink as="button" className="rjb-back" fallback={PIPELINE} fallbackLabel="Pipeline" />;
}

export default function JobHeader({ job, showBack = true }: { job: Job; showBack?: boolean }) {
  // One date per job (Adrian 2026-10-28): posted, else found. Applied lives in the facts.
  const when = dateLabel(job);
  const next = primaryAction(job);
  const addInterview =
    !next && !job.archived && job.status === 'Interviewing' ? (
      <Button variant="primary" size="md" onClick={() => openAddInterview(job.url)}>
        Add interview
      </Button>
    ) : null;
  const primary = next ? <RowPrimaryAction job={job} variant="primary" size="md" /> : addInterview;
  // A job closed on the board was opened to clear it out: retiring it goes back to where it was
  // opened from (the Pipeline's closed list), like Remove does for any job.
  const closed = checkFor(useLiveness(), job.url)?.state === 'closed';
  return (
    <Box as="header" sx={{ mb: 'lg' }}>
      <Stack gap="normal">
        {showBack && <BackToPipeline />}
        <Stack gap="tight">
          <JobBadges job={job} />
          {/* The posting is one tap from the title (Adrian 2026-10-22), quiet beside it: the
              header's one primary stays the next step. */}
          <JobPostingTitle job={job} size="md">
            <Text variant="title" as="h2">
              {titleOf(job)}
            </Text>
          </JobPostingTitle>
          <Stack direction="row" gap="px8" align="center">
            {job.company?.trim() && <CompanyLogo company={job.company} postings={[job.url]} />}
            <MetaCaption items={[job.company?.trim(), job.location?.trim(), when]} />
          </Stack>
        </Stack>
        {/* On a phone the primary takes the room between the two 40px icon buttons (rev-3
            mock); from sm up it is as wide as its label. No primary, no slot: no hole. */}
        <Box data-rjb-actions="" sx={{ display: 'flex', alignItems: 'center', gap: 'xs' }}>
          <StarButton job={job} />
          {primary && (
            <Box
              sx={{
                flex: { base: '1 1 0%', sm: '0 0 auto' },
                minWidth: 0,
                display: 'flex',
                '& > *': { flex: '1 1 0%' },
              }}
            >
              {primary}
            </Box>
          )}
          <RowMenu
            job={job}
            size="md"
            research
            onRemoved={() => goBack(PIPELINE)}
            onRetired={closed ? () => goBack(PIPELINE) : undefined}
          />
        </Box>
      </Stack>
    </Box>
  );
}
