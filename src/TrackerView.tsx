import { useMemo, useRef, useState } from 'react';
import { Box, Link, Stack, Typography } from './ui/box';
import {
  EllipsisVertical,
  ArrowUpDown,
  Search,
  Building2,
  MapPin,
  GraduationCap,
  DollarSign,
  Star,
  StickyNote,
  Inbox,
  SearchX,
  PartyPopper,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Button as UiButton,
  Card as HdsCard,
  IconButton as HdsIconButton,
  Input as HdsInput,
  Menu as HdsMenu,
  SegmentedControl,
  Textarea,
} from '@hirobius/design-system';
import { Reveal } from './ui/Reveal';
import {
  useJobs,
  addJob,
  updateJob,
  setStatus,
  removeJob,
  logFollowUp,
  prettyTitle,
  hostOf,
} from './store';
import { deriveJobState } from './jobState';
import { navigate } from './route';
import { setDiscoverSeed } from './discoverSeed';
import { sortJobs, SORTS, type SortKey } from './jobSort';
import { verdictTone, modeLabel, blockerLabel } from './screening';
import { ScreeningEditor } from './ScreeningEditor';
import { FunnelSummary } from './FunnelSummary';
import { PipelineStats } from './PipelineStats';
import DataTools from './DataTools';
import ThisWeek from './ThisWeek';
import UseTemplate from './UseTemplate';
import InterviewLog from './InterviewLog';
import EmptyState from './EmptyState';
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import { TodosNotes } from './TodosNotes';
import { filterOptions, matchesFilter, type TrackerFilter as Filter } from './trackerCounts';
import { monogram, monogramHue } from './monogram';
import type { Job, Status } from './types';

