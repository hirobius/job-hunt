// A saved job's own page (#/queue/<encoded url>), phone-first. Order follows what you do next:
//   header (who / what / status / the one primary action)
//   → facts → interviews → notes & to-dos → "Edit details" (fields + screening) → research.
// One column at every width (phone-first app).
import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  Badge,
  Box,
  Button,
  Disclosure,
  Icon,
  Input,
  MetadataList,
  Stack,
  Text,
  Textarea,
} from '@hirobius/design-system';
import { updateJob, setStatus, logFollowUp, prettyTitle, hostOf } from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { verdictTone, modeLabel, blockerLabel } from './screening';
import { ScreeningEditor } from './ScreeningEditor';
import InterviewLog from './InterviewLog';
import UseTemplate from './UseTemplate';
import { TodosNotes } from './TodosNotes';
import EmptyState from './EmptyState';
import { JobAvatar, JobActionsMenu } from './JobRow';
import { STATUS_TONE, timingLabel } from './jobDisplay';
import type { Job } from './types';

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack as="section" gap="tight">
      <Text variant="title" as="h2" style={{ fontSize: '1.0625rem', margin: 0 }}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

export default function JobDetailPage({ job }: { job: Job | undefined }) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = () => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1200);
  };

  if (!job)
    return (
      <EmptyState
        title="This job isn't in your tracker"
        message="It may have been removed, or the link came from another device that hasn't synced."
        action={
          <Button variant="secondary" size="sm" onClick={back}>
            Back to Tracker
          </Button>
        }
      />
    );

  const s = deriveJobState(job);
  const title = job.label || prettyTitle(job.url);
  const timing = timingLabel(job);

  const field = (key: keyof Job, label: string) => (
    <Input
      size="sm"
      label={label}
      value={(job[key] as string) || ''}
      onChange={(e) => {
        updateJob(job.url, { [key]: e.target.value });
        flash();
      }}
      style={{ width: '100%' }}
    />
  );
  const pair = {
    display: 'grid',
    gap: 3,
    gridTemplateColumns: '1fr',
    '&': { gridTemplateColumns: { sm: '1fr 1fr' } },
  };

  const facts = [
    { term: 'Status', description: <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge> },
    timing && { term: 'Next', description: timing },
    job.salary && { term: 'Salary', description: job.salary },
    job.seniority && { term: 'Seniority', description: job.seniority },
    job.verdict && {
      term: 'Fit',
      description: (
        <Badge tone={verdictTone(job.verdict)}>
          {job.verdict.charAt(0).toUpperCase() + job.verdict.slice(1)}
        </Badge>
      ),
    },
    job.mode && {
      term: 'Mode',
      description: `${modeLabel(job.mode)}${job.travelPct != null ? ` · ${job.travelPct}% travel` : ''}`,
    },
    job.blockers?.length && {
      term: 'Blockers',
      description: job.blockers.map(blockerLabel).join(', '),
    },
    job.applicants != null && { term: 'Applicants', description: String(job.applicants) },
    { term: 'Source', description: hostOf(job.url) },
  ].filter(Boolean) as { term: string; description: ReactNode }[];

  const primary = s.followUp.due ? (
    <Button size="md" variant="primary" tone="warning" onClick={() => logFollowUp(job.url)}>
      Log follow-up
    </Button>
  ) : s.isApplyable ? (
    <Button size="md" variant="primary" onClick={() => setStatus(job.url, 'Applied')}>
      Mark applied
    </Button>
  ) : null;

  return (
    <Stack gap="normal">
      <Box>
        <Button variant="tertiary" size="sm" iconLeft={<Icon icon={ArrowLeft} />} onClick={back}>
          Tracker
        </Button>
      </Box>

      {/* Header: identity, then one row of actions (primary first, rare ones in ⋮). */}
      <Stack
        gap="tight"
        style={{
          paddingBlockEnd: 'var(--primitive-space-5)',
          borderBottom: '1px solid var(--semantic-color-border-subtle)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
          <JobAvatar job={job} size="lg" />
          <Box sx={{ minWidth: 0 }}>
            <Text variant="title" as="h1" style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {title}
            </Text>
            <Text variant="caption" as="p" style={{ ...muted, margin: '2px 0 0' }}>
              {[job.company, job.location].filter(Boolean).join(' · ') || hostOf(job.url)}
            </Text>
          </Box>
        </Box>
        <Stack direction="row" gap="gap" align="center" wrap="wrap">
          {primary}
          <Button size="md" variant="secondary" iconRight={<Icon icon={ExternalLink} />} asChild>
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              Open posting
            </a>
          </Button>
          <UseTemplate job={job} />
          <Box sx={{ ml: 'auto' }}>
            <JobActionsMenu job={job} />
          </Box>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gap: 8,
          alignItems: 'start',
          gridTemplateColumns: 'minmax(0, 1fr)',
        }}
      >
        <Box
          as="aside"
          aria-label="Job facts"
          sx={{
            display: 'grid',
            gap: 6,
            minWidth: 0,
          }}
        >
          <MetadataList orientation="horizontal" items={facts} />
        </Box>

        <Stack gap="spacious" style={{ minWidth: 0 }}>
          <Section title="Interviews">
            <InterviewLog job={job} />
          </Section>
          <Section title="Notes & to-dos">
            <Textarea
              label="Job note"
              rows={4}
              value={job.note || ''}
              onChange={(e) => {
                updateJob(job.url, { note: e.target.value });
                flash();
              }}
              style={{ width: '100%' }}
            />
            <TodosNotes job={job} />
          </Section>
          <Disclosure label="Edit details & screening">
            <Stack gap="normal">
              <Text
                variant="caption"
                as="span"
                aria-live="polite"
                style={{
                  color: 'var(--semantic-color-feedback-success)',
                  opacity: saved ? 1 : 0,
                  transition: 'opacity 0.2s',
                  alignSelf: 'flex-end',
                }}
              >
                Saved ✓
              </Text>
              {field('label', 'Title')}
              <Box sx={pair}>
                {field('company', 'Company')}
                {field('location', 'Location')}
              </Box>
              <Box sx={pair}>
                {field('seniority', 'Seniority')}
                {field('salary', 'Salary')}
              </Box>
              <Box sx={pair}>
                {field('contact', 'Contact / referral')}
                {field('resume', 'Résumé version')}
              </Box>
              <ScreeningEditor job={job} />
            </Stack>
          </Disclosure>
          <Section title="Research">
            <Stack direction="row" gap="gap" wrap="wrap">
              {research(title).map(([name, href]) => (
                <Button key={name} size="sm" variant="secondary" asChild>
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                </Button>
              ))}
            </Stack>
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}
