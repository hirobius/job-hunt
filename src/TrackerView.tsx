import { Fragment, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@hirobius/design-system/patterns';
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
  Briefcase,
  ListFilter,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Button as UiButton,
  Card as HdsCard,
  Input as HdsInput,
  Menu as HdsMenu,
  Dialog,
  Textarea,
  Icon,
  Box,
  Stack,
  Text,
  Disclosure,
  InlineLink,
  Switcher,
} from '@hirobius/design-system';
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
import ThisWeek from './ThisWeek';
import UseTemplate from './UseTemplate';
import InterviewLog from './InterviewLog';
import EmptyState from './EmptyState';
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import { TodosNotes } from './TodosNotes';
import type { Job, Status } from './types';

type Filter = 'active' | 'all' | Status | 'retired';

// Status → HDS Badge tone (the semantic feedback tokens; Interviewing = inProgress).
const STATUS_TONE: Record<Status, 'warning' | 'info' | 'inProgress' | 'success' | 'danger'> = {
  Saved: 'warning',
  Applied: 'info',
  Interviewing: 'inProgress',
  Offer: 'success',
  Rejected: 'danger',
};

// The status menu (#129): two views, then the stages grouped by where a job is.
const FILTER_LABEL: Record<Filter, string> = {
  active: 'Active',
  all: 'All',
  Saved: 'Saved',
  Applied: 'Applied',
  Interviewing: 'Interviewing',
  Offer: 'Offer',
  Rejected: 'Rejected',
  retired: 'Retired',
};
const INSIGHTS_KEY = 'rjb_ui_insights_open';
const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

const FILTER_GROUPS: { label: string; items: Filter[] }[] = [
  { label: 'Views', items: ['active', 'all'] },
  { label: 'In progress', items: ['Saved', 'Applied', 'Interviewing', 'Offer'] },
  { label: 'Closed', items: ['Rejected', 'retired'] },
];

