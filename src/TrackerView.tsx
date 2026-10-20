import { Fragment, useMemo, useState } from 'react';
import { PageHeader } from '@hirobius/design-system/patterns';
import { ArrowUpDown, Search, Briefcase, Building2, ListFilter, Plus, X } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Menu as HdsMenu,
  Dialog,
  Icon,
  Tag,
  Box,
  Stack,
  Text,
} from '@hirobius/design-system';
import { useJobs } from './store';
import { saveWithNotice } from './saveNotice';
import { SORTS, type SortKey } from './jobSort';
import {
  FILTER_GROUPS,
  FILTER_LABEL,
  filterCounts,
  setPipelineView,
  usePipelineView,
  visibleJobs,
  type Filter,
} from './pipelineView';
import EmptyState from './EmptyState';
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import JobsTable from './JobsTable';
import ApplyQueueSummary from './ApplyQueueSummary';
import GettingStarted from './GettingStarted';
import JobListCard from './JobListCard';
import { RecentlyRemovedLink } from './RecentlyRemoved';
import { useAtLeast } from './hds-gaps/useBreakpoint';
import { SECONDARY } from './hds-gaps/tone';
import { navigate } from './route';

export default function TrackerView() {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter, sort, q } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setSort = (sort: SortKey) => setPipelineView({ sort });
  const setQ = (q: string) => setPipelineView({ q });
  const [url, setUrl] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  // A sortable table where there's room for its six columns; compact cards below that (#129).
  const wide = useAtLeast('lg');

  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? '';
  const counts = useMemo(() => filterCounts(jobs), [jobs]);

  const submit = () => {
    if (!url.trim()) return;
    saveWithNotice(url.trim());
    setUrl('');
    setAddOpen(false);
  };

  // Start applying is the page's one primary once there are jobs; Add job steps down.
  const addJobButton = (
    <UiButton
      variant={jobs.length > 0 ? 'secondary' : 'primary'}
      size="sm"
      iconLeft={<Plus size={16} />}
      onClick={() => setAddOpen(true)}
    >
      Add job
    </UiButton>
  );

  return (
    // HDS docs-site rhythm (#241): 24 under the page header, 48 between the page's sections.
    <Stack gap="normal">
      {/* One page header: the screen's name, its counts and its one primary action. */}
      <PageHeader
        level={2}
        title="Pipeline"
        status={
          jobs.length > 0 ? (
            <Text variant="caption" as="span" tone="secondary">
              {`${counts.active} active · ${counts.all} total`}
            </Text>
          ) : undefined
        }
        // One primary action per state: on first use it lives in the empty state instead.
        actions={jobs.length > 0 ? addJobButton : undefined}
      />
      <SampleBanner jobs={jobs} />
      <Stack gap="spacious">
        {jobs.length > 0 && (
          <>
            {/* Shown after your first job until dismissed (#132; moved from Today in #236). */}
            <GettingStarted jobs={jobs} />
            <ApplyQueueSummary jobs={jobs} />
          </>
        )}
        {/* The list section: toolbar, 24, rows. */}
        <Stack gap="normal">
          {/* One toolbar (#115 / #129): search grows; status and sort sit beside it and wrap under it
          on phones. Status is a grouped menu, not an 8-option strip. No toolbar until there is
          something to search or filter. */}
          {jobs.length > 0 && (
            <Stack direction="row" wrap="wrap" gap="tight" align="center">
              {/* Grows only to the HDS form-control cap, so status and sort sit beside the field. */}
              <Box
                sx={{
                  flex: '1 1 14rem',
                  minWidth: 0,
                  maxWidth: 'var(--hds-form-control-max-width, 40rem)',
                  '& > *': { width: '100%' },
                }}
              >
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
                    <HdsMenu.RadioGroup
                      value={filter}
                      onValueChange={(v) => setFilter(v as Filter)}
                    >
                      {FILTER_GROUPS.map((g, gi) => (
                        <Fragment key={gi}>
                          {gi > 0 && <HdsMenu.Separator />}
                          {g.label && <HdsMenu.Label>{g.label}</HdsMenu.Label>}
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
                                <span style={SECONDARY}>{counts[f]}</span>
                              </Box>
                            </HdsMenu.RadioItem>
                          ))}
                        </Fragment>
                      ))}
                    </HdsMenu.RadioGroup>
                  </HdsMenu.Content>
                </HdsMenu>
                {/* The active filter, when it isn't the default, as a chip that clears it. */}
                {filter !== 'active' && (
                  <Tag
                    active
                    aria-label={`Clear filter: ${FILTER_LABEL[filter]}`}
                    onClick={() => setFilter('active')}
                  >
                    {FILTER_LABEL[filter]}
                    <Icon icon={X} size="small" />
                  </Tag>
                )}
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

          {jobs.length === 0 ? (
            // First use: the shared teaching empty (#132): what this will hold, one primary action,
            // one way to see it working.
            <Box sx={{ paddingBlock: 'xl' }}>
              <EmptyState
                icon={Briefcase}
                title="Track your first job"
                message="Paste a job link to save it here, then screen it, apply and follow up. You can also save jobs from Companies."
                action={
                  <Stack direction="row" wrap="wrap" gap="tight" justify="center">
                    {addJobButton}
                    <TrySampleButton />
                  </Stack>
                }
              />
            </Box>
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
          ) : wide ? (
            <JobsTable jobs={shown} sort={sort} onSort={setSort} />
          ) : (
            // Flat rows split by hairlines (#241): no card per job.
            <Box>
              {shown.map((j) => (
                <JobListCard key={j.url} job={j} />
              ))}
            </Box>
          )}
          {/* Removed jobs wait here for 30 days; a quiet link, shown only when there are some. */}
          <RecentlyRemovedLink />
        </Stack>
        {/* The list always ends by pointing back to Companies (#238), empty or not. Secondary, so
          Add job / Start applying stay the page's one primary. */}
        <Stack direction="row" justify="center">
          <UiButton
            variant="secondary"
            size="sm"
            iconLeft={<Building2 size={16} />}
            onClick={() => navigate({ tab: 'discover', sub: null })}
          >
            Find the next company
          </UiButton>
        </Stack>
      </Stack>
    </Stack>
  );
}
