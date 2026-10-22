// Apply mode (rapid apply, #/apply/<jobId>; rev-3 E, mobile slice 2): one job at a time from the
// To apply queue. One top row (Back to the Pipeline, and an HDS compact pager "‹ 1 of N ›"), the
// job's badges and title, Open application as the one primary, then Mark applied and Not a fit as
// one row of two. Below: the Apply sheet's templates (every Outreach message filled for the job,
// #239) and the Application kit, as panels of expandable rows (HDS Disclosure variant="row": a
// one-line preview, Copy beside it, the full text when open). Works one-handed on a phone.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Box,
  Button,
  Disclosure,
  Icon,
  Input as HdsInput,
  Pagination,
  Select,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { PageHeader } from '@hirobius/design-system/patterns';
import { BackToPipeline } from './JobHeader';
import { JobBadges } from './JobRowParts';
import { MetaCaption } from './MetaCaption';
import { statusAgo } from './jobState';
import { Panel, PanelBody } from './PipelinePanel';
import BlankText from './BlankText';
import { findJobById, jobIdOf, setStatus, updateJob, useJobs } from './store';
import { navigate, openApply, openJob } from './route';
import { titleOf } from './jobRow';
import { toApplyQueue } from './applyQueue';
import { followUpDate } from './jobEvents';
import { dayLabel } from './dayLabel';
import {
  KIT_FIELDS,
  addAnswer,
  filledTemplates,
  removeAnswer,
  setKitField,
  setKitTemplate,
  updateAnswer,
  useApplyKit,
  type KitAnswer,
} from './applyKit';
import { useOutreachTemplates } from './outreachTemplates';
import { fillSnippet, previewText } from './templateFill';
import { copyFilled } from './templateCopy';
import { showNotice } from './saveNotice';
import { useCloudSync } from './account/accountContext';
import { usePageTitle } from './pageTitle';
import type { Job } from './types';

/** How long after a Not a fit another one is ignored (the second tap of a double tap). */
const DOUBLE_TAP_MS = 700;

