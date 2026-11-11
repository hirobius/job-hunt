// The job page's header (#130; rev-3 mobile slice 2): Back, one badge row above the title (status,
// a due follow-up, Closed, then fit), the title with its posting link beside it, company ·
// location · applied date, then one row of actions: the star, the job's one primary next step (it
// takes the row's room) and the menu of everything else (Remove included). The same column at
// every width. Back goes to the page the job was opened from (the Pipeline by default).
// An Interviewing job's primary is Add interview (opens its dialog, #416); a job with no next
// step (Offer, Rejected, retired, applied and not yet due) has none, so Star and More sit together.
import { Banknote, Bell, CalendarClock, Clock, ExternalLink, MapPin } from 'lucide-react';
import { Badge, Box, Button, Card, Icon, Stack, Text } from '@hirobius/design-system';
import { closingOf, dateLabel, dueBadgeOf } from './jobDates';
import { primaryAction, rowView, titleOf } from './jobRow';
import { goBack, openJob, type Route } from './route';
import { jobIdOf } from './store';
import { markAppliedWithUndo, setAsideWithUndo } from './applyActions';
import BackLink from './BackLink';
import { focusNewHeading, pageHeadingNow } from './focusRescue';
import { tooSoon } from './answerGuard';
import { checkFor, useLiveness } from './livenessStore';
import { RowMenu, RowPrimaryAction, StarButton } from './JobRowParts';
import { openAddInterview } from './jobDialogs';
import type { Job } from './types';
import CompanyLogo from './CompanyLogo';
import { ExitButton } from './hds-gaps/ExitButton';
import { IconBadge } from './hds-gaps/IconBadge';
import { normStatus } from './jobState';

/** The title block (#538, redesign §5.5): the title (typography.title, 24px, wraps in full), the
 *  company (or "Company not stated"), one facts line (place, pay, date; 16px icons) and, under it,
 *  an amber badge only when a date needs action. Other status is neutral. No fit chips, no Saved
 *  chip, no star, no blue. */
export function JobTitleBlock({ job }: { job: Job }) {
  const company = job.company?.trim();
  // One date per job (Adrian 2026-10-28): posted, else found.
  const when = dateLabel(job);
  const due = dueBadgeOf(job);
  const status = normStatus(job.status);
  const row = rowView(job);
  const closed = closingOf(job)?.kind === 'closed';
  const facts = [
    { icon: MapPin, label: job.location?.trim() || 'Location not stated' },
    // On the job page a missing pay says so: you need it to decide.
    { icon: Banknote, label: job.salary?.trim() || 'Pay not stated' },
    ...(when ? [{ icon: Clock, label: when }] : []),
  ];
  return (
    <Stack gap="tight" data-rjb-title-block="">
      {/* No glyph beside the title (Adrian 2026-11-08): the posting is Open application, or
          the menu's Open posting. */}
      <Text variant="title" as="h1" className="rjb-break">
        {titleOf(job)}
      </Text>
      <Stack direction="row" gap="px8" align="center">
        {company && <CompanyLogo company={company} postings={[job.url]} />}
        {company ? (
          <Text variant="ui" as="p">
            {company}
          </Text>
        ) : (
          <Text variant="ui" as="p" tone="secondary">
            Company not stated
          </Text>
        )}
      </Stack>
      <Card.Facts items={facts} />
      {(due || status !== 'Saved' || row.retired || closed) && (
        <Stack direction="row" wrap="wrap" gap="px8" align="center">
          {due && (
            <IconBadge tone="warning" icon={due.kind === 'closing' ? CalendarClock : Bell}>
              {due.label}
            </IconBadge>
          )}
          {status !== 'Saved' && <Badge tone="neutral">{status}</Badge>}
          {closed && <Badge tone="neutral">Closed</Badge>}
          {row.retired && <Badge tone="neutral">Retired</Badge>}
        </Stack>
      )}
    </Stack>
  );
}

