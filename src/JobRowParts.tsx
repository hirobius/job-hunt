// The pieces one job row is made of (#129), shared by the desktop table (JobsTable), the phone
// cards (JobListCard) and the job page's header (JobHeader): the status badge, the row's one next
// step, and the menu that holds everything else. What a row offers is decided in jobRow.ts.
import { Ellipsis, Star } from 'lucide-react';
import {
  Badge,
  Button,
  Icon,
  Menu,
  Stack,
  VisuallyHidden,
  useToast,
} from '@hirobius/design-system';
import { hostOf, setStatus, updateJob } from './store';
import { removeWithUndo } from './saveNotice';
import { checkFor, useLiveness } from './livenessStore';
import { FollowUpButton } from './FollowUp';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { primaryAction, rowView, titleOf } from './jobRow';
import { normStatus } from './jobState';
import { researchLinks } from './jobFacts';
import { STATUSES, type Job, type Status } from './types';

/** Controls on a phone card are 40px tap targets; the denser table uses the small size. */
type Size = 'sm' | 'md';

/** The job's Status. Neutral everywhere (rev-3 B): the table, the rail, the Company page and the
 *  badge row all reserve colour for what needs attention (a due follow-up). */
export function StatusBadge({ job }: { job: Job }) {
  return <Badge tone="neutral">{normStatus(job.status)}</Badge>;
}

/** One badge row above a job's title (rev-3 B order): status, Retired, a due follow-up, Closed on
 *  the board, then fit, and the star on a card. Status and fit are neutral; only what needs
 *  attention is a warning. Pipeline cards, the job page and Apply mode share it. */
export function JobBadges({ job, star = false }: { job: Job; star?: boolean }) {
  const row = rowView(job);
  const closed = checkFor(useLiveness(), job.url)?.state === 'closed';
  return (
    <Stack direction="row" wrap="wrap" gap="px8" align="center">
      <StatusBadge job={job} />
      {row.retired && <Badge>Retired</Badge>}
      {row.followUp?.due && <Badge tone="warning">Follow-up due</Badge>}
      {closed && <Badge tone="warning">Closed on the board</Badge>}
      {row.verdict && <Badge tone="neutral">{row.verdict.label}</Badge>}
      {star && row.pinned && (
        <>
          <StarIcon on />
          <VisuallyHidden>Starred</VisuallyHidden>
        </>
      )}
    </Stack>
  );
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

/** The job page's star toggle: a 40px icon button named Star or Starred, so the state reads
 *  from its name and the filled icon. The name carries the state, so there is no aria-pressed
 *  (both would announce it twice). */
export function StarButton({ job }: { job: Job }) {
  const toggle = useToggleStar();
  const on = !!job.priority;
  return (
    <Button
      size="md"
      variant="secondary"
      iconOnly
      iconLeft={<StarIcon on={on} />}
      label={on ? 'Starred' : 'Star'}
      onClick={() => toggle(job)}
    />
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
  research = false,
}: {
  job: Job;
  size?: Size;
  /** Runs after Remove (the job page goes back to the Pipeline). */
  onRemoved?: () => void;
  /** The job page's menu also holds the research links (rev-3 review: off the Details panel). */
  research?: boolean;
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
        {research && (
          <>
            <Menu.Separator />
            <Menu.Label>Research</Menu.Label>
            {researchLinks(job.label).map(([name, href]) => (
              <Menu.Item key={name} asChild>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {name}
                </a>
              </Menu.Item>
            ))}
          </>
        )}
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
