// The job page's header (#130; rev-3 mobile slice 2): Back, one badge row above the title (status,
// a due follow-up, Closed, then fit), the title with its posting link beside it, company ·
// location · applied date, then one row of actions: the job's one primary next step (it takes the
// row's room) and the menu of everything else (Remove included); no star (#534). The same column at
// every width. Back goes to the page the job was opened from (the Pipeline by default).
// An Interviewing job's primary is Add interview (opens its dialog, #416); a job with no next
// step (Offer, Rejected, retired, applied and not yet due) has none, so More stands alone.
import {
  Banknote,
  Bell,
  CalendarClock,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  Link2Off,
  MapPin,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, Button, Icon, useAtLeast, useToast } from '@hirobius/design-system';
import { DetailHeader, DetailTitleBlock } from './DetailHeader';
import { closingOf, dateLabel, dueBadgeOf } from './jobDates';
import { rowView, titleOf } from './jobRow';
import { goBack, type Route } from './route';
import {
  closeOutWithUndo,
  markAppliedWithUndo,
  markFollowedUpWithUndo,
  setAsideWithUndo,
} from './applyActions';
import { applicationLink, dockKeys, type DockKey } from './dockKeys';
import AddLinkDialog from './AddLinkDialog';
import { useOutreachTemplates } from './outreachTemplates';
import { useApplyKit } from './applyKit';
import { openFollowUp, pickFollowUpTemplate } from './followUpFlow';
import { fillSnippet } from './templateFill';
import { copyFailed, copyFilled } from './templateCopy';
import BackLink from './BackLink';
import { focusAsHeading, focusNewHeading, pageHeadingNow } from './focusRescue';
import { openNextAfter } from './applyNext';
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
    ...(applicationLink(job) ? [] : [{ icon: Link2Off, label: 'No application link' }]),
  ];
  // No glyph beside the title (Adrian 2026-11-08): the posting is Open application, or the
  // menu's Open posting.
  const badges = (due || status !== 'Saved' || row.retired || closed) && (
    <>
      {due && (
        <IconBadge tone="warning" icon={due.kind === 'closing' ? CalendarClock : Bell}>
          {due.label}
        </IconBadge>
      )}
      {status !== 'Saved' && <Badge tone="neutral">{status}</Badge>}
      {closed && <Badge tone="neutral">Closed</Badge>}
      {row.retired && <Badge tone="neutral">Retired</Badge>}
    </>
  );
  return (
    <DetailTitleBlock
      title={titleOf(job)}
      company={company}
      noCompany="Company not stated"
      logo={company && <CompanyLogo company={company} postings={[job.url]} />}
      facts={facts}
      badges={badges || undefined}
    />
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
  const [addingLink, setAddingLink] = useState(false);
  const templates = useOutreachTemplates();
  const kitName = useApplyKit().fields.name;
  const { toast } = useToast();
  const title = titleOf(job);
  // The view moves on first, while the job still has its place in the list, then the answer
  // lands (its notice is raised on the page it stays on). Opened from anywhere (the walk, Find, a
  // Company page), the next job in the list opens and its title takes focus; after the last job
  // the list (or the page it was opened from) opens and its heading takes focus (#536).
  const moveOn = onAnswered ?? (() => openNextAfter(job));
  const markApplied = () => {
    if (tooSoon()) return;
    const from = pageHeadingNow();
    moveOn();
    markAppliedWithUndo(job);
    focusNewHeading(from);
  };
  const notAFit = () => {
    if (tooSoon()) return;
    const from = pageHeadingNow();
    moveOn();
    // Undo puts every field back; it does not navigate (#536).
    setAsideWithUndo(job);
    focusNewHeading(from);
  };
  // A job closed on the board was opened to clear it out: retiring it goes back to where it was
  // opened from (the Pipeline's closed list), like Remove does for any job.
  const closed = checkFor(useLiveness(), job.url)?.state === 'closed';
  const wide = useAtLeast('lg');
  // One filled key, one grey key, one exit, in that order of rank (#535), per the job's state
  // (`dockKeys`, #540). On a phone they sit in the dock at the bottom; from lg in one row under
  // the title block.
  const link = applicationLink(job);
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
    moveOn();
    closeOutWithUndo(job);
    focusNewHeading(from);
  };
  const render = ({ id, rank }: DockKey): ReactNode => {
    const variant = rank === 'primary' ? 'primary' : 'secondary';
    switch (id) {
      case 'openApplication':
        return (
          <Button key={id} asChild variant={variant} size="md">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <Icon icon={ExternalLink} />
              Open application
            </a>
          </Button>
        );
      case 'markApplied':
        return (
          <Button
            key={id}
            variant={variant}
            size="md"
            aria-label={`Mark applied: ${title}`}
            onClick={markApplied}
          >
            Mark applied
          </Button>
        );
      case 'addLink':
        return (
          <Button
            key={id}
            variant={variant}
            size="md"
            iconLeft={<Icon icon={Link2} />}
            aria-label={`Add link: ${title}`}
            onClick={() => setAddingLink(true)}
          >
            Add link
          </Button>
        );
      case 'copyFollowUp':
        return (
          <Button
            key={id}
            variant={variant}
            size="md"
            iconLeft={<Icon icon={Copy} />}
            aria-label={`Copy follow-up: ${title}`}
            onClick={copyFollowUp}
          >
            Copy follow-up
          </Button>
        );
      case 'markFollowedUp':
        return (
          <Button
            key={id}
            variant={variant}
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
            key={id}
            variant={variant}
            size="md"
            onClick={(e) => openAddInterview(job.url, e.currentTarget)}
          >
            Add interview
          </Button>
        );
      case 'notAFit':
        return (
          <ExitButton key={id} aria-label={`Not a fit: ${title}`} onClick={notAFit}>
            Not a fit
          </ExitButton>
        );
      case 'closeOut':
        return (
          <ExitButton key={id} aria-label={`Close out: ${title}`} onClick={closeOut}>
            Close out
          </ExitButton>
        );
    }
  };
  const ranked = dockKeys(job);
  const keys = ranked.map(render);
  return (
    <DetailHeader
      back={showBack && <BackToPipeline />}
      titleBlock={<JobTitleBlock job={job} />}
      more={
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
      }
      docked={!wide}
      label={`Actions for ${title}`}
      onKeysGone={focusTitle}
      keys={keys}
    >
      {ranked.some((k) => k.id === 'addLink') && (
        <AddLinkDialog job={job} open={addingLink} onOpenChange={setAddingLink} />
      )}
    </DetailHeader>
  );
}
