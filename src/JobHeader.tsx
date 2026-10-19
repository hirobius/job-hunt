// The job page's header (#130): title and status, then the star, the job's one primary next step
// and the menu of everything else (Remove included). One row on a desktop, actions on the right;
// on a phone the actions sit in one row under the title. Back goes to the Pipeline.
import { ArrowLeft } from 'lucide-react';
import { Badge, Box, Button, Icon, Text } from '@hirobius/design-system';
import { titleOf } from './jobRow';
import { openJob } from './route';
import { RowMenu, RowPrimaryAction, StarButton, StatusBadge } from './JobRowParts';
import type { Job } from './types';

export default function JobHeader({ job, showBack = true }: { job: Job; showBack?: boolean }) {
  return (
    <Box as="header" sx={{ display: 'flex', flexDirection: 'column', gap: 'xs', mb: 'sm' }}>
      {showBack && (
        <Box>
          <Button
            variant="tertiary"
            size="sm"
            iconLeft={<Icon icon={ArrowLeft} />}
            onClick={() => openJob(null)}
          >
            Back to Pipeline
          </Button>
        </Box>
      )}
      {/* HDS sx has no base breakpoint (hds#652): the column base sits on the key and the row
          override nests under '&'. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'xs',
          '&': {
            flexDirection: { sm: 'row' },
            alignItems: { sm: 'center' },
            justifyContent: { sm: 'space-between' },
          },
        }}
      >
        <Box
          sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'xs', minWidth: 0 }}
        >
          <Text variant="title" as="h2">
            {titleOf(job)}
          </Text>
          <StatusBadge job={job} />
          {job.archived && <Badge tone="neutral">Retired</Badge>}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 'xs', flexShrink: 0 }}>
          <StarButton job={job} />
          <RowPrimaryAction job={job} variant="primary" />
          <RowMenu job={job} onRemoved={() => openJob(null, true)} />
        </Box>
      </Box>
    </Box>
  );
}
