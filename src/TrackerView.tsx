// The Tracker tab, phone-first: add → filter → search/sort/data → the job list, then the overview
// (this week, pipeline, funnel). One column at every width: the app is a phone app, and on a
// desktop it keeps HDS's content-width column rather than spreading into a rail.
// A job's own page lives at #/queue/<encoded url> (JobDetailPage).
import { useMemo, useState } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';
import {
  Box,
  Button,
  Icon,
  Input as HdsInput,
  SegmentedControl,
  Stack,
} from '@hirobius/design-system';
import { useJobs, addJob } from './store';
import { navigate, useRoute } from './route';
import JobRow from './JobRow';
import { Sheet, SheetMenu } from './Sheet';
import JobDetailPage from './JobDetailPage';
import { jobUrlFromSub } from './jobRoute';
import { sortJobs, SORTS, type SortKey } from './jobSort';
import { FunnelSummary } from './FunnelSummary';
import { PipelineStats } from './PipelineStats';
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
  const [sortOpen, setSortOpen] = useState(false);

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

  const empty =
    jobs.length === 0 ? (
      <EmptyState
        title="Your tracker is empty"
        message="Paste a job link above to start a queue, or save roles straight from Discover."
        action={<TrySampleButton />}
        secondaryAction={
          <Button variant="tertiary" size="sm" onClick={() => navigate({ tab: 'discover' })}>
            Browse Discover
          </Button>
        }
      />
    ) : q.trim() ? (
      <EmptyState
        title={`No matches for “${q.trim()}”`}
        message="Try a company, city or a word from your notes."
        action={
          <Button variant="secondary" size="sm" onClick={() => setQ('')}>
            Clear search
          </Button>
        }
      />
    ) : filter === 'active' ? (
      <EmptyState
        title="Queue cleared"
        message="Nothing left to apply to right now. Check Applied for follow-ups, or add more roles."
        action={
          <Button variant="secondary" size="sm" onClick={() => setFilter('Applied')}>
            See Applied
          </Button>
        }
        secondaryAction={
          <Button variant="tertiary" size="sm" onClick={() => navigate({ tab: 'discover' })}>
            Find more roles
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={`Nothing under “${filter}”`}
        message="Jobs move here as their status changes."
        action={
          <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
            Show all
          </Button>
        }
      />
    );

  return (
    <Stack gap="normal">
      {/* Add: field grows, button hugs — one line on every width. */}
      <Stack direction="row" gap="gap" align="center">
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
          <HdsInput
            aria-label="Job URL"
            placeholder="Paste a job URL…"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            style={{ width: '100%' }}
          />
        </Box>
        <Button variant="primary" onClick={submit}>
          Add
        </Button>
      </Stack>

      <SampleBanner jobs={jobs} />

      <Stack gap="tight">
        {/* Status chips with live counts: Active + All always; a status once a job is under it.
            Scrolls sideways on phones (a partly visible chip is the affordance). */}
        <Box sx={{ overflowX: 'auto', mx: -1, px: 1, pb: 1, '& > *': { minWidth: 'max-content' } }}>
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

        {/* Search grows; sort + data are icon buttons so the field keeps its width. */}
        <Stack direction="row" gap="gap" align="center">
          <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
            <HdsInput
              size="sm"
              type="search"
              aria-label="Search saved jobs"
              placeholder="Search jobs…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leadingVisual={<Search size={16} />}
              style={{ width: '100%' }}
            />
          </Box>
          <Button
            variant="tertiary"
            size="sm"
            iconOnly
            iconLeft={<Icon icon={ArrowUpDown} />}
            label={`Sort: ${sortLabel}`}
            onClick={() => setSortOpen(true)}
          />
          <Sheet open={sortOpen} onOpenChange={setSortOpen} title="Sort jobs">
            <SheetMenu
              label="Sort order"
              items={SORTS.map((o) => ({
                label: o.label,
                selected: o.key === sort,
                onSelect: () => {
                  setSort(o.key);
                  setSortOpen(false);
                },
              }))}
            />
          </Sheet>
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
        <Box sx={{ minWidth: 0 }}>
          {shown.length === 0 ? (
            empty
          ) : (
            <Stack gap="gap" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {shown.map((j) => (
                <li key={j.url}>
                  <JobRow job={j} />
                </li>
              ))}
            </Stack>
          )}
        </Box>

        {/* Overview after the list. Modules are divided so each reads as its own group (a module
            that renders nothing leaves no divider). */}
        <Box
          as="aside"
          aria-label="Pipeline overview"
          sx={{
            display: 'grid',
            gap: 6,
            minWidth: 0,
            '& > * + *': { borderTop: 'thin solid', borderColor: 'border.subtle', pt: 6 },
          }}
        >
          <ThisWeek />
          <PipelineStats jobs={jobs} />
          <FunnelSummary jobs={shown} />
        </Box>
      </Box>
    </Stack>
  );
}
