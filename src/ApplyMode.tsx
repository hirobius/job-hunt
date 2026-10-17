// Apply mode (rapid apply, #/apply/<jobId>): one job at a time from the To apply queue. A big
// Open application button, then the Application kit as copy rows (profile, answers, filled
// templates), then Mark applied → Next job. Works one-handed on a phone: one column, 40px controls.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Box,
  Button,
  Icon,
  Input as HdsInput,
  Select,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import EmptyState from './EmptyState';
import { findJobById, jobIdOf, setStatus, updateJob, useJobs } from './store';
import { openApply, openJob } from './route';
import { titleOf } from './jobRow';
import { followUpDate, toApplyQueue } from './applyQueue';
import {
  KIT_FIELDS,
  addAnswer,
  removeAnswer,
  setKitField,
  setKitTemplate,
  updateAnswer,
  useApplyKit,
  type KitAnswer,
} from './applyKit';
import { useSnippets } from './copyDeckStore';
import { fillSnippet } from './templateFill';
import { copyFilled } from './templateCopy';
import { showNotice } from './saveNotice';
import { SECONDARY } from './hds-gaps/tone';
import type { Job } from './types';

export default function ApplyMode({ jobId }: { jobId: string | null }) {
  const jobs = useJobs();
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  const job = jobId ? findJobById(jobId, jobs) : undefined;
  useEffect(() => window.scrollTo(0, 0), [jobId]);

  const back = (
    <Button
      variant="tertiary"
      size="sm"
      iconLeft={<Icon icon={ArrowLeft} />}
      onClick={() => openJob(null)}
    >
      Back to Pipeline
    </Button>
  );

  if (!job) {
    return (
      <Stack gap="normal">
        <Box>{back}</Box>
        <EmptyState
          title={queue.length ? 'Pick up where you left off' : 'To apply is empty'}
          message={
            queue.length
              ? `${queue.length} ${queue.length === 1 ? 'job is' : 'jobs are'} waiting to be applied to.`
              : 'Save jobs from Discover or paste a link, then come back here to apply.'
          }
          action={
            queue.length ? (
              <Button variant="primary" onClick={() => openApply(jobIdOf(queue[0].url))}>
                Start applying
              </Button>
            ) : undefined
          }
        />
      </Stack>
    );
  }

  const idx = queue.findIndex((j) => j.url === job.url);
  const next = idx >= 0 ? (queue[idx + 1] ?? queue.find((j) => j !== job)) : queue[0];
  const nextPos = next ? queue.indexOf(next) + 1 : 0;
  const goNext = () => (next ? openApply(jobIdOf(next.url)) : openJob(null));

  const markApplied = () => {
    setStatus(job.url, 'Applied');
  };
  const notAFit = () => {
    updateJob(job.url, { archived: true });
    showNotice({
      title: 'Set aside as not a fit',
      description: titleOf(job),
      actions: [{ label: 'Undo', run: () => updateJob(job.url, { archived: false }) }],
    });
    goNext();
  };

  const company = job.company?.trim();
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="normal">
        <PageHeader
          level={2}
          breadcrumb={back}
          title={titleOf(job)}
          status={
            <Text variant="caption" as="span" style={SECONDARY}>
              {[company, idx >= 0 ? `To apply · ${idx + 1} of ${queue.length}` : job.status]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          }
        />
        <Button asChild variant="primary" size="lg" iconRight={<Icon icon={ExternalLink} />}>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Open application
          </a>
        </Button>

        {job.status !== 'Saved' ? (
          <Alert tone="success" title={`Applied${company ? ` to ${company}` : ''}`}>
            {followUpDate(job)
              ? `It's under Follow up in the Pipeline. Follow up on ${followUpDate(job)}.`
              : "It's under Follow up in the Pipeline."}
          </Alert>
        ) : null}

        <Stack direction="row" wrap="wrap" gap="tight">
          {job.status === 'Saved' ? (
            <>
              <Button variant="secondary" iconLeft={<Icon icon={Check} />} onClick={markApplied}>
                Mark applied
              </Button>
              <Button variant="tertiary" onClick={goNext} disabled={!next}>
                Skip
              </Button>
              <Button variant="tertiary" onClick={notAFit}>
                Not a fit
              </Button>
            </>
          ) : next ? (
            <Button variant="secondary" onClick={goNext}>
              {`Next job (${nextPos} of ${queue.length})`}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => openJob(null)}>
              To apply is empty · back to Pipeline
            </Button>
          )}
        </Stack>

        <ApplicationKit job={job} />
      </Stack>
    </Box>
  );
}

