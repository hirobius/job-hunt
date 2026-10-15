// The job page's header (#130): title, status, pin, the job's one primary next step and the menu
// of everything else. Back goes to the Pipeline.
import { ArrowLeft, Star } from 'lucide-react';
import { Badge, Button, Icon, Stack } from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import { updateJob } from './store';
import { titleOf } from './jobRow';
import { openJob } from './route';
import { RowMenu, RowPrimaryAction, StatusBadge } from './JobRowParts';
import type { Job } from './types';

export default function JobHeader({ job, showBack = true }: { job: Job; showBack?: boolean }) {
  return (
    <PageHeader
      level={2}
      breadcrumb={
        showBack ? (
          <Button
            variant="tertiary"
            size="sm"
            iconLeft={<Icon icon={ArrowLeft} />}
            onClick={() => openJob(null)}
          >
            Back to Pipeline
          </Button>
        ) : undefined
      }
      title={titleOf(job)}
      status={
        <Stack direction="row" gap="tight" align="center">
          <StatusBadge job={job} />
          {job.archived && <Badge tone="neutral">Retired</Badge>}
        </Stack>
      }
      actions={
        <Stack direction="row" wrap="wrap" gap="tight" align="center">
          <Button
            size="sm"
            variant="tertiary"
            iconOnly
            iconLeft={<Icon icon={Star} />}
            label={job.priority ? 'Unpin priority' : 'Pin as priority'}
            aria-pressed={!!job.priority}
            onClick={() => updateJob(job.url, { priority: !job.priority })}
            style={job.priority ? { color: 'var(--semantic-accent-rest)' } : undefined}
          />
          <RowPrimaryAction job={job} variant="primary" />
          <RowMenu job={job} />
        </Stack>
      }
      style={{ marginBottom: 'var(--primitive-space-4)' }}
    />
  );
}
