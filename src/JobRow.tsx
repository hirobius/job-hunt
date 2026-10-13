// One saved job at rest, built phone-first for glancing (21st.dev list-item pattern, docs/design P5).
//
//   [avatar] [title (2 lines)                        ⋮]
//            company — location
//            [status] [next-step pill] [pin]
//            [ONE primary button from nextAction()]
//
// Only what decides "do I act on this now?" renders here. Everything else lives on the job's own
// page — the whole card opens it. No status rail: the filter already groups by status.
import { EllipsisVertical, Star } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Box, Button, Card, Icon, Menu, Text } from '@hirobius/design-system';
import { updateJob, setStatus, removeJob, logFollowUp, prettyTitle, hostOf } from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { monogram } from './monogram';
import { jobHref } from './jobRoute';
import { STATUS_TONE, timingLabel } from './jobDisplay';
import { nextAction, NEXT_ACTION_LABEL } from './nextAction';
import { Sheet, SheetMenu } from './Sheet';
import type { Job } from './types';

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;

export function JobAvatar({ job, size = 'md' }: { job: Job; size?: 'sm' | 'md' | 'lg' }) {
  const host = hostOf(job.url);
  return (
    <Avatar
      size={size}
      alt={job.company || host || 'Job'}
      initials={monogram(job.company, host, job.label || prettyTitle(job.url))}
      aria-hidden
    />
  );
}

export function JobActionsMenu({ job }: { job: Job }) {
  const s = deriveJobState(job);
  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={EllipsisVertical} />}
          label="More actions"
        />
      </Menu.Trigger>
      <Menu.Content align="end">
        <Menu.Item onSelect={() => window.open(job.url, '_blank', 'noopener')}>
          Open posting
        </Menu.Item>
        {s.isApplyable && (
          <Menu.Item onSelect={() => setStatus(job.url, 'Applied')}>Mark applied</Menu.Item>
        )}
        <Menu.Item onSelect={() => updateJob(job.url, { priority: !job.priority })}>
          {job.priority ? 'Unpin priority' : 'Pin as priority'}
        </Menu.Item>
        <Menu.Item onSelect={() => updateJob(job.url, { archived: !job.archived })}>
          {job.archived ? 'Unretire' : 'Retire'}
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          onSelect={() => {
            setDiscoverSeed(job.label || prettyTitle(job.url));
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

/** Run the card's primary action for a job (shared with tests and the job page's wiring). */
export function runNextAction(job: Job) {
  switch (nextAction(job)) {
    case 'apply':
      return setStatus(job.url, 'Applied');
    case 'followup':
      return logFollowUp(job.url);
    case 'interview':
      return navigate({ tab: 'queue', sub: encodeURIComponent(job.url) });
    case 'reopen':
      return updateJob(job.url, {
        archived: false,
        ...(job.status === 'Rejected' ? { status: 'Saved' as const } : {}),
      });
  }
}

/** The ⋮ sheet for one card: titled with the job, one tap per action. */
function RowSheet({
  job,
  open,
  onOpenChange,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const title = job.label || prettyTitle(job.url);
  const where = [job.company, job.location].filter(Boolean).join(' \u2014 ') || hostOf(job.url);
  const close = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={where}>
      <SheetMenu
        label={`Actions for ${title}`}
        items={[
          {
            label: 'Open job page',
            onSelect: close(() => navigate({ tab: 'queue', sub: encodeURIComponent(job.url) })),
          },
          {
            label: 'Open posting',
            onSelect: close(() => window.open(job.url, '_blank', 'noopener')),
          },
          {
            label: job.priority ? 'Unpin priority' : 'Pin as priority',
            onSelect: close(() => updateJob(job.url, { priority: !job.priority })),
          },
          {
            label: 'Find more like this',
            onSelect: close(() => {
              setDiscoverSeed(job.label || prettyTitle(job.url));
              navigate({ tab: 'discover', sub: 'titles' });
            }),
          },
          {
            label: job.archived ? 'Unarchive' : 'Archive',
            onSelect: close(() => updateJob(job.url, { archived: !job.archived })),
          },
          { label: 'Remove', tone: 'danger', onSelect: close(() => removeJob(job.url)) },
        ]}
      />
    </Sheet>
  );
}

export default function JobRow({ job }: { job: Job }) {
  const s = deriveJobState(job);
  const [menuOpen, setMenuOpen] = useState(false);
  const title = job.label || prettyTitle(job.url);
  const sub = [job.company, job.location].filter(Boolean).join(' \u2014 ') || hostOf(job.url);
  const timing = timingLabel(job);
  const action = nextAction(job);

  return (
    <Card bordered padding="none" style={{ opacity: job.archived ? 0.55 : 1 }}>
      <Box
        sx={{
          position: 'relative',
          display: 'grid',
          alignItems: 'start',
          columnGap: 3,
          p: 4,
          gridTemplateColumns: 'var(--primitive-space-10) minmax(0, 1fr) auto',
          // Stretched link: the whole card opens the job page; real controls sit above it.
          '& .job-open': {
            color: 'content.primary',
            textDecoration: 'none',
            lineHeight: 1.3,
            minWidth: 0,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: '2',
          },
          '& .job-open:focus-visible': { outline: 'medium solid var(--semantic-accent-rest)' },
          '& .job-open::after': { content: '""', position: 'absolute', inset: 0 },
          '& .job-ctl': { position: 'relative', zIndex: 1 },
        }}
      >
        <Box sx={{ display: 'flex' }}>
          <JobAvatar job={job} />
        </Box>

        <Box sx={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <a href={jobHref(job.url)} className="job-open">
              <Text variant="ui" as="span" style={{ fontWeight: 600, color: 'inherit' }}>
                {title}
              </Text>
            </a>
            <Text
              variant="caption"
              as="p"
              style={{
                ...muted,
                margin: '2px 0 0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {sub}
            </Text>
          </Box>

          <Box
            sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, minWidth: 0 }}
          >
            <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
            {timing && <Badge tone={s.followUp.due ? 'warning' : 'neutral'}>{timing}</Badge>}
            {job.priority && (
              <Star
                size={14}
                aria-label="Priority"
                fill="currentColor"
                style={{ color: 'var(--semantic-accent-rest)', flex: 'none' }}
              />
            )}
          </Box>

          <Box className="job-ctl" sx={{ justifySelf: 'start' }}>
            <Button
              size="sm"
              variant={action === 'followup' || action === 'reopen' ? 'secondary' : 'primary'}
              tone={s.followUp.due && action === 'followup' ? 'warning' : undefined}
              onClick={() => runNextAction(job)}
            >
              {NEXT_ACTION_LABEL[action]}
            </Button>
          </Box>
        </Box>

        <Box className="job-ctl" sx={{ justifySelf: 'end', mt: -1 }}>
          <Button
            size="sm"
            variant="tertiary"
            iconOnly
            iconLeft={<Icon icon={EllipsisVertical} />}
            label={`Actions for ${title}`}
            onClick={() => setMenuOpen(true)}
          />
        </Box>
        <RowSheet job={job} open={menuOpen} onOpenChange={setMenuOpen} />
      </Box>
    </Card>
  );
}
