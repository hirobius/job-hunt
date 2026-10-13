// One saved job at rest, built for glancing (21st.dev list-item pattern, docs/design P5).
// Four fixed slots, each with its own space so nothing pushes or wraps into its neighbour:
//
//   [monogram] [title / company · location]        [status · timing] [next action] [⋮]
//
// Only what decides "do I act on this now?" renders here. Everything else (screening, notes,
// to-dos, templates, research, editable fields) lives on the job's own page — the title opens it.
// No status rail: the filter already groups by status.
import { Box, Typography } from './ui/box';
import { EllipsisVertical, Star } from 'lucide-react';
import { Badge, Button, Card, IconButton, Menu } from '@hirobius/design-system';
import { updateJob, setStatus, removeJob, logFollowUp, prettyTitle, hostOf } from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { monogram, monogramHue } from './monogram';
import { jobHref } from './jobRoute';
import { STATUS_TONE, timingLabel } from './jobDisplay';
import type { Job } from './types';

export function Monogram({ job, size = 40 }: { job: Job; size?: number }) {
  const host = hostOf(job.url);
  const hue = monogramHue(job.company || host || job.url);
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '10px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size >= 48 ? 16 : 13,
        letterSpacing: '0.02em',
        color: 'text.primary',
        backgroundColor: `oklch(0.7 0.12 ${hue} / 0.18)`,
        border: `1px solid oklch(0.7 0.12 ${hue} / 0.32)`,
      }}
    >
      {monogram(job.company, host, job.label || prettyTitle(job.url))}
    </Box>
  );
}

export function JobActionsMenu({ job }: { job: Job }) {
  const s = deriveJobState(job);
  return (
    <Menu>
      <Menu.Trigger asChild>
        <IconButton size="sm" variant="tertiary" icon={EllipsisVertical} label="More actions" />
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

/** The one next step for this job, or null. Saved → apply; follow-up due → log it. */
function NextAction({ job }: { job: Job }) {
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

  return (
    <Card bordered padding="none" style={{ opacity: job.archived ? 0.55 : 1 }}>
      <Box
        sx={{
          position: 'relative',
          display: 'grid',
          alignItems: 'center',
          columnGap: { xs: 1.5, sm: 2 },
          rowGap: 1,
          px: { xs: 1.75, sm: 2.5 },
          py: { xs: 1.5, sm: 1.75 },
          gridTemplateColumns: {
            xs: '36px minmax(0, 1fr) auto',
            sm: '40px minmax(0, 1fr) 132px 128px auto',
          },
          gridTemplateAreas: {
            xs: '"av main menu" ". meta meta" ". action action"',
            sm: '"av main meta action menu"',
          },
          '&:hover': { bgcolor: 'action.hover' },
          // Stretched link: the whole row opens the job page; real controls sit above it.
          '& .job-open::after': { content: '""', position: 'absolute', inset: 0 },
          '& .job-ctl': { position: 'relative', zIndex: 1 },
        }}
      >
        <Box sx={{ gridArea: 'av', display: 'flex' }}>
          <Monogram job={job} size={40} />
        </Box>

        <Box sx={{ gridArea: 'main', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Box
              component="a"
              href={jobHref(job.url)}
              className="job-open"
              sx={{
                color: 'text.primary',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '1rem',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                '&:focus-visible': { outline: '2px solid var(--semantic-accent-rest)' },
              }}
            >
              {title}
            </Box>
            {job.priority && (
              <Star
                size={14}
                aria-label="Priority"
                fill="currentColor"
                style={{ color: 'var(--semantic-accent-rest)', flex: 'none' }}
              />
            )}
          </Box>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sub}
          </Typography>
        </Box>

        <Box
          sx={{
            gridArea: 'meta',
            display: 'flex',
            flexDirection: { xs: 'row', sm: 'column' },
            alignItems: { xs: 'center', sm: 'flex-start' },
            gap: { xs: 1, sm: 0.25 },
            minWidth: 0,
          }}
        >
          <Box sx={{ flex: 'none', display: 'inline-flex' }}>
            <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
          </Box>
          {timing && (
            <Typography
              variant="caption"
              sx={{
                whiteSpace: 'nowrap',
                color: s.followUp.due ? 'var(--semantic-color-feedback-warning)' : 'text.secondary',
              }}
            >
              {timing}
            </Typography>
          )}
        </Box>

        <Box
          className="job-ctl"
          sx={{
            gridArea: 'action',
            justifySelf: { xs: 'start', sm: 'end' },
            '&:empty': { display: 'none' },
          }}
        >
          <NextAction job={job} />
        </Box>

        <Box className="job-ctl" sx={{ gridArea: 'menu', justifySelf: 'end' }}>
          <JobActionsMenu job={job} />
        </Box>
      </Box>
    </Card>
  );
}
