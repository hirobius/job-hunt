// A saved job's own page (#/queue/<encoded url>), phone-first, v1 (docs/design/prototype-v1.html):
//   back bar → who it is → the Next card (status, timing, the one primary action)
//   → three rows that each open a Sheet (To-dos, Interviews, Details) → research links.
// One column at every width. Every edit surface is a Sheet (src/Sheet.tsx).
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Badge,
  Box,
  Button,
  Card,
  Icon,
  InlineLink,
  Input,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
} from '@hirobius/design-system';
import { updateJob, setStatus, logFollowUp, prettyTitle, hostOf } from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { MODES, VERDICTS, modeLabel } from './screening';
import { nextAction, NEXT_ACTION_LABEL, type NextAction } from './nextAction';
import { Sheet, SheetMenu } from './Sheet';
import InterviewLog from './InterviewLog';
import { UseTemplateSheet } from './UseTemplate';
import { TodosNotes } from './TodosNotes';
import { notesOf } from './jobNotes';

const ScreenJdDialog = lazy(() => import('./ScreenJdDialog'));
import EmptyState from './EmptyState';
import { useCloudSync } from './account/accountContext';
import { JobAvatar, JobActionsMenu } from './JobRow';
import { STATUS_TONE, timingLabel } from './jobDisplay';
import type { Job, JobMode, Status, Verdict } from './types';

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;

type Overlay =
  | 'status'
  | 'followup'
  | 'interview'
  | 'todos'
  | 'details'
  | 'template'
  | 'screen'
  | null;

const OPEN_STATUSES: Status[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];
const OUTCOMES = ['Sent note', 'Called', 'Got a reply'].map((o) => ({ value: o, label: o }));

