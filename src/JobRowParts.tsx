// The pieces one job row is made of (#129), shared by the Pipeline's job cards (JobListCard) and the job page's header (JobHeader): the status badge, the row's one next
// step, and the menu that holds everything else. What a row offers is decided in jobRow.ts.
import { useRef } from 'react';
import { Check, Ellipsis } from 'lucide-react';
import { Badge, Box, Button, Icon, Menu, Stack } from '@hirobius/design-system';
import { setStatus, updateJob } from './store';
import { removeWithUndo } from './saveNotice';
import { changeWithUndo } from './jobUndo';
import { exitRow } from './feedback';
import { FollowUpButton } from './FollowUp';
import { openFollowUp } from './followUpFlow';
import { openAddInterview } from './jobDialogs';
import { closingOf } from './jobDates';
import { primaryAction, rowView, titleOf } from './jobRow';
import { normStatus } from './jobState';
import { researchLinks } from './jobFacts';
import { STATUSES, type Job, type Status } from './types';
import { useBackSheet } from './useBackCloses';

/** Controls on a phone card are 40px tap targets; the denser table uses the small size. */
type Size = 'sm' | 'md';

/** The job's Status. Neutral everywhere (rev-3 B): the table, the rail, the Company page and the
 *  badge row all reserve colour for what needs attention (a due follow-up). */
export function StatusBadge({ job }: { job: Job }) {
  return <Badge tone="neutral">{normStatus(job.status)}</Badge>;
}

/** One badge row above a job's title: status (not Saved), Retired, a due follow-up and the closing
 *  date (#360). Status is neutral; only what needs attention is a warning. No fit chip and no star
 *  (#534, #538). Pipeline cards, the rail and the Company page share it. */
export function JobBadges({ job }: { job: Job }) {
  const row = rowView(job);
  // The closing date (#419), from the synced job (closedAt, deadline), so it matches the filters.
  const closing = closingOf(job);
  return (
    <Stack direction="row" wrap="wrap" gap="px8" align="center">
      {/* No fit chips and no Saved chip (#538): every job here is saved, and fit is not a status. */}
      {normStatus(job.status) !== 'Saved' && <StatusBadge job={job} />}
      {row.retired && <Badge>Retired</Badge>}
      {row.followUp?.due && <Badge tone="warning">Follow-up due</Badge>}
      {closing && (
        <Badge tone={closing.kind === 'soon' ? 'warning' : 'neutral'}>{closing.label}</Badge>
      )}
    </Stack>
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
        onClick={(e) =>
          changeWithUndo(
            job,
            'Marked applied · Follow up in 7 days',
            () => setStatus(job.url, 'Applied'),
            e.currentTarget,
          )
        }
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
  onRetired,
  research = false,
}: {
  job: Job;
  size?: Size;
  /** Runs after Remove (the job page goes back to where it was opened from); Undo then reopens
   *  the page as it was. */
  onRemoved?: () => void;
  /** Runs after Retire (a closed job's page goes back where it was opened from). */
  onRetired?: () => void;
  /** The job page's menu also holds the research links (rev-3 review: off the Details panel). */
  research?: boolean;
}) {
  const title = titleOf(job);
  // The row the menu sits in, for its feedback: a flash on a change, a collapse on Remove.
  const anchor = useRef<HTMLButtonElement>(null);
  // The browser's Back closes the open menu and stays on the page (return paths).
  const sheet = useBackSheet(`job-menu:${job.url}`);
  return (
    // Non-modal, so Add interview's dialog opens cleanly from an item: a modal menu plus a dialog
    // left the page unclickable (as the Account menu and the editor menus found).
    <Menu modal={false} {...sheet}>
      <Menu.Trigger asChild>
        {/* A bordered 40px button on a phone card (rev-3 mock); quiet in the dense table. */}
        <Button
          ref={anchor}
          size={size}
          variant={size === 'md' ? 'secondary' : 'tertiary'}
          iconOnly
          iconLeft={<Icon icon={Ellipsis} />}
          label={`More actions: ${title}`}
        />
      </Menu.Trigger>
      <Menu.Content align="end">
        {/* "Open posting", not the host: a long domain would widen the menu (rev-3 mock). */}
        <Menu.Item asChild>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Open posting
          </a>
        </Menu.Item>
        {/* Every stage is one tap from the row: Interviewing, Offer and Rejected included. Plain
            items on the menu's one inset (rev-3 mock): HDS RadioItem keeps a left gutter for its
            dot, which left the menu with two left edges. The current stage gets a trailing
            check, and the items keep the radio semantics (menuitemradio + aria-checked). */}
        <Menu.Label>Status</Menu.Label>
        <Menu.Group role="group" aria-label="Status">
          {STATUSES.map((st) => {
            const on = normStatus(job.status) === st;
            return (
              <Menu.Item
                key={st}
                role="menuitemradio"
                aria-checked={on}
                onSelect={() => {
                  if (!on)
                    changeWithUndo(
                      job,
                      `Moved to ${st}`,
                      () => setStatus(job.url, st as Status),
                      anchor.current,
                    );
                }}
              >
                <Box as="span" sx={{ flex: '1 1 auto' }}>
                  {st}
                </Box>
                {on && <Icon icon={Check} size={16} aria-hidden />}
              </Menu.Item>
            );
          })}
        </Menu.Group>
        <Menu.Separator />
        {/* The Interviews log left the job page (#416); booking one stays here, so its date
            feeds Next 7 days and the follow-up clock. */}
        <Menu.Item onSelect={() => openAddInterview(job.url, anchor.current)}>
          Add interview…
        </Menu.Item>
        {/* A due follow-up's dialog (edit the message, snooze): the dock copies it (#540). */}
        {primaryAction(job) === 'followup' && (
          <Menu.Item onSelect={() => openFollowUp(job.url)}>Follow up…</Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          onSelect={() => {
            changeWithUndo(
              job,
              job.archived ? 'Unretired' : 'Retired',
              () => updateJob(job.url, { archived: !job.archived }),
              anchor.current,
            );
            if (!job.archived) onRetired?.();
          }}
        >
          {job.archived ? 'Unretire' : 'Retire'}
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
        {/* Remove goes to Recently removed, with Undo, so it needs no confirm. A list row
            collapses first (#212); the job page goes back to the list at once. Undo puts the
            job back and stays on the page it is pressed on (#593). */}
        <Menu.Item
          onSelect={() => {
            if (onRemoved) {
              removeWithUndo(job);
              onRemoved();
            } else exitRow(anchor.current, 'burn', () => removeWithUndo(job));
          }}
          tone="danger"
        >
          Remove from Apply
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