/** One label + value with one-tap Copy and inline edit. Empty: a prompt to add it. */
function CopyRow({
  label,
  value,
  onSave,
  multiline = false,
  editable = true,
  as = 'li',
}: {
  as?: 'li' | 'div';
  label: string;
  value: string;
  onSave?: (v: string) => void;
  multiline?: boolean;
  editable?: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
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
  const done = () => {
    onSave?.(draft.trim());
    setEditing(false);
  };
  const Field = multiline ? Textarea : HdsInput;
  return (
    <Box
      as={as}
      sx={{ py: 'xs', borderBottom: 'thin solid', borderColor: 'border.default' }}
      aria-label={label}
    >
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
            <Text variant="caption" as="p" style={SECONDARY}>
              {label}
            </Text>
            <Text variant="ui" as="p" className="rjb-prewrap">
              {value || (editable ? `Add your ${label.toLowerCase()}` : 'Nothing to fill yet')}
            </Text>
          </Box>
          <Stack direction="row" gap="tight" align="center">
            {editable && (
              <Button
                size="md"
                variant="tertiary"
                iconOnly
                iconLeft={<Icon icon={value ? Pencil : Plus} />}
                label={`${value ? 'Edit' : 'Add'} ${label}`}
                onClick={() => {
                  setDraft(value);
                  setEditing(true);
                }}
              />
            )}
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
          </Stack>
        </Stack>
      )}
    </Box>
  );
}

function ApplicationKit({ job }: { job: Job }) {
  const kit = useApplyKit();
  const snippets = useSnippets();
  const options = [
    { value: '', label: 'No template' },
    ...snippets.map((s) => ({ value: s.id, label: s.label || 'Untitled' })),
  ];
  const filled = (id?: string) => {
    const s = snippets.find((x) => x.id === id);
    return s ? fillSnippet(s, job, kit.fields.name) : '';
  };
  return (
    <Stack gap="normal">
      <Text variant="body" as="h3" className="rjb-semibold">
        Application kit
      </Text>
      <Text variant="caption" as="p" style={SECONDARY}>
        Enter these once; they follow your account. Copy each into the form.
      </Text>
      <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Profile">
        {KIT_FIELDS.map((f) => (
          <CopyRow
            key={f.key}
            label={f.label}
            value={kit.fields[f.key] ?? ''}
            onSave={(v) => setKitField(f.key, v)}
          />
        ))}
      </Box>

      <Text variant="body" as="h3" className="rjb-semibold">
        Letters
      </Text>
      {(
        [
          ['whyTemplate', 'Why this company'],
          ['coverTemplate', 'Cover note'],
        ] as const
      ).map(([slot, label]) => (
        <Stack gap="tight" key={slot}>
          <Select
            label={`${label} template`}
            options={options}
            value={kit[slot] ?? ''}
            onChange={(v) => setKitTemplate(slot, v)}
          />
          <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            <CopyRow label={label} value={filled(kit[slot])} editable={false} multiline />
          </Box>
        </Stack>
      ))}

      <Text variant="body" as="h3" className="rjb-semibold">
        Your answers
      </Text>
      {kit.answers.length === 0 && (
        <Text variant="caption" as="p" style={SECONDARY}>
          Save answers to questions forms keep asking (visa, relocation, how you heard).
        </Text>
      )}
      <Box as="ul" sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label="Your answers">
        {kit.answers.map((a) => (
          <AnswerRow key={a.id} a={a} />
        ))}
      </Box>
      <Box>
        <Button variant="tertiary" iconLeft={<Icon icon={Plus} />} onClick={() => addAnswer()}>
          Add a question
        </Button>
      </Box>
    </Stack>
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
            label={`Remove question ${a.q}`}
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