export default function ApplyMode({ jobId }: { jobId: string | null }) {
  const jobs = useJobs();
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  const job = jobId ? findJobById(jobId, jobs) : undefined;
  usePageTitle(job ? `Apply: ${titleOf(job)}` : 'Apply');
  // The pager walks the queue with this job held in its place, so "2 of 3" stays put after Mark
  // applied (the job leaves To apply) and Next still means the one after it.
  const sequence = useMemo(
    () =>
      job
        ? toApplyQueue(
            jobs.map((j) => (j.url === job.url ? { ...j, status: 'Saved', archived: false } : j)),
          )
        : queue,
    [jobs, job, queue],
  );
  useEffect(() => window.scrollTo(0, 0), [jobId]);
  // When the last Not a fit ran. The view is not keyed by job, so this outlives the job change.
  const lastNotAFit = useRef(0);

  if (!job) {
    return (
      <Stack gap="normal">
        <BackToPipeline />
        <EmptyState
          framed
          icon={ListChecks}
          title={queue.length ? 'Pick up where you left off' : 'To apply is empty'}
          description={
            queue.length
              ? `${queue.length} ${queue.length === 1 ? 'job is' : 'jobs are'} waiting to be applied to.`
              : 'Save jobs from Companies or paste a link, then come back here to apply.'
          }
          action={
            queue.length ? (
              <Button variant="primary" onClick={() => openApply(jobIdOf(queue[0].url))}>
                Start applying
              </Button>
            ) : (
              // Never a dead end: the one action points to where jobs come from (rev-3 empty).
              <Button
                variant="secondary"
                onClick={() => navigate({ tab: 'discover', sub: null, jobId: null })}
              >
                Find the next company
              </Button>
            )
          }
        />
      </Stack>
    );
  }

  const idx = sequence.findIndex((j) => j.url === job.url);
  const others = queue.filter((j) => j.url !== job.url);
  // After this one: the next job still to apply to, else the first, else back to the Pipeline.
  const next = sequence.slice(idx + 1).find((j) => others.includes(j)) ?? others[0] ?? undefined;
  const goNext = () => (next ? openApply(jobIdOf(next.url)) : openJob(null));

  const markApplied = () => {
    setStatus(job.url, 'Applied');
  };
  const notAFit = () => {
    // A double tap's second tap lands on the next job's Not a fit, which renders under the finger.
    // Ignore Not a fit for a moment after one runs, so a double tap sets aside one job.
    const now = Date.now();
    if (now - lastNotAFit.current < DOUBLE_TAP_MS) return;
    lastNotAFit.current = now;
    updateJob(job.url, { archived: true });
    showNotice({
      title: 'Set aside as not a fit',
      description: titleOf(job),
      actions: [{ label: 'Undo', run: () => updateJob(job.url, { archived: false }) }],
    });
    goNext();
  };

  const company = job.company?.trim();
  // rev-3 B: company · location · the applied date once applied, else when it was saved.
  const saved = statusAgo(job);
  const dueOn = followUpDate(job, new Date());
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="normal">
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <BackToPipeline />
          {sequence.length > 0 && (
            // Hug the right edge: the pager is only as wide as its three parts.
            <Box sx={{ flex: '0 0 auto' }}>
              <Pagination
                variant="compact"
                label="Jobs to apply"
                page={idx + 1}
                count={sequence.length}
                onPageChange={(p) => openApply(jobIdOf(sequence[p - 1].url))}
              />
            </Box>
          )}
        </Stack>
        <PageHeader
          level={2}
          metadata={<JobBadges job={job} />}
          title={titleOf(job)}
          description={
            job.company || job.location || saved ? (
              // PageHeader wraps the description in a <p>: a span keeps the HTML valid.
              <MetaCaption as="span" items={[company, job.location?.trim(), saved]} />
            ) : undefined
          }
        />
        <Box sx={{ display: 'flex', '& > *': { flex: '1 1 0%' } }}>
          <Button asChild variant="primary" size="md">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              <Icon icon={ExternalLink} />
              Open application
            </a>
          </Button>
        </Box>

        {job.status === 'Saved' ? (
          // One row of two equal secondaries under the primary (rev-3 E).
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'xs' }}>
            <Button
              variant="secondary"
              size="md"
              iconLeft={<Icon icon={Check} />}
              onClick={markApplied}
            >
              Mark applied
            </Button>
            <Button variant="secondary" size="md" onClick={notAFit}>
              Not a fit
            </Button>
          </Box>
        ) : (
          // A short title (the body step inside .rjb-inline-alerts); the company and the date,
          // written as the Pipeline writes it, go in the body.
          <Box className="rjb-inline-alerts">
            <Alert tone="success" title="Applied">
              {[
                company ? `Applied to ${company}.` : '',
                "It's under Follow up in the Pipeline.",
                dueOn ? `Follow up on ${dayLabel(dueOn, new Date())}.` : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </Alert>
          </Box>
        )}
        {job.status !== 'Saved' && !next && (
          <Box>
            <Button variant="secondary" size="md" onClick={() => openJob(null)}>
              To apply is empty · back to Pipeline
            </Button>
          </Box>
        )}

        <ApplyTemplates job={job} />
        <ApplicationKit job={job} />
      </Stack>
    </Box>
  );
}

const previewOf = (text: string) => previewText(text);

