import { useMemo, useState } from 'react';
import { Box, Stack } from './ui/box';
import { ArrowUpDown, Search, Inbox, SearchX, PartyPopper } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Menu as HdsMenu,
  SegmentedControl,
} from '@hirobius/design-system';
import { useJobs, addJob } from './store';
import { navigate, useRoute } from './route';
import JobRow from './JobRow';
import JobDetailPage from './JobDetailPage';
import { jobUrlFromSub } from './jobRoute';
import { sortJobs, SORTS, type SortKey } from './jobSort';
import { FunnelSummary } from './FunnelSummary';
import { PipelineStats } from './PipelineStats';
import DataTools from './DataTools';
import ThisWeek from './ThisWeek';
import EmptyState from './EmptyState';
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import { filterOptions, matchesFilter, type TrackerFilter as Filter } from './trackerCounts';
import type { Job } from './types';

export default function TrackerView() {
  const jobs = useJobs();
  const route = useRoute();
  const detailUrl = jobUrlFromSub(route.tab === 'queue' ? route.sub : null);
  if (detailUrl) return <JobDetailPage job={jobs.find((j) => j.url === detailUrl)} />;
  return <TrackerList jobs={jobs} />;
}

function TrackerList({ jobs }: { jobs: Job[] }) {
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<SortKey>('recent');
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');

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
      {/* One toolbar line at every width: search grows, sort + data menu keep their size. */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
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

      {/* Two-column structure from md up: the queue takes the main column, the agenda, pipeline
          stats and funnel sit in a sticky right rail. Below md everything stacks, rail first. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' },
          columnGap: 4,
          rowGap: 2,
          alignItems: 'start',
        }}
      >
        <Box
          component="aside"
          aria-label="Pipeline overview"
          sx={{
            order: { xs: 0, md: 1 },
            position: { md: 'sticky' },
            top: { md: 16 },
            display: 'grid',
            rowGap: 2,
            minWidth: 0,
          }}
        >
          <SampleBanner jobs={jobs} />
          <ThisWeek />
          <PipelineStats jobs={jobs} />
          <FunnelSummary jobs={shown} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          {shown.length === 0 ? (
            jobs.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Your tracker is empty"
                message="Paste a job link above to start a queue, or save roles straight from Discover."
                action={<TrySampleButton />}
                secondaryAction={
                  <UiButton
                    variant="tertiary"
                    size="sm"
                    onClick={() => navigate({ tab: 'discover' })}
                  >
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
                  <UiButton
                    variant="tertiary"
                    size="sm"
                    onClick={() => navigate({ tab: 'discover' })}
                  >
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
            <Stack spacing={1}>
              {shown.map((j) => (
                <JobRow key={j.url} job={j} />
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Box>
  );
}
