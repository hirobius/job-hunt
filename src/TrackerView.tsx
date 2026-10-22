import { Fragment, useMemo, useRef, useState } from 'react';
import { Search, Briefcase, ChevronDown, Download, MoreHorizontal, Plus } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Menu as HdsMenu,
  Dialog,
  Icon,
  Box,
  Stack,
  Text,
  useAtLeast,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { MetaCaption } from './MetaCaption';
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
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import JobsTable from './JobsTable';
import ApplyQueueSummary from './ApplyQueueSummary';
import GettingStarted from './GettingStarted';
import JobListCard from './JobListCard';
import { Panel, PanelBody } from './PipelinePanel';
import { PipelineLiveness } from './LivenessViews';
import { RecentlyRemovedLink } from './RecentlyRemoved';
import { useTrash } from './trash';
import { navigate } from './route';
import { openExportLinks } from './exportLinks';

// The Status and Sort menus read as selects (rev-3 item 1): they share the row, label left,
// chevron right. HDS Button has no stretch or alignment prop.
// They show only the value ("Active ⌄"): the "Status" / "Sort" prefix lives in the name. Clear
// sits in the panel header, so the two always split the row; a long value still truncates.
const SELECT_LIKE = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  justifyContent: 'space-between',
} as const;
const SELECT_VALUE = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export default function TrackerView() {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter, sort, q } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setSort = (sort: SortKey) => setPipelineView({ sort });
  const setQ = (q: string) => setPipelineView({ q });
  // Something is non-default: Clear shows, and the selects drop their Status / Sort key (rev-3).
  const cleared = filter !== 'active' || q.trim() !== '';
  const [url, setUrl] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  // The dialog opens from the header or the empty state, outside its Root, so it has no Trigger:
  // remember which button opened it and give focus back there on close (a11y pass).
  const addOpener = useRef<HTMLElement | null>(null);
  // A sortable table where there's room for its six columns; compact cards below that (#129).
  const wide = useAtLeast('lg');
  // Export links sits beside Status and Sort; on a phone it folds into a ⋯ menu so they keep room.
  const roomy = useAtLeast('sm');

  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const sortDef = SORTS.find((s) => s.key === sort);
  // The trigger shows the short form; its name says the same words (WCAG label in name).
  const sortLabel = sortDef?.short ?? sortDef?.label ?? '';
  const counts = useMemo(() => filterCounts(jobs), [jobs]);
  // Recently removed's link is the only thing under the list besides the first-run empty; no
  // empty wrapper (and no extra gap) when neither shows.
  const removedCount = useTrash().length;

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
    // Rev-3 rhythm: 4 from the title to its counts, 12 to the sample note, 24 to the panels.
    <Stack gap="px24">
      <Stack gap="tight">
        {/* One page header: the screen's name, its counts 4 under it (rev-3 mock) and its one
            primary action, centred against both lines. Not HDS PageHeader: its description slot
            drops below the actions row with a 12 gap on a phone, and its title slot is the h2
            itself, so it can't hold the counts. */}
        <Box as="header">
          <Stack direction="row" gap="px8" align="center" justify="space-between">
            <Stack gap="px4">
              <Text as="h2" variant="title">
                Pipeline
              </Text>
              <MetaCaption
                items={
                  jobs.length > 0 ? [`${counts.active} active`, `${counts.all} total`] : ['0 jobs']
                }
              />
            </Stack>
            {/* One primary action per state: on first use it lives in the empty state instead. */}
            {jobs.length > 0 && addJobButton}
          </Stack>
        </Box>
        <SampleBanner jobs={jobs} />
      </Stack>
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
            // The filter and search back to their defaults, shown only when one isn't. It lives in
            // the header (like the Documents panels' New), so Status and Sort always split the
            // whole row and never truncate.
            trailing={
              cleared ? (
                <UiButton
                  variant="tertiary"
                  size="sm"
                  label="Clear filters"
                  onClick={() => setPipelineView({ filter: 'active', q: '' })}
                >
                  Clear
                </UiButton>
              ) : undefined
            }
          >
            <PanelBody>
              {/* The full-width search (the panel's width at every size): no form-control cap, and
                  Status and Sort split the row. */}
              <Box className="rjb-form-full">
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
                          <span style={SELECT_VALUE}>{FILTER_LABEL[filter]}</span>
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
                                    <Text variant="ui" as="span" tone="secondary">
                                      {counts[f]}
                                    </Text>
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
                          <span style={SELECT_VALUE}>{sortLabel}</span>
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
                    {roomy ? (
                      <UiButton
                        variant="tertiary"
                        iconLeft={<Icon icon={Download} />}
                        onClick={() => openExportLinks('view')}
                      >
                        Export links
                      </UiButton>
                    ) : (
                      <HdsMenu modal={false}>
                        <HdsMenu.Trigger asChild>
                          <UiButton
                            variant="secondary"
                            iconOnly
                            iconLeft={<Icon icon={MoreHorizontal} />}
                            label="More job actions"
                          />
                        </HdsMenu.Trigger>
                        <HdsMenu.Content align="end">
                          <HdsMenu.Item onSelect={() => openExportLinks('view')}>
                            Export links
                          </HdsMenu.Item>
                        </HdsMenu.Content>
                      </HdsMenu>
                    )}
                  </Stack>
                  {/* Liveness sits with the list it checks: one caption-sized row under the
                      toolbar, never above the page title. */}
                  <PipelineLiveness jobs={jobs} />
                </Stack>
              </Box>
            </PanelBody>
            {shown.length === 0 ? (
              // Its own section under the toolbar, a hairline above (rev-3 filtered-empty).
              <Box sx={{ borderTop: 'thin solid', borderColor: 'border.default', py: 'lg' }}>
                <PanelBody>
                  {q.trim() ? (
                    <EmptyState
                      centered
                      icon={Search}
                      title={`No jobs match "${q.trim()}"`}
                      description="Try a shorter word, or clear the search."
                      action={
                        <UiButton variant="secondary" onClick={() => setQ('')}>
                          Clear search
                        </UiButton>
                      }
                    />
                  ) : filter === 'active' ? (
                    <EmptyState
                      centered
                      icon={Search}
                      title="Nothing left to apply to"
                      description="Check Applied, or add more jobs."
                    />
                  ) : (
                    <EmptyState
                      centered
                      icon={Search}
                      title={`Nothing under “${FILTER_LABEL[filter]}”`}
                      description="Try another status."
                      action={
                        <UiButton variant="secondary" onClick={() => setFilter('active')}>
                          Show active
                        </UiButton>
                      }
                    />
                  )}
                </PanelBody>
              </Box>
            ) : wide ? (
              <PanelBody>
                <JobsTable jobs={shown} sort={sort} onSort={setSort} />
              </PanelBody>
            ) : (
              shown.map((j) => <JobListCard key={j.url} job={j} />)
            )}
          </Panel>
        )}
        {(jobs.length === 0 || removedCount > 0) && (
          <Stack gap="normal">
            {jobs.length === 0 && (
              // First use: the shared teaching empty (#132): what this will hold, one primary action,
              // one way to see it working.
              // rev-3 "Pipeline, empty": one bordered, centred panel (icon tile, title, sentence,
              // Add job + sample data); Find the next company stays below it.
              <EmptyState
                framed
                icon={Briefcase}
                title="Track your first job"
                description="Paste a job link to save it here, then screen it, apply and follow up. You can also save jobs from Companies."
                action={
                  <Stack direction="row" wrap="wrap" gap="tight" justify="center">
                    {addJobButton}
                    <TrySampleButton />
                  </Stack>
                }
              />
            )}
            {/* Removed jobs wait here for 30 days; a quiet link, shown only when there are some. */}
            <RecentlyRemovedLink />
          </Stack>
        )}
        {/* The list always ends by pointing back to Companies (#238), empty or not. Secondary, so
          Add job / Start applying stay the page's one primary. */}
        <Stack direction="row">
          <UiButton variant="secondary" onClick={() => navigate({ tab: 'discover', sub: null })}>
            Find the next company
          </UiButton>
        </Stack>
      </Stack>
      {/* Portals out, so it takes no slot in the page's rhythm. */}
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
    </Stack>
  );
}
