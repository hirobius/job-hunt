// The job page's header (#130; rev-3 mobile slice 2): Back, one badge row above the title (status,
// a due follow-up, Closed, then fit), the title, company · location · applied date, then one row of
// actions: the star, the job's one primary next step (it takes the row's room) and the menu of
// everything else (Remove included). The same column at every width. Back goes to the Pipeline.
// An Interviewing job's primary is Add interview (opens the Interviews tab); a job with no next
// step (Offer, Rejected, retired, applied and not yet due) has none, so Star and More sit together.
import { ArrowLeft } from 'lucide-react';
import { Box, Button, Icon, Stack, Text } from '@hirobius/design-system';
import { MetaCaption } from './MetaCaption';
import { shortDate } from './metaLines';
import { primaryAction, titleOf } from './jobRow';
import { openJob } from './route';
import { JobBadges, RowMenu, RowPrimaryAction, StarButton } from './JobRowParts';
import type { Job } from './types';

/** "← Pipeline": a quiet link-like button back to the list. Its name says where it goes. */
export function BackToPipeline() {
  return (
    // No inline-start padding, so the arrow sits on the page gutter like the title (rev-3).
    <Box>
      <Button
        className="rjb-back"
        variant="tertiary"
        size="md"
        iconLeft={<Icon icon={ArrowLeft} />}
        aria-label="Back to Pipeline"
        onClick={() => openJob(null)}
      >
        Pipeline
      </Button>
    </Box>
  );
}

export default function JobHeader({
  job,
  showBack = true,
  onAddInterview,
}: {
  job: Job;
  showBack?: boolean;
  /** Shows the Interviews tab: an Interviewing job's primary when it has no other next step. */
  onAddInterview?: () => void;
}) {
  const applied = job.applied ? shortDate(job.applied) : '';
  const next = primaryAction(job);
  const addInterview =
    !next && !job.archived && job.status === 'Interviewing' && onAddInterview ? (
      <Button variant="primary" size="md" onClick={onAddInterview}>
        Add interview
      </Button>
    ) : null;
  const primary = next ? <RowPrimaryAction job={job} variant="primary" size="md" /> : addInterview;
  return (
    <Box as="header" sx={{ mb: 'lg' }}>
      <Stack gap="normal">
        {showBack && <BackToPipeline />}
        <Stack gap="tight">
          <JobBadges job={job} />
          <Text variant="title" as="h2">
            {titleOf(job)}
          </Text>
          <MetaCaption
            items={[job.company?.trim(), job.location?.trim(), applied && `Applied ${applied}`]}
          />
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
          <RowMenu job={job} size="md" research onRemoved={() => openJob(null, true)} />
        </Box>
      </Stack>
    </Box>
  );
}