const PIPELINE: Route = { tab: 'apply', sub: null, pillar: null, jobId: null };
/** "← Apply": a quiet link-like button back to where the page was opened from (return paths):
 *  the Apply list by default, else the page that opened it, by name ("← Find", "← Acme
 *  Metals"). Its name says where it goes. */
export function BackToPipeline() {
  return <BackLink as="button" className="rjb-back" fallback={PIPELINE} fallbackLabel="Apply" />;
}

export default function JobHeader({
  job,
  showBack = true,
  onAnswered,
}: {
  job: Job;
  showBack?: boolean;
  /** After Mark applied or Not a fit (the Apply view, #471): the page moves on to the next job. */
  onAnswered?: () => void;
}) {
  const next = primaryAction(job);
  // A job still to apply to is the Apply view (#471, Adrian 2026-11-05: the job page and Apply mode
  // are one): Open application is the primary, Mark applied and Not a fit one row of two under it.
  const applying = next === 'apply';
  const addInterview =
    !next && !job.archived && job.status === 'Interviewing' ? (
      <Button
        variant="primary"
        size="md"
        onClick={(e) => openAddInterview(job.url, e.currentTarget)}
      >
        Add interview
      </Button>
    ) : null;
  const primary = applying ? (
    <Button asChild variant="primary" size="md">
      <a href={job.url} target="_blank" rel="noopener noreferrer">
        <Icon icon={ExternalLink} />
        Open application
      </a>
    </Button>
  ) : next ? (
    <RowPrimaryAction job={job} variant="primary" size="md" />
  ) : (
    addInterview
  );
  const title = titleOf(job);
  // The view moves on first, while the job still has its place in the list, then the answer
  // lands (its notice is raised on the page it stays on).
  const markApplied = () => {
    if (tooSoon()) return;
    const from = pageHeadingNow();
    onAnswered?.();
    markAppliedWithUndo(job);
    focusNewHeading(from);
  };
  const notAFit = () => {
    if (tooSoon()) return;
    const from = pageHeadingNow();
    const id = jobIdOf(job.url);
    if (onAnswered) onAnswered();
    else goBack(PIPELINE);
    // Undo puts it back in To apply and shows it again.
    setAsideWithUndo(job, () => openJob(id, true));
    focusNewHeading(from);
  };
  // A job closed on the board was opened to clear it out: retiring it goes back to where it was
  // opened from (the Pipeline's closed list), like Remove does for any job.
  const closed = checkFor(useLiveness(), job.url)?.state === 'closed';
  return (
    <Box as="header" sx={{ mb: 'lg' }}>
      <Stack gap="normal">
        {showBack && <BackToPipeline />}
        <JobTitleBlock job={job} />
        {/* On a phone the primary takes the room between the two 40px icon buttons (rev-3
            mock); from sm up it is as wide as its label. No primary, no slot: no hole. */}
        <Box data-rjb-actions="" sx={{ display: 'flex', alignItems: 'center', gap: 'xs' }}>
          <StarButton job={job} />
          {primary && (
            <Box
              sx={{
                flex: { base: '1 1 0%', sm: '0 0 auto' },
                minWidth: 0,
                display: 'flex',
                '& > *': { flex: '1 1 0%' },
              }}
            >
              {primary}
            </Box>
          )}
          <RowMenu
            job={job}
            size="md"
            research
            onRemoved={() => goBack(PIPELINE)}
            onRetired={closed ? () => goBack(PIPELINE) : undefined}
          />
        </Box>
        {applying && (
          // One row of two equal secondaries under the primary (rev-3 E).
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'xs' }}>
            <Button
              variant="secondary"
              size="md"
              aria-label={`Mark applied: ${title}`}
              onClick={markApplied}
            >
              Mark applied
            </Button>
            <ExitButton aria-label={`Not a fit: ${title}`} onClick={notAFit}>
              Not a fit
            </ExitButton>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
