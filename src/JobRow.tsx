// One saved job at rest, built phone-first for glancing (21st.dev list-item pattern, docs/design P5).
//
//   phone            [avatar] [title (2 lines) / company · location]   [⋮]
//                             [status · timing]
//                             [next action]
//   ≥ 640px          [avatar] [title / company · location] [status · timing] [next action] [⋮]
//
// Only what decides "do I act on this now?" renders here. Everything else lives on the job's own
// page — the whole row opens it. No status rail: the filter already groups by status.
import { EllipsisVertical, Star } from 'lucide-react';
import { Avatar, Badge, Box, Button, Card, Icon, Menu, Text } from '@hirobius/design-system';
import { updateJob, setStatus, removeJob, logFollowUp, prettyTitle, hostOf } from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { monogram } from './monogram';
import { jobHref } from './jobRoute';
import { STATUS_TONE, timingLabel } from './jobDisplay';
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

/** The one next step for this job, or null. Follow-up due → log it; Saved → apply. */
export function NextAction({ job }: { job: Job }) {
  const s = deriveJobState(job);
  if (s.followUp.due)
    return (
      <Button size="sm" variant="secondary" tone="warning" onClick={() => logFollowUp(job.url)}>
        Log follow-up
      </Button>
    );
  if (s.isApplyable)
    return (
      <Button size="sm" variant="secondary" onClick={() => setStatus(job.url, 'Applied')}>
        Mark applied
      </Button>
    );
  return null;
}

export default function JobRow({ job }: { job: Job }) {
  const s = deriveJobState(job);
  const title = job.label || prettyTitle(job.url);
  const sub = [job.company, job.location].filter(Boolean).join(' · ') || hostOf(job.url);
  const timing = timingLabel(job);
  const hasAction = s.followUp.due || s.isApplyable;

  return (
    <Card bordered padding="none" style={{ opacity: job.archived ? 0.55 : 1 }}>
      <Box
        sx={{
          position: 'relative',
          display: 'grid',
          alignItems: 'start',
          columnGap: 3,
          rowGap: 2,
          p: 4,
          // Phone-first base (HDS sx has no base breakpoint, hds#652): 3 columns, stacked rows.
          gridTemplateColumns: 'var(--primitive-space-10) minmax(0, 1fr) auto',
          gridTemplateAreas: hasAction
            ? '"av main menu" ". meta meta" ". action action"'
            : '"av main menu" ". meta meta"',
          '&': {
            alignItems: { sm: 'center' },
            gridTemplateColumns: { sm: 'var(--primitive-space-10) minmax(0, 1fr) auto auto auto' },
            gridTemplateAreas: { sm: '"av main meta action menu"' },
            columnGap: { sm: 4 },
            px: { sm: 5 },
          },
          '&:hover': { bgcolor: 'surface.sunken' },
          // Stretched link: the whole row opens the job page; real controls sit above it.
          '& .job-open': {
            color: 'content.primary',
            textDecoration: 'none',
            lineHeight: 1.3,
            minWidth: 0,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            // Phones: wrap to two lines rather than cut the title; wider: one line.
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: '2',
            '&': { WebkitLineClamp: { sm: '1' } },
          },
          '& .job-open:focus-visible': { outline: 'medium solid var(--semantic-accent-rest)' },
          '& .job-open::after': { content: '""', position: 'absolute', inset: 0 },
          '& .job-ctl': { position: 'relative', zIndex: 1 },
        }}
      >
        <Box sx={{ gridArea: 'av', display: 'flex' }}>
          <JobAvatar job={job} />
        </Box>

        <Box sx={{ gridArea: 'main', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
            <a href={jobHref(job.url)} className="job-open">
              <Text variant="ui" as="span" style={{ fontWeight: 600, color: 'inherit' }}>
                {title}
              </Text>
            </a>
            {job.priority && (
              <Star
                size={14}
                aria-label="Priority"
                fill="currentColor"
                style={{ color: 'var(--semantic-accent-rest)', flex: 'none', marginTop: 'var(--primitive-space-1)' }}
              />
            )}
          </Box>
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
          sx={{
            gridArea: 'meta',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
            minWidth: 0,
            '&': {
              flexDirection: { sm: 'column' },
              alignItems: { sm: 'flex-start' },
              gap: { sm: 1 },
            },
          }}
        >
          <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
          {timing && (
            <Text
              variant="caption"
              as="span"
              style={{
                whiteSpace: 'nowrap',
                color: s.followUp.due
                  ? 'var(--semantic-color-feedback-warning)'
                  : 'var(--semantic-color-content-secondary)',
              }}
            >
              {timing}
            </Text>
          )}
        </Box>

        {hasAction && (
          <Box
            className="job-ctl"
            sx={{ gridArea: 'action', justifySelf: 'start', '&': { justifySelf: { sm: 'end' } } }}
          >
            <NextAction job={job} />
          </Box>
        )}

        <Box className="job-ctl" sx={{ gridArea: 'menu', justifySelf: 'end', mt: -1 }}>
          <JobActionsMenu job={job} />
        </Box>
      </Box>
    </Card>
  );
}
