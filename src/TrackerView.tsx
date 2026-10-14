import { Fragment, useMemo, useState } from 'react';
import { PageHeader } from '@hirobius/design-system/patterns';
import { ArrowUpDown, Search, Briefcase, ListFilter, Plus } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Menu as HdsMenu,
  Dialog,
  Icon,
  Box,
  Stack,
  Text,
  Disclosure,
} from '@hirobius/design-system';
import { useJobs, addJob } from './store';
import { deriveJobState } from './jobState';
import { sortJobs, SORTS, type SortKey } from './jobSort';
import { FunnelSummary } from './FunnelSummary';
import { PipelineStats } from './PipelineStats';
import ThisWeek from './ThisWeek';
import EmptyState from './EmptyState';
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import type { Job, Status } from './types';
import JobCard from './JobCard';

type Filter = 'active' | 'all' | Status | 'retired';

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
          {shown.map((j) => (
            <JobCard key={j.url} job={j} />
          ))}
        </Box>
      )}
    </Box>
  );
}
