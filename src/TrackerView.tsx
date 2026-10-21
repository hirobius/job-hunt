import { Fragment, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@hirobius/design-system/patterns';
import { Search, Briefcase, ChevronDown, Plus } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Menu as HdsMenu,
  Dialog,
  Box,
  Stack,
  Text,
  useAtLeast,
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
import { Panel, PanelBody } from './PipelinePanel';
import { RecentlyRemovedLink } from './RecentlyRemoved';
import { SECONDARY } from './hds-gaps/tone';
import { navigate } from './route';

// The Status and Sort menus read as selects (rev-3 item 1): they share the row, label left,
// chevron right. HDS Button has no stretch or alignment prop.
const SELECT_LIKE = { flex: '1 1 0', minWidth: 0, justifyContent: 'space-between' } as const;

export default function TrackerView() {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter, sort, q } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setSort = (sort: SortKey) => setPipelineView({ sort });
  const setQ = (q: string) => setPipelineView({ q });
  const [url, setUrl] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  // The dialog opens from the header or the empty state, outside its Root, so it has no Trigger:
  // remember which button opened it and give focus back there on close (a11y pass).
  const addOpener = useRef<HTMLElement | null>(null);
  // A sortable table where there's room for its six columns; compact cards below that (#129).
  const wide = useAtLeast('lg');

  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const sortDef = SORTS.find((s) => s.key === sort);
  // The trigger shows the short form; its name says the same words (WCAG label in name).
  const sortLabel = sortDef?.short ?? sortDef?.label ?? '';
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
      iconLeft={<Plus size={16} />}
      onClick={(e) => {
        addOpener.current = e.currentTarget;
        setAddOpen(true);
      }}
    >
      Add job
    </UiButton>
  );

  return (
    // Rev-3 rhythm: 16 under the page header, 24 between the page's panels.
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
      <Stack gap="px24">
        {jobs.length > 0 && (
          <>
            {/* Shown after your first job until dismissed (#132; moved from Today in #236). */}
            <GettingStarted jobs={jobs} />
            <ApplyQueueSummary jobs={jobs} />
          </>
        )}
        {/* The Jobs panel (rev-3 item 1): a full-width search, then Status and Sort as one row
            of select-style menus, all 40px, and a quiet Clear only when something is
            non-default. No panel until there is something to search or filter. */}
        {jobs.length > 0 && (
          <Panel
            label="Jobs"
            title="Jobs"
            count={shown.length}
            countLabel={`${shown.length} ${shown.length === 1 ? 'job' : 'jobs'} shown`}
          >
            <PanelBody>
              {/* Full width on a phone; the HDS form-control cap on a wide screen. */}
              <Box sx={{ maxWidth: 'var(--hds-form-control-max-width, 40rem)' }}>
                <Stack gap="tight">
                  <HdsInput
                    aria-label="Search saved jobs"
                    placeholder="Search jobs"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    leadingVisual={<Search size={16} />}
                  />
                  <Stack direction="row" gap="tight" align="center">
                    <HdsMenu>
                      <HdsMenu.Trigger asChild>
                        <UiButton
                          variant="secondary"
                          iconRight={<ChevronDown size={16} />}
                          label={`Status: ${FILTER_LABEL[filter]}`}
                          style={SELECT_LIKE}
                        >
                          {FILTER_LABEL[filter]}
                        </UiButton>
                      </HdsMenu.Trigger>
                      <HdsMenu.Content align="start">
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
                    <HdsMenu>
                      <HdsMenu.Trigger asChild>
                        <UiButton
                          variant="secondary"
                          iconRight={<ChevronDown size={16} />}
                          label={`Sort: ${sortLabel}`}
                          style={SELECT_LIKE}
                        >
                          {sortLabel}
                        </UiButton>
                      </HdsMenu.Trigger>
                      <HdsMenu.Content align="end">
                        <HdsMenu.RadioGroup
                          value={sort}
                          onValueChange={(v) => setSort(v as SortKey)}
                        >
                          {SORTS.map((s) => (
                            <HdsMenu.RadioItem key={s.key} value={s.key}>
                              {s.label}
                            </HdsMenu.RadioItem>
                          ))}
                        </HdsMenu.RadioGroup>
                      </HdsMenu.Content>
                    </HdsMenu>
                    {/* The filter and search back to their defaults, shown only when one isn't. */}
                    {(filter !== 'active' || q.trim() !== '') && (
                      <UiButton
                        variant="tertiary"
                        label="Clear filters"
                        onClick={() => setPipelineView({ filter: 'active', q: '' })}
                      >
                        Clear
                      </UiButton>
                    )}
                  </Stack>
                </Stack>
              </Box>
            </PanelBody>
            {shown.length === 0 ? (
              <PanelBody>
                <EmptyState
                  message={
                    q.trim()
                      ? `No saved jobs match “${q.trim()}”.`
                      : filter === 'active'
                        ? 'Nothing left to apply to right now — nice. Check Applied or add more jobs.'
                        : `Nothing under “${FILTER_LABEL[filter]}”.`
                  }
                />
              </PanelBody>
            ) : wide ? (
              <PanelBody>
                <JobsTable jobs={shown} sort={sort} onSort={setSort} />
              </PanelBody>
            ) : (
              shown.map((j) => <JobListCard key={j.url} job={j} />)
            )}
          </Panel>
        )}
        <Stack gap="normal">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Dialog.Content
              style={{ width: '100%', maxWidth: 480 }}
              onCloseAutoFocus={(e) => {
                if (!addOpener.current?.isConnected) return;
                e.preventDefault();
                addOpener.current.focus();
              }}
            >
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

          {jobs.length === 0 && (
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
          )}
          {/* Removed jobs wait here for 30 days; a quiet link, shown only when there are some. */}
          <RecentlyRemovedLink />
        </Stack>
        {/* The list always ends by pointing back to Companies (#238), empty or not. Secondary, so
          Add job / Start applying stay the page's one primary. */}
        <Stack direction="row">
          <UiButton variant="secondary" onClick={() => navigate({ tab: 'discover', sub: null })}>
            Find the next company
          </UiButton>
        </Stack>
      </Stack>
    </Stack>
  );
}
