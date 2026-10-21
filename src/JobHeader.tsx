// The job page's header (#130; rev-3 mobile slice 2): Back, one badge row above the title (fit
// first, then status and a due follow-up), the title, company and location, then one row of
// actions: the star, the job's one primary next step (it takes the row's room) and the menu of
// everything else (Remove included). The same column at every width. Back goes to the Pipeline.
import { ArrowLeft } from 'lucide-react';
import { Box, Button, Icon, MetaLine, Stack, Text } from '@hirobius/design-system';
import { titleOf } from './jobRow';
import { openJob } from './route';
import { JobBadges, RowMenu, RowPrimaryAction, StarButton } from './JobRowParts';
import type { Job } from './types';

/** "← Pipeline": a quiet link-like button back to the list. Its name says where it goes. */
export function BackToPipeline() {
  return (
    <Box>
      <Button
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

export default function JobHeader({ job, showBack = true }: { job: Job; showBack?: boolean }) {
  const company = job.company?.trim();
  const location = job.location?.trim();
  const meta = [company, location].filter((x): x is string => !!x);
  return (
    <Box as="header" sx={{ mb: 'sm' }}>
      <Stack gap="normal">
        {showBack && <BackToPipeline />}
        <Stack gap="tight">
          <JobBadges job={job} />
          <Text variant="title" as="h2">
            {titleOf(job)}
          </Text>
          {meta.length > 0 && (
            <Text variant="caption" as="div" tone="secondary">
              <MetaLine items={meta.length > 1 ? [meta[0], meta[1]] : [meta[0]]} />
            </Text>
          )}
        </Stack>
        {/* The primary takes the room between the two 40px icon buttons (rev-3 mock). */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 'xs' }}>
          <StarButton job={job} />
          <Box sx={{ flex: '1 1 0%', minWidth: 0, display: 'flex', '& > *': { flex: '1 1 0%' } }}>
            <RowPrimaryAction job={job} variant="primary" size="md" />
          </Box>
          <RowMenu job={job} size="md" onRemoved={() => openJob(null, true)} />
        </Box>
      </Stack>
    </Box>
  );
}