function matches(j: Job, f: Filter): boolean {
  const s = deriveJobState(j);
  if (f === 'active') return s.isActive;
  if (f === 'all') return true;
  if (f === 'retired') return !!j.archived;
  return !j.archived && s.status === f;
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
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(() => {
    try {
      return localStorage.getItem(INSIGHTS_KEY) === '1';
    } catch {
      return false;
    }
  });
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
    return sortJobs(jobs, sort).filter((j) => matches(j, filter) && textMatch(j));
  }, [jobs, filter, sort, q]);
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? '';
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTER_GROUPS.flatMap((g) => g.items).map((f) => [
          f,
          jobs.filter((j) => matches(j, f)).length,
        ]),
      ) as Record<Filter, number>,
    [jobs],
  );

  const submit = () => {
    if (!url.trim()) return;
    addJob(url.trim());
    setUrl('');
    setAddOpen(false);
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

  const addJobButton = (
    <UiButton
      variant="primary"
      size="sm"
      iconLeft={<Plus size={16} />}
      onClick={() => setAddOpen(true)}
    >
      Add job
    </UiButton>
  );

  return (
    <Box>
      {/* One page header: the screen's name, its counts and its one primary action. */}
      <PageHeader
        level={2}
        title="Pipeline"
        status={
          jobs.length > 0 ? (
            <Text variant="caption" as="span" style={SECONDARY}>
              {`${counts.active} active · ${counts.all} total`}
            </Text>
          ) : undefined
        }
        // One primary action per state: on first use it lives in the empty state instead.
        actions={jobs.length > 0 ? addJobButton : undefined}
        style={{ marginBottom: 'var(--primitive-space-4)' }}
      />

      {/* One toolbar (#115 / #129): search grows; status and sort sit beside it and wrap under it
          on phones. Status is a grouped menu, not an 8-option strip. No toolbar until there is
          something to search or filter. */}
      {jobs.length > 0 && (
        <Stack
          direction="row"
          wrap="wrap"
          gap="tight"
          align="center"
          style={{ marginBottom: 'var(--primitive-space-4)' }}
        >
          <Box sx={{ flex: '1 1 14rem', minWidth: 0, '& > *': { width: '100%' } }}>
            <HdsInput
              size="sm"
              aria-label="Search saved jobs"
              placeholder="Search jobs…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leadingVisual={<Search size={16} />}
              style={{ width: '100%' }}
            />
          </Box>
          <Stack direction="row" wrap="wrap" gap="tight" align="center">
            <HdsMenu>
              <HdsMenu.Trigger asChild>
                <UiButton
                  variant="secondary"
                  size="sm"
                  iconLeft={<ListFilter size={16} />}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {`Status: ${FILTER_LABEL[filter]}`}
                </UiButton>
              </HdsMenu.Trigger>
              <HdsMenu.Content align="end">
                <HdsMenu.RadioGroup value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                  {FILTER_GROUPS.map((g, gi) => (
                    <Fragment key={g.label}>
                      {gi > 0 && <HdsMenu.Separator />}
                      <HdsMenu.Label>{g.label}</HdsMenu.Label>
                      {g.items.map((f) => (
                        <HdsMenu.RadioItem key={f} value={f}>
                          <Box
                            as="span"
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 'sm',
                              width: '100%',
                            }}
                          >
                            <span>{FILTER_LABEL[f]}</span>
                            <span style={{ color: 'var(--semantic-color-content-secondary)' }}>
                              {counts[f]}
                            </span>
                          </Box>
                        </HdsMenu.RadioItem>
                      ))}
                    </Fragment>
                  ))}
                </HdsMenu.RadioGroup>
              </HdsMenu.Content>
            </HdsMenu>
            <HdsMenu>
              <HdsMenu.Trigger asChild>
                {/* Icon-only so search · status · sort · add fit two rows at 390px; the name and
                  tooltip carry the current order. */}
                <UiButton
                  variant="tertiary"
                  size="sm"
                  iconOnly
                  iconLeft={<ArrowUpDown size={16} />}
                  label={`Sort: ${sortLabel}`}
                  title={`Sort: ${sortLabel}`}
                />
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
          </Stack>
        </Stack>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Content style={{ width: '100%', maxWidth: 480 }}>
          <Dialog.Header>
            <Dialog.Title>Add a job</Dialog.Title>
            <Dialog.Description>
              Paste the posting's link. The title fills in from the URL; you can edit it after.
            </Dialog.Description>
          </Dialog.Header>
          <HdsInput
            label="Job URL"
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <UiButton variant="secondary">Cancel</UiButton>
            </Dialog.Close>
            <UiButton variant="primary" disabled={!url.trim()} onClick={submit}>
              Add
            </UiButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <SampleBanner jobs={jobs} />
      <ThisWeek />
      {/* Dense layout: metrics fold into one closed "Insights" row so the list starts near the
          top (Phase 2 moves them to Today). */}
      {jobs.length > 0 && (
        <Disclosure
          label="Insights"
          variant="nav"
          open={insightsOpen}
          onOpenChange={(o) => {
            setInsightsOpen(o);
            try {
              localStorage.setItem(INSIGHTS_KEY, o ? '1' : '0');
            } catch {
              /* storage blocked */
            }
          }}
        >
          <PipelineStats jobs={jobs} />
          <FunnelSummary jobs={shown} />
        </Disclosure>
      )}

      {jobs.length === 0 ? (
        // First use (21st.dev empty-state references): say what the screen will hold, one
        // primary action, one way to see it working — all on one centred axis. HDS EmptyState is
        // left-aligned with an italic title and no action slot (hds#654), so this composes Text.
        <Stack
          gap="normal"
          align="center"
          style={{
            paddingBlock: 'var(--primitive-space-8)',
            textAlign: 'center',
            maxWidth: '28rem',
            marginInline: 'auto',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: 'surface.raised',
              color: 'accent',
            }}
          >
            <Icon icon={Briefcase} />
          </Box>
          <Stack gap="tight" align="center">
            <Text variant="title" as="h3" style={{ margin: 0 }}>
              Track your first job
            </Text>
            <Text variant="body" as="p" style={{ ...SECONDARY, margin: 0 }}>
              Paste a job link to save it here, then screen it, apply and follow up. You can also
              save jobs from Discover.
            </Text>
          </Stack>
          <Stack direction="row" wrap="wrap" gap="tight" justify="center">
            {addJobButton}
            <TrySampleButton />
          </Stack>
        </Stack>
      ) : shown.length === 0 ? (
        <EmptyState
          message={
            q.trim()
              ? `No saved jobs match “${q.trim()}”.`
              : filter === 'active'
                ? 'Nothing left to apply to right now — nice. Check Applied or add more jobs.'
                : `Nothing under “${filter}”.`
          }
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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
            return (
              <HdsCard
                key={j.url}
                bordered
                padding="none"
                style={{ opacity: j.archived ? 0.55 : 1 }}
              >
                <Box
                  sx={{
                    p: 'sm',
                    borderLeft: j.priority
                      ? '3px solid var(--semantic-accent-rest)'
                      : '3px solid transparent',
                  }}
                >
                  {/* Eyebrow + title | status badge · pin · overflow */}
                  <Stack direction="row" gap="gap" align="start">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Text
                        variant="caption"
                        as="span"
                        style={{
                          color: 'var(--semantic-color-content-secondary)',
                          display: 'block',
                        }}
                      >
                        {eyebrow}
                      </Text>
                      <Text
                        variant="body"
                        as="h3"
                        style={{
                          marginTop: 'calc(var(--primitive-space-1) * 0.5)',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        <InlineLink href={j.url} externalIcon={false}>
                          {j.label || prettyTitle(j.url)}
                        </InlineLink>
                      </Text>
                    </Box>
                    {s.status !== 'Saved' && <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>}
                    <UiButton
                      size="sm"
                      variant="tertiary"
                      iconOnly
                      iconLeft={<Icon icon={Star} />}
                      label={j.priority ? 'Unpin priority' : 'Pin as priority'}
                      aria-pressed={!!j.priority}
                      onClick={() => updateJob(j.url, { priority: !j.priority })}
                      style={j.priority ? { color: 'var(--semantic-accent-rest)' } : undefined}
                    />
                    <HdsMenu>
                      <HdsMenu.Trigger asChild>
                        <UiButton
                          size="sm"
                          variant="tertiary"
                          iconOnly
                          iconLeft={<Icon icon={EllipsisVertical} />}
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
                        gap: 2.5,
                        mt: 'xs',
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
                              gap: 0.8,
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
                            <Text
                              variant="caption"
                              as="span"
                              style={{
                                color: 'var(--semantic-color-content-secondary)',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {f.text}
                            </Text>
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
                        gap: 1,
                        mt: 'xs',
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
                        <Text
                          variant="caption"
                          as="span"
                          style={{ color: 'var(--semantic-color-content-secondary)' }}
                        >
                          {j.applicants} applied
                        </Text>
                      )}
                    </Box>
                  )}

                  {/* Meta chips — source host + notes indicator */}
                  {(host || j.note) && (
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                        mt: 'xs',
                        alignItems: 'center',
                      }}
                    >
                      {host && <Badge tone="neutral">{host}</Badge>}
                      {j.note && (
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.7 }}>
                          <StickyNote
                            size={13}
                            style={{ color: 'var(--semantic-color-content-secondary)' }}
                          />
                          <Text
                            variant="caption"
                            as="span"
                            style={{ color: 'var(--semantic-color-content-secondary)' }}
                          >
                            Notes
                          </Text>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Actions */}
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 'xs',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      mt: 3,
                    }}
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
                      <Text
                        variant="caption"
                        as="span"
                        style={{ color: 'var(--semantic-color-content-secondary)' }}
                      >
                        Follow up in {s.followUp.daysUntil}d
                      </Text>
                    )}
                  </Box>

                  {/* Per-role to-dos + notes (self-contained expander) */}
                  <Box sx={{ mt: 'xs' }}>
                    <TodosNotes job={j} />
                  </Box>

                  <Disclosure
                    label="Details"
                    variant="nav"
                    open={isOpen}
                    onOpenChange={(o) => setOpen((p) => ({ ...p, [j.url]: o }))}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 3 }}>
                      <Box sx={{ height: 18, textAlign: 'right' }}>
                        <Text
                          variant="caption"
                          as="span"
                          style={{
                            color: 'var(--semantic-color-feedback-success)',
                            opacity: savedUrl === j.url ? 1 : 0,
                            transition: 'opacity 0.2s',
                          }}
                        >
                          Saved ✓
                        </Text>
                      </Box>
                      {fld(j, 'label', 'Title')}
                      <Switcher gap="tight">
                        {fld(j, 'company', 'Company')}
                        {fld(j, 'location', 'Location')}
                      </Switcher>
                      <Switcher gap="tight">
                        {fld(j, 'seniority', 'Seniority')}
                        {fld(j, 'salary', 'Salary')}
                      </Switcher>
                      <ScreeningEditor job={j} />
                      <InterviewLog job={j} />
                      {fld(j, 'note', 'Notes', true)}
                      <Switcher gap="tight">
                        {fld(j, 'contact', 'Contact / referral')}
                        {fld(j, 'resume', 'Résumé version')}
                      </Switcher>
                      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        {research(j.label).map(([name, href]) => (
                          <UiButton key={name} size="sm" variant="secondary" asChild>
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              {name}
                            </a>
                          </UiButton>
                        ))}
                      </Box>
                    </Box>
                  </Disclosure>
                </Box>
              </HdsCard>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
