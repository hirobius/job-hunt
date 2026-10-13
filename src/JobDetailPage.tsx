// A saved job's own page (#/queue/<encoded url>). Everything the rest-state row leaves out lives
// here, in two columns from md up: the working column (edit fields, screening, interviews, notes,
// to-dos) and a rail of facts + research. Below md it stacks, facts first.
import { useRef, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Badge, Button, Card, Input, Textarea } from '@hirobius/design-system';
import { Box, Stack, Typography } from './ui/box';
import { updateJob, setStatus, logFollowUp, prettyTitle, hostOf } from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { verdictTone, modeLabel, blockerLabel } from './screening';
import { ScreeningEditor } from './ScreeningEditor';
import InterviewLog from './InterviewLog';
import UseTemplate from './UseTemplate';
import { TodosNotes } from './TodosNotes';
import EmptyState from './EmptyState';
import { Monogram, JobActionsMenu } from './JobRow';
import { STATUS_TONE, timingLabel } from './jobDisplay';
import type { Job } from './types';

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ display: 'grid', rowGap: 1.5 }}>
      <Typography
        variant="caption"
        component="h2"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, m: 0 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Fact({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', columnGap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.primary', overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
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
    <Box sx={{ minWidth: 0, '& > *': { width: '100%' } }}>
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
    </Box>
  );
  const pair = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Button variant="tertiary" size="sm" iconLeft={<ArrowLeft size={16} />} onClick={back}>
          Tracker
        </Button>
      </Box>

      {/* Header: identity left, status + next actions right. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '48px minmax(0,1fr)', md: '56px minmax(0,1fr) auto' },
          columnGap: 2,
          rowGap: 1.5,
          alignItems: 'center',
          pb: 3,
          mb: 3,
          borderBottom: '1px solid var(--semantic-color-border-subtle)',
        }}
      >
        <Monogram job={job} size={52} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h2"
            sx={{ fontSize: { xs: '1.35rem', sm: '1.6rem' }, lineHeight: 1.2, m: 0 }}
          >
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {[job.company, job.location].filter(Boolean).join(' · ') || hostOf(job.url)}
          </Typography>
        </Box>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
        >
          <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
          {s.isApplyable && (
            <Button size="sm" variant="primary" onClick={() => setStatus(job.url, 'Applied')}>
              Mark applied
            </Button>
          )}
          {s.followUp.due && (
            <Button
              size="sm"
              variant="secondary"
              tone="warning"
              onClick={() => logFollowUp(job.url)}
            >
              Log follow-up
            </Button>
          )}
          <Button size="sm" variant="secondary" iconRight={<ExternalLink size={14} />} asChild>
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              Open posting
            </a>
          </Button>
          <UseTemplate job={job} />
          <JobActionsMenu job={job} />
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1fr) 300px' },
          columnGap: 5,
          rowGap: 4,
          alignItems: 'start',
        }}
      >
        <Box
          component="aside"
          aria-label="Job facts"
          sx={{ order: { xs: 0, md: 1 }, display: 'grid', rowGap: 3, minWidth: 0 }}
        >
          <Card bordered padding="none">
            <Box sx={{ p: 2.5, display: 'grid', rowGap: 1.25 }}>
              <Fact label="Status" value={s.status} />
              <Fact label="Timing" value={timing} />
              <Fact label="Salary" value={job.salary} />
              <Fact label="Seniority" value={job.seniority} />
              <Fact
                label="Fit"
                value={
                  job.verdict && (
                    <Badge tone={verdictTone(job.verdict)}>
                      {job.verdict.charAt(0).toUpperCase() + job.verdict.slice(1)}
                    </Badge>
                  )
                }
              />
              <Fact
                label="Mode"
                value={
                  job.mode &&
                  `${modeLabel(job.mode)}${job.travelPct != null ? ` · ${job.travelPct}% travel` : ''}`
                }
              />
              <Fact
                label="Blockers"
                value={job.blockers?.length ? job.blockers.map(blockerLabel).join(', ') : undefined}
              />
              <Fact
                label="Applicants"
                value={job.applicants != null ? String(job.applicants) : undefined}
              />
              <Fact label="Source" value={hostOf(job.url)} />
            </Box>
          </Card>
          <Section title="Research">
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {research(title).map(([name, href]) => (
                <Button key={name} size="sm" variant="secondary" asChild>
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                </Button>
              ))}
            </Box>
          </Section>
        </Box>

        <Box sx={{ display: 'grid', rowGap: 4, minWidth: 0 }}>
          <Section title="Details">
            <Box sx={{ height: 0, textAlign: 'right', position: 'relative', top: -28 }}>
              <Typography
                variant="caption"
                color="success.main"
                style={{ opacity: saved ? 1 : 0, transition: 'opacity 0.2s' }}
              >
                Saved ✓
              </Typography>
            </Box>
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
          </Section>
          <Section title="Screening">
            <ScreeningEditor job={job} />
          </Section>
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
        </Box>
      </Box>
    </Box>
  );
}
