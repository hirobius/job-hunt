// The pieces one job row is made of (#129), shared by the desktop table (JobsTable), the phone
// cards (JobListCard) and the job page's header (JobHeader): the status badge, the row's one next
// step, and the menu that holds everything else. What a row offers is decided in jobRow.ts.
import { EllipsisVertical } from 'lucide-react';
import { Badge, Button, Icon, Menu } from '@hirobius/design-system';
import { hostOf, removeJob, setStatus, updateJob } from './store';
import { FollowUpButton } from './FollowUp';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { primaryAction, STATUS_TONE, titleOf } from './jobRow';
import { normStatus } from './jobState';
import { STATUSES, type Job, type Status } from './types';

/** Controls on a phone card are 40px tap targets; the denser table uses the small size. */
type Size = 'sm' | 'md';

/** The job's Status. A retired job keeps its status, greyed (Retired is not a Status). */
export function StatusBadge({ job }: { job: Job }) {
  const status = normStatus(job.status);
  return <Badge tone={job.archived ? 'neutral' : STATUS_TONE[status]}>{status}</Badge>;
}

/** The row's one next step, or nothing when there isn't one. Secondary, so the page's own
 *  primary action (Add job) stays the only filled button on the screen. */
export function RowPrimaryAction({
  job,
  size = 'sm',
  variant = 'secondary',
}: {
  job: Job;
  size?: Size;
  /** The job page's header makes this its one primary action. */
  variant?: 'primary' | 'secondary';
}) {
  const action = primaryAction(job);
  const title = titleOf(job);
  if (action === 'apply')
    return (
      <Button
        size={size}
        variant={variant}
        aria-label={`Mark applied: ${title}`}
        onClick={() => setStatus(job.url, 'Applied')}
      >
        Mark applied
      </Button>
    );
  if (action === 'followup') return <FollowUpButton job={job} size={size} variant={variant} />;
  return null;
}

/** Everything else a row can do. */
export function RowMenu({
  job,
  size = 'sm',
  canRemove = true,
}: {
  job: Job;
  size?: Size;
  /** The job page puts Remove in its own confirmed section instead (#130). */
  canRemove?: boolean;
}) {
  const title = titleOf(job);
  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button
          size={size}
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={EllipsisVertical} />}
          label={`More actions: ${title}`}
        />
      </Menu.Trigger>
      <Menu.Content align="end">
        <Menu.Item asChild>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Open on {hostOf(job.url) || 'the original site'}
          </a>
        </Menu.Item>
        {/* Every stage is one tap from the row: Interviewing, Offer and Rejected included. */}
        <Menu.Label>Status</Menu.Label>
        <Menu.RadioGroup
          value={normStatus(job.status)}
          onValueChange={(v) => setStatus(job.url, v as Status)}
        >
          {STATUSES.map((st) => (
            <Menu.RadioItem key={st} value={st}>
              {st}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
        <Menu.Separator />
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
        {canRemove && (
          <>
            <Menu.Separator />
            {/* HDS Menu.Item has no danger tone; the feedback token marks the destructive item. */}
            <Menu.Item
              onSelect={() => removeJob(job.url)}
              style={{ color: 'var(--semantic-color-feedback-error)' }}
            >
              Remove
            </Menu.Item>
          </>
        )}
      </Menu.Content>
    </Menu>
  );
}