/** Copy with a short "Copied" confirmation; a refused copy says why in a toast. */
function CopyButton({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const r = await copyFilled(value);
    if (!r.ok) return toast({ title: r.reason, tone: 'warning' });
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button
      size="md"
      variant="secondary"
      disabled={!value}
      iconLeft={<Icon icon={copied ? Check : Copy} />}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      onClick={copy}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** One label + value with one-tap Copy and inline edit. Empty: a prompt to add it. */
function CopyRow({
  label,
  value,
  onSave,
  multiline = false,
  as = 'li',
}: {
  as?: 'li' | 'div';
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const done = () => {
    onSave(draft.trim());
    setEditing(false);
  };
  const Field = multiline ? Textarea : HdsInput;
  return (
    <Box as={as} sx={{ py: 'xs' }} aria-label={label}>
      {editing ? (
        <Stack gap="tight">
          <Field
            label={label}
            value={draft}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
              setDraft(e.target.value)
            }
            onKeyDown={(e: React.KeyboardEvent) => {
              if (!multiline && e.key === 'Enter') done();
            }}
          />
          <Stack direction="row" gap="tight">
            <Button size="md" variant="secondary" onClick={done}>
              Done
            </Button>
            <Button size="md" variant="tertiary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <Box sx={{ minWidth: 0, flex: '1 1 0%' }}>
            <Text variant="ui" as="p" className="rjb-semibold">
              {label}
            </Text>
            <Text variant="caption" as="p" tone="secondary" className="rjb-prewrap">
              {value || `Add your ${label.toLowerCase()}`}
            </Text>
          </Box>
          <Stack direction="row" gap="tight" align="center">
            {/* A labelled secondary (rev-3 mock: "Add"), named for its field. */}
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${value ? 'Edit' : 'Add'} ${label}`}
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
            >
              {value ? 'Edit' : 'Add'}
            </Button>
            {value && <CopyButton label={label} value={value} />}
          </Stack>
        </Stack>
      )}
    </Box>
  );
}

/** A list inside a panel: rows split by hairlines, padded like the panel's header. */
function Rows({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <Box
      as="ul"
      aria-label={label}
      sx={{ listStyle: 'none', m: 0, p: 0, '& > li': { px: 'md' } }}
      className="rjb-rows"
    >
      {children}
    </Box>
  );
}

/** An expandable row (HDS Disclosure variant="row") as one list item. */
function DisclosureItem({
  label,
  preview,
  actions,
  children,
}: {
  label: string;
  preview: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box as="li" aria-label={label} sx={{ py: 'xs' }}>
      <Disclosure variant="row" label={label} preview={preview} actions={actions}>
        {children}
      </Disclosure>
    </Box>
  );
}

/** The Apply sheet's templates (#239): every template filled for this job, one row each. */
function ApplyTemplates({ job }: { job: Job }) {
  const kit = useApplyKit();
  const snippets = useOutreachTemplates();
  const rows = useMemo(
    () => filledTemplates(snippets, job, kit.fields.name),
    [snippets, job, kit.fields.name],
  );
  const edit = (label: string) => (
    <Box>
      {/* HDS Button asChild drops iconLeft, so the pencil is the link's own child. */}
      <Button asChild variant="secondary" size="md">
        <a href="#/copy-deck">
          <Icon icon={Pencil} />
          {label}
        </a>
      </Button>
    </Box>
  );
  return (
    <Panel label="Documents" title="Documents">
      <PanelBody>
        <Stack gap="tight">
          <Text variant="caption" as="p" tone="secondary">
            {rows.length
              ? 'Filled for this job. Copy one into the form or an email.'
              : 'Write an outreach message once in Documents; it shows here filled for each job.'}
          </Text>
          {edit(rows.length ? 'Edit documents' : 'Write a message')}
        </Stack>
      </PanelBody>
      {rows.length > 0 && (
        <Rows label="Your templates">
          {/* A row is its name, the start of the text (blanks fill in place) and Copy: Copy is
              the row's one action, so there is no chevron (rev-3 review). The whole text is in
              Documents. */}
          {rows.map((r) => (
            <Box as="li" key={r.id} aria-label={r.label} sx={{ py: 'xs' }}>
              <BlankText
                preview
                text={r.text}
                job={job}
                documentId={snippets.find((s) => s.id === r.id)?.documentId}
                head={
                  <Text variant="ui" as="p" className="rjb-semibold">
                    {r.label}
                  </Text>
                }
                action={<CopyButton label={r.label} value={r.text} />}
              />
            </Box>
          ))}
        </Rows>
      )}
    </Panel>
  );
}

function ApplicationKit({ job }: { job: Job }) {
  const kit = useApplyKit();
  const snippets = useOutreachTemplates();
  const options = [
    { value: '', label: 'No template' },
    ...snippets.map((s) => ({ value: s.id, label: s.label || 'Untitled' })),
  ];
  const template = (id?: string) => snippets.find((x) => x.id === id);
  const filled = (id?: string) => {
    const s = template(id);
    return s ? fillSnippet(s, job, kit.fields.name) : '';
  };
  const have = KIT_FIELDS.filter((f) => kit.fields[f.key]);
  const missing = KIT_FIELDS.filter((f) => !kit.fields[f.key]);
  const fieldRow = (f: (typeof KIT_FIELDS)[number]) => (
    <CopyRow
      key={f.key}
      label={f.label}
      value={kit.fields[f.key] ?? ''}
      onSave={(v) => setKitField(f.key, v)}
    />
  );
  const answered = kit.answers.length;
  const { user } = useCloudSync(); // signed out, the kit stays on this device
  return (
    <Panel
      label="Application kit"
      title="Application kit"
      badge={`${have.length} of ${KIT_FIELDS.length}`}
    >
      <PanelBody>
        <Text variant="caption" as="p" tone="secondary">
          {user
            ? 'Enter these once. They follow your account.'
            : 'Enter these once. Saved on this device only.'}
        </Text>
      </PanelBody>
      <Rows label="Profile">
        {have.map((f) => fieldRow(f))}
        {/* Empty fields fold into one row, so the filled ones stay in reach (rev-3 mock). */}
        {missing.length > 0 && (
          <DisclosureItem
            label={`Fill in ${missing.length} more`}
            preview={missing.map((f) => f.label).join(', ')}
          >
            {/* Nested rows split by hairlines, like the panel's own rows. */}
            <Box
              as="ul"
              aria-label="More fields"
              sx={{ listStyle: 'none', m: 0, p: 0 }}
              className="rjb-rows"
            >
              {missing.map((f) => fieldRow(f))}
            </Box>
          </DisclosureItem>
        )}
        {(
          [
            ['whyTemplate', 'Why this company'],
            ['coverTemplate', 'Cover note'],
          ] as const
        ).map(([slot, label]) => {
          const text = filled(kit[slot]);
          return (
            <DisclosureItem
              key={slot}
              label={label}
              preview={text ? previewOf(text) : 'Pick a template to fill'}
              actions={text ? <CopyButton label={label} value={text} /> : undefined}
            >
              <Stack gap="tight">
                <Select
                  label={`${label} template`}
                  options={options}
                  value={kit[slot] ?? ''}
                  onChange={(v) => setKitTemplate(slot, v)}
                />
                {text && (
                  <BlankText text={text} job={job} documentId={template(kit[slot])?.documentId} />
                )}
              </Stack>
            </DisclosureItem>
          );
        })}
        <DisclosureItem
          label="Custom answers"
          preview={
            answered
              ? kit.answers
                  .map((a) => a.q.trim())
                  .filter(Boolean)
                  .join(', ') || `${answered} saved`
              : 'Questions forms keep asking (visa, relocation, how you heard)'
          }
        >
          <Stack gap="tight">
            <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Your answers">
              {kit.answers.map((a) => (
                <AnswerRow key={a.id} a={a} />
              ))}
            </Box>
            <Box>
              <Button
                variant="tertiary"
                size="md"
                iconLeft={<Icon icon={Plus} />}
                onClick={() => addAnswer()}
              >
                Add a question
              </Button>
            </Box>
          </Stack>
        </DisclosureItem>
      </Rows>
    </Panel>
  );
}

function AnswerRow({ a }: { a: KitAnswer }) {
  return (
    <Box as="li" sx={{ pb: 'xs' }}>
      <Stack gap="tight">
        <Stack direction="row" gap="tight" align="end">
          <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>
            <HdsInput
              label="Question"
              value={a.q}
              placeholder="e.g. Do you need visa sponsorship?"
              onChange={(e) => updateAnswer(a.id, { q: e.target.value })}
            />
          </Box>
          <Button
            size="md"
            variant="tertiary"
            iconOnly
            iconLeft={<Icon icon={Trash2} />}
            label={a.q.trim() ? `Remove question ${a.q}` : 'Remove this question'}
            onClick={() => removeAnswer(a.id)}
          />
        </Stack>
        <CopyRow
          label={a.q || 'Answer'}
          value={a.a}
          multiline
          onSave={(v) => updateAnswer(a.id, { a: v })}
          as="div"
        />
      </Stack>
    </Box>
  );
}
