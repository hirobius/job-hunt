import React, { lazy, Suspense, useMemo, useRef, useState } from 'react';
import {
  Box,
  Collapse,
  Fade,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { EllipsisVertical, Sparkles, ArrowUpDown } from 'lucide-react';
import {
  Badge,
  Card as HdsCard,
  IconButton as HdsIconButton,
  Input as HdsInput,
  Menu as HdsMenu,
  SegmentedControl,
} from '@hirobius/design-system';
import { Button as UiButton } from './ui/Button';
import {
  useJobs,
  addJob,
  updateJob,
  setStatus,
  removeJob,
  logFollowUp,
  prettyTitle,
  shortUrl,
} from './store';
import { deriveJobState } from './jobState';
import { sortJobs, SORTS, type SortKey } from './jobSort';
import EmptyState from './EmptyState';
import type { Job, Status } from './types';

// Lazy so the AI code (and its chunks) only load when the user opens them —
// keeps the initial Queue bundle lean.
const AiIntakeDialog = lazy(() => import('./ai/AiIntakeDialog'));
const TailorDialog = lazy(() => import('./ai/TailorDialog'));

type Filter = 'active' | 'all' | Status | 'retired';

// Status → HDS Badge tone (the semantic feedback tokens; Interviewing = inProgress).
const STATUS_TONE: Record<Status, 'warning' | 'info' | 'inProgress' | 'success' | 'danger'> = {
  Saved: 'warning',
  Applied: 'info',
  Interviewing: 'inProgress',
  Offer: 'success',
  Rejected: 'danger',
};

function matches(j: Job, f: Filter): boolean {
  const s = deriveJobState(j);
  if (f === 'active') return s.isActive;
  if (f === 'all') return true;
  if (f === 'retired') return !!j.archived;
  return !j.archived && s.status === f;
}

function exportCsv(jobs: Job[]) {
  const rows = [
    [
      'label',
      'url',
      'status',
      'applied',
      'resume',
      'contact',
      'salary',
      'priority',
      'retired',
      'note',
    ],
  ];
  jobs.forEach((j) =>
    rows.push([
      j.label,
      j.url,
      deriveJobState(j).status,
      j.applied || '',
      j.resume || '',
      j.contact || '',
      j.salary || '',
      j.priority ? 'yes' : '',
      j.archived ? 'yes' : '',
      j.note || '',
    ]),
  );
  const csv = rows
    .map((r) => r.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'apply-board.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function research(label: string) {
  const q = encodeURIComponent(label || '');
  return [
    ['Glassdoor', `https://www.glassdoor.com/Search/results.htm?keyword=${q}`],
    ['LinkedIn', `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
    ['levels.fyi', `https://www.levels.fyi/?search=${q}`],
    ['Google', `https://www.google.com/search?q=${q}+careers+reviews`],
  ];
}

export default function TrackerView() {
  const jobs = useJobs();
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<SortKey>('recent');
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMounted, setAiMounted] = useState(false); // mount once, then animate open/close
  const openAi = () => {
    setAiMounted(true);
    setAiOpen(true);
  };
  const [tailorJob, setTailorJob] = useState<Job | null>(null);
  // Transient "Saved ✓" flash after a detail field autosaves (per job url).
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashSaved = (u: string) => {
    setSavedUrl(u);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedUrl(null), 1200);
  };

  const shown = useMemo(
    () => sortJobs(jobs, sort).filter((j) => matches(j, filter)),
    [jobs, filter, sort],
  );
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? '';

  const submit = () => {
    addJob(url);
    setUrl('');
  };
  // Single-line fields are HDS Input (label slot built in); multiline (Notes) stays
  // MUI TextField until HDS ships a Textarea.
  const fld = (j: Job, key: keyof Job, label: string, multiline = false) =>
    multiline ? (
      <TextField
        size="small"
        fullWidth
        label={label}
        multiline
        minRows={2}
        value={(j[key] as string) || ''}
        onChange={(e) => {
          updateJob(j.url, { [key]: e.target.value });
          flashSaved(j.url);
        }}
      />
    ) : (
      <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
        <HdsInput
          size="sm"
          label={label}
          value={(j[key] as string) || ''}
          onChange={(e) => {
            updateJob(j.url, { [key]: e.target.value });
            flashSaved(j.url);
          }}
          style={{ width: '100%' }}
        />
      </Box>
    );

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            aria-label="Job URL"
            placeholder="Paste a job URL…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            style={{ width: '100%' }}
          />
        </Box>
        <Stack direction="row" spacing={1} sx={{ flex: 'none' }}>
          {/* Box wrappers carry the responsive flex the seam Button can't express via sx. */}
          <Box sx={{ display: 'flex', flex: { xs: 1, sm: 'none' } }}>
            <UiButton variant="contained" onClick={submit} style={{ flex: 1 }}>
              Add
            </UiButton>
          </Box>
          <Box sx={{ display: 'flex', flex: { xs: 1, sm: 'none' } }}>
            <UiButton
              variant="outlined"
              startIcon={<Sparkles size={16} />}
              onClick={openAi}
              style={{ flex: 1, whiteSpace: 'nowrap' }}
            >
              Add with AI
            </UiButton>
          </Box>
        </Stack>
      </Stack>

      {/* Filters get the full row to themselves (horizontally scrollable — a partially
          visible pill is the scroll affordance); sort/export live on their own line below.
          Sharing one row squeezed the filters to a single pill on phones. */}
      <Box sx={{ mb: 0.5, overflowX: 'auto', pb: 0.5, '& > *': { minWidth: 'max-content' } }}>
        <SegmentedControl
          aria-label="Filter jobs by status"
          size="sm"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'all', label: 'All' },
            { value: 'Saved', label: 'Saved' },
            { value: 'Applied', label: 'Applied' },
            { value: 'Interviewing', label: 'Interviewing' },
            { value: 'Offer', label: 'Offer' },
            { value: 'Rejected', label: 'Rejected' },
            { value: 'retired', label: 'Retired' },
          ]}
        />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="flex-end"
        sx={{ mb: 2 }}
      >
        <HdsMenu>
          <HdsMenu.Trigger asChild>
            <UiButton
              size="small"
              startIcon={<ArrowUpDown size={16} />}
              style={{ whiteSpace: 'nowrap' }}
            >
              {sortLabel}
            </UiButton>
          </HdsMenu.Trigger>
          <HdsMenu.Content align="end">
            <HdsMenu.RadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              {SORTS.map((s) => (
                <HdsMenu.RadioItem key={s.key} value={s.key}>
                  {s.label}
                </HdsMenu.RadioItem>
              ))}
            </HdsMenu.RadioGroup>
          </HdsMenu.Content>
        </HdsMenu>
        <UiButton size="small" disabled={!jobs.length} onClick={() => exportCsv(jobs)}>
          Export CSV
        </UiButton>
      </Stack>

      {shown.length === 0 ? (
        <EmptyState
          message={
            jobs.length === 0
              ? 'No saved jobs yet — paste a link above, or save some from Discover.'
              : filter === 'active'
                ? 'Nothing left to apply to right now — nice. Check Applied or add more jobs.'
                : `Nothing under “${filter}”.`
          }
        />
      ) : (
        <Stack spacing={1.25}>
          {shown.map((j) => {
            const s = deriveJobState(j);
            const isOpen = !!open[j.url];
            return (
              <HdsCard key={j.url} bordered padding="none" style={{ opacity: j.archived ? 0.55 : 1 }}>
                <Box sx={{ p: 2, pb: 1.5 }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link
                        href={j.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        color="text.primary"
                        sx={{ fontWeight: 600, display: 'block', overflowWrap: 'anywhere' }}
                      >
                        {j.label || prettyTitle(j.url)}
                      </Link>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ overflowWrap: 'anywhere' }}
                      >
                        {shortUrl(j.url)}
                        {s.status !== 'Saved' && s.appliedDaysAgo != null
                          ? ` · applied ${s.appliedDaysAgo === 0 ? 'today' : s.appliedDaysAgo + 'd ago'}`
                          : ''}
                        {s.followUp.loggedDaysAgo != null
                          ? ` · followed up ${s.followUp.loggedDaysAgo === 0 ? 'today' : s.followUp.loggedDaysAgo + 'd ago'}`
                          : ''}
                      </Typography>
                    </Box>
                    {s.status !== 'Saved' && <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>}
                    <HdsMenu>
                      <HdsMenu.Trigger asChild>
                        <HdsIconButton
                          size="sm"
                          variant="tertiary"
                          icon={EllipsisVertical}
                          label="More actions"
                        />
                      </HdsMenu.Trigger>
                      <HdsMenu.Content align="end">
                        {s.isApplyable && (
                          <HdsMenu.Item onSelect={() => setStatus(j.url, 'Applied')}>
                            Mark applied
                          </HdsMenu.Item>
                        )}
                        <HdsMenu.Item
                          onSelect={() => updateJob(j.url, { priority: !j.priority })}
                        >
                          {j.priority ? 'Unpin priority' : 'Pin as priority'}
                        </HdsMenu.Item>
                        <HdsMenu.Item onSelect={() => setTailorJob(j)}>
                          Tailor résumé with AI
                        </HdsMenu.Item>
                        <HdsMenu.Item
                          onSelect={() => updateJob(j.url, { archived: !j.archived })}
                        >
                          {j.archived ? 'Unretire' : 'Retire'}
                        </HdsMenu.Item>
                        <HdsMenu.Separator />
                        <HdsMenu.Item
                          onSelect={() => removeJob(j.url)}
                          style={{ color: 'var(--semantic-color-feedback-error)' }}
                        >
                          Remove
                        </HdsMenu.Item>
                      </HdsMenu.Content>
                    </HdsMenu>
                  </Stack>

                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1.25 }}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {s.isApplyable && (
                      <UiButton size="sm" variant="primary" tone="info" onClick={() => setStatus(j.url, 'Applied')}>
                        Mark applied
                      </UiButton>
                    )}
                    <UiButton
                      size="small"
                      variant="text"
                      onClick={() => setOpen((p) => ({ ...p, [j.url]: !p[j.url] }))}
                    >
                      {isOpen ? 'Hide' : 'Details'}
                    </UiButton>
                    {s.followUp.due && (
                      <>
                        <Badge tone="warning">Follow up now</Badge>
                        <UiButton
                          size="sm"
                          variant="secondary"
                          tone="warning"
                          onClick={() => logFollowUp(j.url)}
                        >
                          Log follow-up
                        </UiButton>
                      </>
                    )}
                    {s.followUp.daysUntil != null && (
                      <Typography variant="caption" color="text.secondary">
                        Follow up in {s.followUp.daysUntil}d
                      </Typography>
                    )}
                    {j.priority && (
                      <Badge tone="neutral">Priority</Badge>
                    )}
                  </Stack>

                  <Collapse in={isOpen}>
                    <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                      <Box sx={{ height: 18, textAlign: 'right' }}>
                        <Fade in={savedUrl === j.url}>
                          <Typography variant="caption" color="success.main">
                            Saved ✓
                          </Typography>
                        </Fade>
                      </Box>
                      {fld(j, 'label', 'Title')}
                      {fld(j, 'note', 'Notes', true)}
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        {fld(j, 'contact', 'Contact / referral')}
                        {fld(j, 'resume', 'Résumé version')}
                      </Stack>
                      {fld(j, 'salary', 'Salary')}
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                        {research(j.label).map(([name, href]) => (
                          <UiButton
                            key={name}
                            size="small"
                            variant="outlined"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {name}
                          </UiButton>
                        ))}
                      </Box>
                    </Stack>
                  </Collapse>
                </Box>
              </HdsCard>
            );
          })}
        </Stack>
      )}

      {aiMounted && (
        <Suspense fallback={null}>
          <AiIntakeDialog open={aiOpen} onClose={() => setAiOpen(false)} />
        </Suspense>
      )}
      {tailorJob && (
        <Suspense fallback={null}>
          <TailorDialog open job={tailorJob} onClose={() => setTailorJob(null)} />
        </Suspense>
      )}
    </Box>
  );
}
