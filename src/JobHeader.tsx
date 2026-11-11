// The job page's header (#130; rev-3 mobile slice 2): Back, one badge row above the title (status,
// a due follow-up, Closed, then fit), the title with its posting link beside it, company ·
// location · applied date, then one row of actions: the star, the job's one primary next step (it
// takes the row's room) and the menu of everything else (Remove included). The same column at
// every width. Back goes to the page the job was opened from (the Pipeline by default).
// An Interviewing job's primary is Add interview (opens its dialog, #416); a job with no next
// step (Offer, Rejected, retired, applied and not yet due) has none, so Star and More sit together.
import {
  Banknote,
  Bell,
  CalendarClock,
  Clock,
  Copy,
  ExternalLink,
  Link2Off,
  MapPin,
} from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Icon,
  Stack,
  Text,
  useAtLeast,
  useToast,
} from '@hirobius/design-system';
import { ActionDock } from './hds-gaps/ActionDock';
import { closingOf, dateLabel, dueBadgeOf } from './jobDates';
import { rowView, titleOf } from './jobRow';
import { goBack, type Route } from './route';
import {
  closeOutWithUndo,
  markAppliedWithUndo,
  markFollowedUpWithUndo,
  setAsideWithUndo,
} from './applyActions';
import { dockKeysFor, hasApplicationLink, type DockKey } from './dockKeys';
import AddLinkDialog from './AddLinkDialog';
import { useOutreachTemplates } from './outreachTemplates';
import { useApplyKit } from './applyKit';
import { openFollowUp, pickFollowUpTemplate } from './followUpFlow';
import { fillSnippet } from './templateFill';
import { copyFailed, copyFilled } from './templateCopy';
import BackLink from './BackLink';
import { focusAsHeading, focusNewHeading, pageHeadingNow } from './focusRescue';
import { tooSoon } from './answerGuard';
import { checkFor, useLiveness } from './livenessStore';
import { RowMenu } from './JobRowParts';
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
    // #540: a job with no application link says so as a fact (no dashed box).
    ...(hasApplicationLink(job) ? [] : [{ icon: Link2Off, label: 'No application link' }]),
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
  // The keys follow the state (#540): exactly one filled key, then a grey key and an exit.
  const ranks = dockKeysFor(job);
  const [addingLink, setAddingLink] = useState(false);
  const templates = useOutreachTemplates();
  const kitName = useApplyKit().fields.name;
  const { toast } = useToast();
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
    // The next title takes focus; with no next job the list (its heading or empty state) does.
    if (onAnswered) onAnswered();
    else goBack(PIPELINE);
    // Undo puts every field back; it does not navigate (#536).
    setAsideWithUndo(job);
    focusNewHeading(from);
  };
  // A job closed on the board was opened to clear it out: retiring it goes back to where it was
  // opened from (the Pipeline's closed list), like Remove does for any job.
  const closed = checkFor(useLiveness(), job.url)?.state === 'closed';
  const wide = useAtLeast('lg');
  // One filled key, one grey key, one exit, in that order of rank (#535, #540). On a phone they
  // sit in the dock at the bottom; from lg in one row under the title block.
  const focusTitle = () =>
    requestAnimationFrame(() => {
      const h = pageHeadingNow();
      if (h) focusAsHeading(h);
    });
  const copyFollowUp = async () => {
    const t = pickFollowUpTemplate(templates);
    // No follow-up message yet: the Follow up dialog writes one.
    if (!t) return openFollowUp(job.url);
    const text = fillSnippet(t, job, kitName);
    const r = await copyFilled(text);
    if (!r.ok) return toast(copyFailed('the follow-up', text));
    toast({ title: 'Follow-up copied', description: title });
  };
  const markFollowedUp = () => {
    if (tooSoon()) return;
    markFollowedUpWithUndo(job);
    // The keys change with the state: focus stays on the page, on its title.
    focusTitle();
  };
  const closeOut = () => {
    if (tooSoon()) return;
    const from = pageHeadingNow();
    if (onAnswered) onAnswered();
    else goBack(PIPELINE);
    closeOutWithUndo(job);
    focusNewHeading(from);
  };
  const key = (k: DockKey, rank: 'primary' | 'secondary') => {
    switch (k) {
      case 'openApplication':
        return (
          <Button key={k} asChild variant={rank} size="md">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              <Icon icon={ExternalLink} />
              Open application
            </a>
          </Button>
        );
      case 'markApplied':
        return (
          <Button
            key={k}
            variant={rank}
            size="md"
            aria-label={`Mark applied: ${title}`}
            onClick={markApplied}
          >
            Mark applied
          </Button>
        );
      case 'addLink':
        return (
          <Button key={k} variant={rank} size="md" onClick={() => setAddingLink(true)}>
            Add link
          </Button>
        );
      case 'copyFollowUp':
        return (
          <Button
            key={k}
            variant={rank}
            size="md"
            iconLeft={<Icon icon={Copy} />}
            onClick={copyFollowUp}
          >
            Copy follow-up
          </Button>
        );
      case 'markFollowedUp':
        return (
          <Button
            key={k}
            variant={rank}
            size="md"
            aria-label={`Mark followed up: ${title}`}
            onClick={markFollowedUp}
          >
            Mark followed up
          </Button>
        );
      case 'addInterview':
        return (
          <Button
            key={k}
            variant={rank}
            size="md"
            onClick={(e) => openAddInterview(job.url, e.currentTarget)}
          >
            Add interview
          </Button>
        );
      case 'notAFit':
        return (
          <ExitButton key={k} aria-label={`Not a fit: ${title}`} onClick={notAFit}>
            Not a fit
          </ExitButton>
        );
      case 'closeOut':
        return (
          <ExitButton key={k} aria-label={`Close out: ${title}`} onClick={closeOut}>
            Close out
          </ExitButton>
        );
    }
  };
  const keys = ranks
    ? [
        key(ranks.filled, 'primary'),
        ranks.grey && key(ranks.grey, 'secondary'),
        ranks.exit && key(ranks.exit, 'secondary'),
      ].filter(Boolean)
    : [];
  return (
    <Box as="header" sx={{ mb: 'lg' }}>
      <Stack gap="normal">
        {showBack && <BackToPipeline />}
        {/* The title block, with More at its top end: it does not commit. No star (#534). */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 'xs' }}>
          <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
            <JobTitleBlock job={job} />
          </Box>
          <RowMenu
            job={job}
            size="md"
            research
            onRemoved={() => {
              // Back to where the job was opened from (return paths); the Apply tab opens its
              // next job there. #534: focus then goes to the new page's title (the next job's,
              // or the list heading or empty state).
              const from = pageHeadingNow();
              goBack(PIPELINE);
              focusNewHeading(from);
            }}
            onRetired={closed ? () => goBack(PIPELINE) : undefined}
          />
        </Box>
        {keys.length > 0 && (
          <ActionDock docked={!wide} label={`Actions for ${title}`}>
            {keys}
          </ActionDock>
        )}
        {ranks?.grey === 'addLink' && (
          <AddLinkDialog job={job} open={addingLink} onOpenChange={setAddingLink} />
        )}
      </Stack>
    </Box>
  );
}
