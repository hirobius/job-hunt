// The pieces one Pipeline row is made of (#129), shared by the desktop table (JobsTable) and the
// phone cards (JobListCard): the status badge, the row's one primary action, and the menu that
// holds everything else. What a row offers is decided in jobRow.ts.
import { EllipsisVertical } from 'lucide-react';
import { Badge, Button, Icon, Menu } from '@hirobius/design-system';
import { logFollowUp, removeJob, setStatus, updateJob } from './store';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { primaryAction, STATUS_TONE, titleOf } from './jobRow';
import { normStatus } from './jobState';
import type { Job } from './types';

export function StatusBadge({ job }: { job: Job }) {
  const status = normStatus(job.status);
  return <Badge tone={STATUS_TONE[status]}>{job.archived ? 'Retired' : status}</Badge>;
}

/** The row's one next step, or nothing when there isn't one. */
export function PrimaryAction({ job }: { job: Job }) {
  const action = primaryAction(job);
  const title = titleOf(job);
  if (action === 'apply')
    return (
      <Button
        size="sm"
        variant="primary"
        aria-label={`Mark applied: ${title}`}
        onClick={() => setStatus(job.url, 'Applied')}
      >
        Mark applied
      </Button>
    );
  if (action === 'followup')
    return (
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Log follow-up: ${title}`}
        onClick={() => logFollowUp(job.url)}
      >
        Log follow-up
      </Button>
    );
  return null;
}

/** Everything else a row can do. */
export function RowMenu({ job }: { job: Job }) {
  const title = titleOf(job);
  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={EllipsisVertical} />}
          label={`More actions: ${title}`}
        />
      </Menu.Trigger>
      <Menu.Content align="end">
        <Menu.Item asChild>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Open posting
          </a>
        </Menu.Item>
        <Menu.Item onSelect={() => updateJob(job.url, { priority: !job.priority })}>
          {job.priority ? 'Unpin priority' : 'Pin as priority'}
        </Menu.Item>
        <Menu.Item onSelect={() => updateJob(job.url, { archived: !job.archived })}>
          {job.archived ? 'Unretire' : 'Retire'}
        </Menu.Item>
        <Menu.Separator />
        {/* Reverse interop (#57): seed Discover's Title search with this job's title. */}
        <Menu.Item
          onSelect={() => {
            setDiscoverSeed(title);
            navigate({ tab: 'discover', sub: 'titles' });
          }}
        >
          Find more like this
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          onSelect={() => removeJob(job.url)}
          style={{ color: 'var(--semantic-color-feedback-error)' }}
        >
          Remove
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
