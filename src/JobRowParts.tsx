// The pieces one job row is made of (#129), shared by the desktop table (JobsTable), the phone
// cards (JobListCard) and the job page's header (JobHeader): the status badge, the row's one next
// step, and the menu that holds everything else. What a row offers is decided in jobRow.ts.
import { Ellipsis, Star } from 'lucide-react';
import { Badge, Button, Icon, Menu, useToast } from '@hirobius/design-system';
import { hostOf, setStatus, updateJob } from './store';
import { removeWithUndo } from './saveNotice';
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

/** The star: outline when off, filled when on. */
export function StarIcon({ on }: { on: boolean }) {
  return <Icon icon={Star} size="small" className={on ? 'rjb-icon-filled' : undefined} />;
}

/** Star or unstar a job; starring says where starred jobs show. */
function useToggleStar() {
  const { toast } = useToast();
  return (job: Job) => {
    updateJob(job.url, { priority: !job.priority });
    if (!job.priority) toast({ title: 'Starred', description: 'Shows first in your Pipeline' });
  };
}

/** The job page's star toggle: says Star or Starred, so the state reads without the icon. The
 *  text carries the state, so there is no aria-pressed (both would announce it twice). */
export function StarButton({ job }: { job: Job }) {
  const toggle = useToggleStar();
  const on = !!job.priority;
  return (
    <Button
      size="sm"
      variant="tertiary"
      iconLeft={<StarIcon on={on} />}
      onClick={() => toggle(job)}
    >
      {on ? 'Starred' : 'Star'}
    </Button>
  );
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
  onRemoved,
}: {
  job: Job;
  size?: Size;
  /** Runs after Remove (the job page goes back to the Pipeline). */
  onRemoved?: () => void;
}) {
  const title = titleOf(job);
  const toggleStar = useToggleStar();
  return (
    <Menu>
      <Menu.Trigger asChild>
        {/* A bordered 40px button on a phone card (rev-3 mock); quiet in the dense table. */}
        <Button
          size={size}
          variant={size === 'md' ? 'secondary' : 'tertiary'}
          iconOnly
          iconLeft={<Icon icon={Ellipsis} />}
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
        <Menu.Item onSelect={() => toggleStar(job)}>{job.priority ? 'Unstar' : 'Star'}</Menu.Item>
        <Menu.Item onSelect={() => updateJob(job.url, { archived: !job.archived })}>
          {job.archived ? 'Unretire' : 'Retire'}
        </Menu.Item>
        <Menu.Separator />
        {/* Reverse interop (#57): seed Discover's search links (ATS tool) with this job's title. */}
        <Menu.Item
          onSelect={() => {
            setDiscoverSeed(title);
            navigate({ tab: 'discover', sub: 'ats' });
          }}
        >
          Find more like this
        </Menu.Item>
        <Menu.Separator />
        {/* Remove goes to Recently removed, with Undo, so it needs no confirm. */}
        <Menu.Item
          onSelect={() => {
            removeWithUndo(job);
            onRemoved?.();
          }}
          tone="danger"
        >
          Remove
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
