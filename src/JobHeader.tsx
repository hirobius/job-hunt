// The job page's header (#130): title and status, then the star, the job's one primary next step
// and the menu of everything else (Remove included). One row on a desktop, actions on the right;
// on a phone the actions sit in one row under the title. Back goes to the Pipeline.
import { ArrowLeft } from 'lucide-react';
import { Badge, Box, Button, Icon, Text } from '@hirobius/design-system';
import { titleOf } from './jobRow';
import { openJob } from './route';
import { RowMenu, RowPrimaryAction, StarButton, StatusBadge } from './JobRowParts';
import { useDocuments } from './documents';
import { documentsForJob, sentSummary } from './jobDocuments';
import type { Job } from './types';

export default function JobHeader({ job, showBack = true }: { job: Job; showBack?: boolean }) {
  // What went out to this job (#228): one quiet line, only once something was marked Sent.
  const sent = sentSummary(documentsForJob(useDocuments(), job.url));
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
      {/* Mobile-first: a column that becomes a row from sm. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { base: 'column', sm: 'row' },
          alignItems: { base: 'stretch', sm: 'center' },
          justifyContent: { base: 'flex-start', sm: 'space-between' },
          gap: 'xs',
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
      {sent && (
        <Text variant="caption" as="p" tone="secondary">
          {`Sent: ${sent}`}
        </Text>
      )}
    </Box>
  );
}