function research(label: string) {
  const q = encodeURIComponent(label || '');
  return [
    ['Glassdoor', `https://www.glassdoor.com/Search/results.htm?keyword=${q}`],
    ['LinkedIn', `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
    ['levels.fyi', `https://www.levels.fyi/?search=${q}`],
    ['Google', `https://www.google.com/search?q=${q}+careers+reviews`],
  ];
}

const back = () => navigate({ tab: 'queue', sub: null });

/** Local YYYY-MM-DD (the format notes, follow-ups and events share). */
function isoToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The prototype's one-line summary of the Interviews row: the next event, else how many are logged. */
function interviewSummary(job: Job): string {
  const events = job.events ?? [];
  if (events.length === 0) return 'None scheduled';
  const today = isoToday();
  const next = events.find((e) => e.date >= today);
  if (!next) return `${events.length} logged`;
  const kind = next.kind.charAt(0).toUpperCase() + next.kind.slice(1);
  return `${next.date}${next.time ? ` ${next.time}` : ''} — ${kind}`;
}

function detailsSummary(job: Job): string {
  const fit = VERDICTS.find((v) => v.value === job.verdict)?.label;
  const mode = job.mode ? modeLabel(job.mode) : '';
  return [fit, mode, job.contact].filter(Boolean).join(' — ') || 'Add fit, mode and contact';
}

/** One of the three rows that open a sheet: bold name over a one-line summary, a chevron. */
function SheetRow({
  title,
  summary,
  onClick,
}: {
  title: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <Button variant="tertiary" className="app-sheet-item" onClick={onClick}>
      <Stack gap="xs" style={{ textAlign: 'left', minWidth: 0 }}>
        <Text variant="body" as="span" style={{ fontWeight: 700, color: 'inherit' }}>
          {title}
        </Text>
        <Text variant="caption" as="span" style={muted}>
          {summary}
        </Text>
      </Stack>
      <Icon icon={ChevronRight} />
    </Button>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text variant="caption" as="span" style={muted}>
      {children}
    </Text>
  );
}

function MissingJob() {
  const { setSignInOpen } = useCloudSync();
  return (
    <EmptyState
      title="This job isn't in your tracker"
      message="It may have been removed, or the link came from another device that hasn't synced."
      action={
        <Button variant="primary" onClick={back}>
          Back to Tracker
        </Button>
      }
      secondaryAction={
        <Button variant="secondary" onClick={() => setSignInOpen(true)}>
          Sign in to sync
        </Button>
      }
    />
  );
}

/** Log follow-up: restarts the follow-up clock; a typed note is appended to the job's notes. */
function FollowUpSheet({ job, onClose }: { job: Job; onClose: () => void }) {
  const [outcome, setOutcome] = useState(OUTCOMES[0].value);
  const [note, setNote] = useState('');
  const save = () => {
    logFollowUp(job.url);
    const text = note.trim();
    if (text) {
      const line = `${isoToday()} follow-up (${outcome}): ${text}`;
      const prev = notesOf(job);
      updateJob(job.url, { notes: prev ? `${prev}\n${line}` : line, note: '' });
    }
    onClose();
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Log follow-up"
      description={[job.label, job.company].filter(Boolean).join(' — ')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Log follow-up
          </Button>
        </>
      }
    >
      <Stack gap="normal">
        <Input
          label="Date"
          readOnly
          value={`Today, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          style={{ width: '100%' }}
        />
        <Stack gap="xs">
          <FieldLabel>What happened</FieldLabel>
          <SegmentedControl
            aria-label="Outcome"
            options={OUTCOMES}
            value={outcome}
            onChange={setOutcome}
            fullWidth
          />
        </Stack>
        <Textarea
          label="Note (optional)"
          rows={3}
          placeholder="Anything worth remembering?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%' }}
        />
      </Stack>
    </Sheet>
  );
}

const FIT_OPTIONS = [
  { value: '', label: 'Not set' },
  ...VERDICTS.map((v) => ({ value: v.value, label: v.label })),
];
const MODE_OPTIONS = [
  { value: '', label: 'Not set' },
  ...MODES.map((m) => ({ value: m.value, label: m.label })),
];

/** Details: a grouped form over a local draft. Nothing is written until Save; Cancel discards. */
function DetailsSheet({
  job,
  onClose,
  onScreen,
}: {
  job: Job;
  onClose: () => void;
  /** Opens the rules-based job-description screener (fills fit, mode and blockers). */
  onScreen: () => void;
}) {
  const [d, setD] = useState({
    label: job.label || prettyTitle(job.url),
    company: job.company ?? '',
    location: job.location ?? '',
    contact: job.contact ?? '',
    angle: job.angle ?? '',
    seniority: job.seniority ?? '',
    salary: job.salary ?? '',
    verdict: (job.verdict ?? '') as Verdict | '',
    mode: (job.mode ?? '') as JobMode | '',
  });
  const text = (
    key: 'label' | 'company' | 'location' | 'contact' | 'angle' | 'seniority' | 'salary',
    label: string,
    placeholder?: string,
  ) => (
    <Input
      label={label}
      placeholder={placeholder}
      value={d[key]}
      onChange={(e) => setD((p) => ({ ...p, [key]: e.target.value }))}
      style={{ width: '100%' }}
    />
  );
  const save = () => {
    updateJob(job.url, {
      label: d.label.trim() || job.label,
      company: d.company.trim(),
      location: d.location.trim(),
      contact: d.contact.trim(),
      angle: d.angle.trim(),
      seniority: d.seniority.trim(),
      salary: d.salary.trim(),
      verdict: d.verdict || undefined,
      mode: d.mode || undefined,
    });
    onClose();
  };
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit details"
      description="Nothing changes until you tap Save."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <Stack gap="normal">
        <Button variant="secondary" onClick={onScreen}>
          Screen a job description
        </Button>
        {text('label', 'Title')}
        {text('company', 'Company')}
        {text('location', 'Location')}
        {text('contact', 'Contact / referral', 'Name')}
        {text('angle', 'Angle (fills templates)', 'Your angle for this role')}
        {text('seniority', 'Seniority')}
        {text('salary', 'Salary')}
        <Stack gap="xs">
          <FieldLabel>Fit</FieldLabel>
          <SegmentedControl
            aria-label="Fit"
            options={FIT_OPTIONS}
            value={d.verdict}
            onChange={(v) => setD((p) => ({ ...p, verdict: v as Verdict | '' }))}
            fullWidth
          />
        </Stack>
        <Stack gap="xs">
          <FieldLabel>Work mode</FieldLabel>
          <SegmentedControl
            aria-label="Work mode"
            options={MODE_OPTIONS}
            value={d.mode}
            onChange={(v) => setD((p) => ({ ...p, mode: v as JobMode | '' }))}
            fullWidth
          />
        </Stack>
        <Text variant="caption" as="p" style={{ ...muted, margin: 0 }}>
          {job.applicants != null ? `Applicants ${job.applicants} — ` : ''}Source {hostOf(job.url)}{' '}
          (from the posting, not editable)
        </Text>
      </Stack>
    </Sheet>
  );
}

export default function JobDetailPage({ job }: { job: Job | undefined }) {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const close = () => setOverlay(null);

  if (!job) return <MissingJob />;

  const s = deriveJobState(job);
  const title = job.label || prettyTitle(job.url);
  const timing = timingLabel(job);
  const statusLabel = job.archived ? 'Closed' : s.status;
  const action = nextAction(job);
  const openTodos = (job.todos ?? []).filter((t) => !t.done).length;
  const todoSummary = `${openTodos ? `${openTodos} open` : 'None open'}${notesOf(job).trim() ? ' — Notes added' : ''}`;
  const host = hostOf(job.url);

  const pickStatus = (status: Status | 'Closed') => {
    if (status === 'Closed') updateJob(job.url, { archived: true });
    else {
      setStatus(job.url, status);
      if (job.archived) updateJob(job.url, { archived: false });
    }
    close();
  };

  const runPrimary = (a: NextAction) => {
    if (a === 'apply') setStatus(job.url, 'Applied');
    else if (a === 'followup') setOverlay('followup');
    else if (a === 'interview') setOverlay('interview');
    else {
      if (s.status === 'Rejected') setStatus(job.url, 'Saved');
      if (job.archived) updateJob(job.url, { archived: false });
    }
  };

  const statusItems = [...OPEN_STATUSES, 'Closed' as const].map((st) => ({
    label: st,
    selected: st === statusLabel,
    onSelect: () => pickStatus(st),
  }));

  return (
    <Stack gap="normal">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button variant="tertiary" size="sm" iconLeft={<Icon icon={ArrowLeft} />} onClick={back}>
          Tracker
        </Button>
        <JobActionsMenu job={job} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 'sm', minWidth: 0 }}>
        <JobAvatar job={job} size="lg" />
        <Stack gap="xs" style={{ minWidth: 0 }}>
          <Text variant="title" as="h1" style={{ margin: 0, overflowWrap: 'anywhere' }}>
            {title}
          </Text>
          <Text variant="caption" as="p" style={{ ...muted, margin: 0 }}>
            {[job.company, job.location].filter(Boolean).join(' — ') || host}
          </Text>
          <InlineLink href={job.url} externalIcon>
            View posting — {host}
          </InlineLink>
        </Stack>
      </Box>

      <Card as="section" aria-label="Next step" gap="normal">
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'sm' }}
        >
          <Button
            variant="tertiary"
            size="sm"
            aria-label={`Change status, now ${statusLabel}`}
            iconRight={<Icon icon={ChevronDown} />}
            onClick={() => setOverlay('status')}
          >
            <Badge tone={job.archived ? 'neutral' : STATUS_TONE[s.status]}>{statusLabel}</Badge>
          </Button>
          {timing && (
            <Text variant="ui" as="span" style={s.followUp.due ? { fontWeight: 700 } : muted}>
              Next: {timing}
            </Text>
          )}
        </Box>
        <Button
          variant="primary"
          size="lg"
          style={{ width: '100%' }}
          onClick={() => runPrimary(action)}
        >
          {NEXT_ACTION_LABEL[action]}
        </Button>
        <Button
          variant="secondary"
          style={{ width: '100%' }}
          onClick={() => setOverlay('template')}
        >
          Use a template
        </Button>
      </Card>

      <Box>
        <SheetRow title="To-dos" summary={todoSummary} onClick={() => setOverlay('todos')} />
        <SheetRow
          title="Interviews"
          summary={interviewSummary(job)}
          onClick={() => setOverlay('interview')}
        />
        <SheetRow
          title="Details"
          summary={detailsSummary(job)}
          onClick={() => setOverlay('details')}
        />
      </Box>

      <Stack gap="tight">
        <Text variant="title" as="h2" style={{ fontSize: '1.0625rem', margin: 0 }}>
          Research
        </Text>
        <Stack direction="row" gap="gap" wrap="wrap">
          {research(title).map(([name, href]) => (
            <Button key={name} size="sm" variant="secondary" asChild>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {name}
              </a>
            </Button>
          ))}
        </Stack>
      </Stack>

      <Sheet
        open={overlay === 'status'}
        onOpenChange={(o) => !o && close()}
        title="Change status"
        description={title}
      >
        <SheetMenu label="Status" items={statusItems} />
      </Sheet>
      {overlay === 'followup' && <FollowUpSheet job={job} onClose={close} />}
      {overlay === 'details' && (
        <DetailsSheet job={job} onClose={close} onScreen={() => setOverlay('screen')} />
      )}
      {overlay === 'screen' && (
        <Suspense fallback={null}>
          <ScreenJdDialog job={job} open onClose={close} />
        </Suspense>
      )}
      <Sheet
        open={overlay === 'todos'}
        onOpenChange={(o) => !o && close()}
        title="To-dos"
        description={[title, job.company].filter(Boolean).join(' — ')}
      >
        <TodosNotes job={job} />
      </Sheet>
      <Sheet
        open={overlay === 'interview'}
        onOpenChange={(o) => !o && close()}
        title="Add interview"
        description={[title, job.company].filter(Boolean).join(' — ')}
      >
        <InterviewLog job={job} />
      </Sheet>
      {overlay === 'template' && (
        <UseTemplateSheet job={job} open onOpenChange={(o) => !o && close()} />
      )}
    </Stack>
  );
}