// Status → HDS Badge tone (the semantic feedback tokens; Interviewing = inProgress).
const STATUS_TONE: Record<Status, 'warning' | 'info' | 'inProgress' | 'success' | 'danger'> = {
  Saved: 'warning',
  Applied: 'info',
  Interviewing: 'inProgress',
  Offer: 'success',
  Rejected: 'danger',
};

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
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Transient "Saved ✓" flash after a detail field autosaves (per job url).
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashSaved = (u: string) => {
    setSavedUrl(u);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedUrl(null), 1200);
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const textMatch = (j: Job) =>
      !needle ||
      [j.label, j.company, j.location, j.note, j.contact, j.url].some((f) =>
        (f || '').toLowerCase().includes(needle),
      );
    return sortJobs(jobs, sort).filter((j) => matchesFilter(j, filter) && textMatch(j));
  }, [jobs, filter, sort, q]);
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? '';

  const submit = () => {
    addJob(url);
    setUrl('');
  };
  // Single-line fields are HDS Input; multiline (Notes) is HDS Textarea (both HDS since #11).
  const fld = (j: Job, key: keyof Job, label: string, multiline = false) =>
    multiline ? (
      <Textarea
        label={label}
        rows={2}
        value={(j[key] as string) || ''}
        onChange={(e) => {
          updateJob(j.url, { [key]: e.target.value });
          flashSaved(j.url);
        }}
        style={{ width: '100%' }}
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
            <UiButton variant="primary" onClick={submit} style={{ flex: 1 }}>
              Add
            </UiButton>
          </Box>
        </Stack>
      </Stack>

      {/* Status chips with live counts (21st.dev filter-chip pattern): Active + All always show; a
          status appears only once a job sits under it, so the row stays short on phones and every
          chip is worth tapping. The row still scrolls sideways if it ever overflows. */}
      <Box sx={{ mb: 0.5, overflowX: 'auto', pb: 0.5, '& > *': { minWidth: 'max-content' } }}>
        <SegmentedControl
          aria-label="Filter jobs by status"
          size="sm"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={filterOptions(jobs, filter).map((o) => ({
            value: o.value,
            label: `${o.label} · ${o.count}`,
          }))}
        />
      </Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mb: 2 }}
      >
        <Box sx={{ flex: 1, minWidth: 0, width: '100%', '& > *': { width: '100%' } }}>
          <HdsInput
            size="sm"
            aria-label="Search saved jobs"
            placeholder="Search title, company, location, notes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            leadingVisual={<Search size={16} />}
            style={{ width: '100%' }}
          />
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 'none' }}>
          <HdsMenu>
            <HdsMenu.Trigger asChild>
              <UiButton
                variant="tertiary"
                size="sm"
                iconLeft={<ArrowUpDown size={16} />}
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
          <DataTools />
        </Stack>
      </Stack>

      <SampleBanner jobs={jobs} />
      <ThisWeek />
      <PipelineStats jobs={jobs} />
      <FunnelSummary jobs={shown} />

      {shown.length === 0 ? (
        jobs.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Your tracker is empty"
            message="Paste a job link above to start a queue, or save roles straight from Discover."
            action={<TrySampleButton />}
            secondaryAction={
              <UiButton variant="tertiary" size="sm" onClick={() => navigate({ tab: 'discover' })}>
                Browse Discover
              </UiButton>
            }
          />
        ) : q.trim() ? (
          <EmptyState
            icon={SearchX}
            title={`No matches for “${q.trim()}”`}
            message="Try a company, city or a word from your notes."
            action={
              <UiButton variant="secondary" size="sm" onClick={() => setQ('')}>
                Clear search
              </UiButton>
            }
          />
        ) : filter === 'active' ? (
          <EmptyState
            icon={PartyPopper}
            title="Queue cleared"
            message="Nothing left to apply to right now. Check Applied for follow-ups, or add more roles."
            action={
              <UiButton variant="secondary" size="sm" onClick={() => setFilter('Applied')}>
                See Applied
              </UiButton>
            }
            secondaryAction={
              <UiButton variant="tertiary" size="sm" onClick={() => navigate({ tab: 'discover' })}>
                Find more roles
              </UiButton>
            }
          />
        ) : (
          <EmptyState
            title={`Nothing under “${filter}”`}
            message="Jobs move here as their status changes."
            action={
              <UiButton variant="secondary" size="sm" onClick={() => setFilter('all')}>
                Show all
              </UiButton>
            }
          />
        )
      ) : (
        <Stack spacing={1.25}>
          {shown.map((j) => {
            const s = deriveJobState(j);
            const isOpen = !!open[j.url];
            // Eyebrow = status-aware timing (the status word itself lives in the badge).
            const eyebrow =
              s.status === 'Saved'
                ? 'Saved'
                : [
                    s.appliedDaysAgo != null
                      ? `Applied ${s.appliedDaysAgo === 0 ? 'today' : s.appliedDaysAgo + 'd ago'}`
                      : s.status,
                    s.followUp.loggedDaysAgo != null
                      ? `followed up ${s.followUp.loggedDaysAgo === 0 ? 'today' : s.followUp.loggedDaysAgo + 'd ago'}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
            // Icon-led facts — only those the job actually has.
            const facts: Array<{ icon: LucideIcon; text: string }> = [];
            if (j.company) facts.push({ icon: Building2, text: j.company });
            if (j.location) facts.push({ icon: MapPin, text: j.location });
            if (j.seniority) facts.push({ icon: GraduationCap, text: j.seniority });
            if (j.salary) facts.push({ icon: DollarSign, text: j.salary });
            const host = hostOf(j.url);
            // Stable per-company tint for the monogram; text stays the theme's primary ink so the
            // medallion reads in both light and dark mode.
            const hue = monogramHue(j.company || host || j.url);
            return (
              <HdsCard
                key={j.url}
                bordered
                padding="none"
                style={{ opacity: j.archived ? 0.55 : 1 }}
              >
                <Box
                  sx={{
                    p: 2,
                    borderLeft: j.priority
                      ? '3px solid var(--semantic-accent-rest)'
                      : '3px solid transparent',
                  }}
                >
                  {/* Monogram · eyebrow + title | status badge · pin · overflow */}
                  <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                    <Box
                      aria-hidden
                      sx={{
                        flex: 'none',
                        width: { xs: 36, sm: 40 },
                        height: { xs: 36, sm: 40 },
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 13,
                        letterSpacing: '0.02em',
                        color: 'text.primary',
                        backgroundColor: `oklch(0.7 0.12 ${hue} / 0.18)`,
                        border: `1px solid oklch(0.7 0.12 ${hue} / 0.32)`,
                      }}
                    >
                      {monogram(j.company, host, j.label || prettyTitle(j.url))}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Metadata slot: status badge + timing eyebrow share one line, so the
                          header row keeps its width for the title on phones. */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 0.75,
                          minWidth: 0,
                        }}
                      >
                        {s.status !== 'Saved' && (
                          <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            display: 'block',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            fontSize: 11,
                          }}
                        >
                          {eyebrow}
                        </Typography>
                      </Box>
                      <Link
                        href={j.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        color="text.primary"
                        sx={{
                          fontWeight: 600,
                          fontSize: '1.05rem',
                          lineHeight: 1.25,
                          display: 'block',
                          mt: 0.25,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {j.label || prettyTitle(j.url)}
                      </Link>
                    </Box>
                    {/* The pin button is desktop-only; on phones it lives in the overflow menu
                        (and the accent rail already shows a pinned job) so the title keeps its
                        width. */}
                    <Box sx={{ display: { xs: 'none', sm: 'inline-flex' }, flex: 'none' }}>
                      <HdsIconButton
                        size="sm"
                        variant="tertiary"
                        icon={Star}
                        label={j.priority ? 'Unpin priority' : 'Pin as priority'}
                        aria-pressed={!!j.priority}
                        onClick={() => updateJob(j.url, { priority: !j.priority })}
                        style={j.priority ? { color: 'var(--semantic-accent-rest)' } : undefined}
                      />
                    </Box>
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
                        <HdsMenu.Item onSelect={() => updateJob(j.url, { priority: !j.priority })}>
                          {j.priority ? 'Unpin priority' : 'Pin as priority'}
                        </HdsMenu.Item>
                        <HdsMenu.Item onSelect={() => updateJob(j.url, { archived: !j.archived })}>
                          {j.archived ? 'Unretire' : 'Retire'}
                        </HdsMenu.Item>
                        <HdsMenu.Separator />
                        {/* Reverse interop (issue #57): seed Discover's Title search with this
                            job's title and jump there — pipeline feeds discovery. */}
                        <HdsMenu.Item
                          onSelect={() => {
                            setDiscoverSeed(j.label || prettyTitle(j.url));
                            navigate({ tab: 'discover', sub: 'titles' });
                          }}
                        >
                          Find more like this
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

                  {/* Icon-led facts line — company · location · seniority · salary */}
                  {facts.length > 0 && (
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1.25,
                        mt: 1,
                        alignItems: 'center',
                      }}
                    >
                      {facts.map((f, i) => {
                        const Icon = f.icon;
                        return (
                          <Box
                            key={i}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.4,
                              minWidth: 0,
                            }}
                          >
                            <Icon
                              size={14}
                              style={{
                                color: 'var(--semantic-color-content-secondary)',
                                flexShrink: 0,
                              }}
                            />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ overflowWrap: 'anywhere' }}
                            >
                              {f.text}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                  {/* Screening chips — verdict / mode / dealbreakers / applicant count (issue #60) */}
                  {(j.verdict ||
                    j.mode ||
                    (j.blockers && j.blockers.length > 0) ||
                    j.applicants != null) && (
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 0.5,
                        mt: 1,
                        alignItems: 'center',
                      }}
                    >
                      {j.verdict && (
                        <Badge tone={verdictTone(j.verdict)}>
                          {j.verdict.charAt(0).toUpperCase() + j.verdict.slice(1)}
                        </Badge>
                      )}
                      {j.mode && (
                        <Badge tone="neutral">
                          {modeLabel(j.mode)}
                          {j.travelPct != null ? ` · ${j.travelPct}% travel` : ''}
                        </Badge>
                      )}
                      {j.blockers?.map((b) => (
                        <Badge key={b} tone="danger">
                          {blockerLabel(b)}
                        </Badge>
                      ))}
                      {j.applicants != null && (
                        <Typography variant="caption" color="text.secondary">
                          {j.applicants} applied
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Meta chips — source host + notes indicator */}
                  {(host || j.note) && (
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 0.5,
                        mt: 1,
                        alignItems: 'center',
                      }}
                    >
                      {host && <Badge tone="neutral">{host}</Badge>}
                      {j.note && (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35 }}>
                          <StickyNote
                            size={13}
                            style={{ color: 'var(--semantic-color-content-secondary)' }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            Notes
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Actions */}
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ mt: 1.5 }}
                    alignItems="center"
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {s.isApplyable && (
                      <UiButton
                        size="sm"
                        variant="primary"
                        tone="info"
                        onClick={() => setStatus(j.url, 'Applied')}
                      >
                        Mark applied
                      </UiButton>
                    )}
                    <UiButton
                      size="sm"
                      variant="tertiary"
                      onClick={() => setOpen((p) => ({ ...p, [j.url]: !p[j.url] }))}
                    >
                      {isOpen ? 'Hide' : 'Details'}
                    </UiButton>
                    <UseTemplate job={j} />
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
                  </Stack>

                  {/* Per-role to-dos + notes (self-contained expander) */}
                  <Box sx={{ mt: 1 }}>
                    <TodosNotes job={j} />
                  </Box>

                  <Reveal open={isOpen}>
                    <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                      <Box sx={{ height: 18, textAlign: 'right' }}>
                        <Typography
                          variant="caption"
                          color="success.main"
                          style={{
                            opacity: savedUrl === j.url ? 1 : 0,
                            transition: 'opacity 0.2s',
                          }}
                        >
                          Saved ✓
                        </Typography>
                      </Box>
                      {fld(j, 'label', 'Title')}
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        {fld(j, 'company', 'Company')}
                        {fld(j, 'location', 'Location')}
                      </Stack>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        {fld(j, 'seniority', 'Seniority')}
                        {fld(j, 'salary', 'Salary')}
                      </Stack>
                      <ScreeningEditor job={j} />
                      <InterviewLog job={j} />
                      {fld(j, 'note', 'Notes', true)}
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        {fld(j, 'contact', 'Contact / referral')}
                        {fld(j, 'resume', 'Résumé version')}
                      </Stack>
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                        {research(j.label).map(([name, href]) => (
                          <UiButton key={name} size="sm" variant="secondary" asChild>
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              {name}
                            </a>
                          </UiButton>
                        ))}
                      </Box>
                    </Stack>
                  </Reveal>
                </Box>
              </HdsCard>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
