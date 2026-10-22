import { Fragment, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, Briefcase, ChevronDown, Plus } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Menu as HdsMenu,
  Dialog,
  Box,
  Stack,
  Text,
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
import ToApply from './ApplyQueueSummary';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import GettingStarted from './GettingStarted';
import JobCard from './JobCard';
import { Panel, PanelRow, PanelRows } from './PipelinePanel';
import { PipelineLiveness } from './LivenessViews';
import { RecentlyRemovedLink } from './RecentlyRemoved';
import { useTrash } from './trash';
import { navigate } from './route';

export default function TrackerView() {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter, sort, q } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setSort = (sort: SortKey) => setPipelineView({ sort });
  const setQ = (q: string) => setPipelineView({ q });
  // Something is non-default: Clear shows.
  const cleared = filter !== 'active' || q.trim() !== '';
  const [url, setUrl] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  // The dialog opens from the header or the empty state, outside its Root, so it has no Trigger:
  // remember which button opened it and give focus back there on close (a11y pass).
  const addOpener = useRef<HTMLElement | null>(null);
  const now = new Date();

  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const sortDef = SORTS.find((s) => s.key === sort);
  // The trigger shows the short form ("Sort: Newest").
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

  // Start applying is the page's one primary once there are jobs; Add job steps down to a quiet
  // tertiary with its icon (roomy).
  const addJobButton = (
    <UiButton
      variant={jobs.length > 0 ? 'tertiary' : 'primary'}
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
    // Roomy rhythm: 4 from the title to its counts, 12 to the sample note, then 40 to the first
    // section and between sections.
    <Stack gap="inset">
      <Stack gap="medium">
        {/* One page header: the screen's name, its counts 4 under it (rev-3 mock) and its add
            action, centred against both lines. Not HDS PageHeader: its description slot drops
            below the actions row with a 12 gap on a phone, and its title slot is the h2 itself, so
            it can't hold the counts. */}
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
      {jobs.length > 0 && (
        <>
          <ToApply jobs={jobs} />
          {/* Shown after your first job until dismissed (#132; moved from Today in #236). */}
          <GettingStarted jobs={jobs} />
          <FollowUpSection jobs={jobs} now={now} />
          <NextDaysSection jobs={jobs} now={now} />
        </>
      )}
      {/* The Jobs section (roomy): its toolbar on the canvas (a full-width search; Status and Sort
          as quiet menus that say their value), then one card per job at every width. A quiet
          Clear sits in the label row only when something is non-default. No section until there
          is something to search or filter. */}
      {jobs.length > 0 && (
        <Panel
          kind="list"
          label="Jobs"
          title="Jobs"
          count={shown.length}
          countLabel={`${shown.length} ${shown.length === 1 ? 'job' : 'jobs'} shown`}
          trailing={
            cleared ? (
              <UiButton
                variant="tertiary"
                label="Clear filters"
                onClick={() => setPipelineView({ filter: 'active', q: '' })}
              >
                Clear
              </UiButton>
            ) : undefined
          }
        >
          {/* The full-width search: no form-control cap. */}
          <Box className="rjb-form-full">
            <Stack gap="medium">
              <HdsInput
                aria-label="Search saved jobs"
                placeholder="Search jobs"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                leadingVisual={<Search size={16} />}
              />
              <Stack direction="row" wrap="wrap" gap="px8" align="center">
                <HdsMenu>
                  <HdsMenu.Trigger asChild>
                    <UiButton variant="tertiary" iconRight={<ChevronDown size={16} />}>
                      Status: {FILTER_LABEL[filter]}
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
                    <UiButton variant="tertiary" iconRight={<ChevronDown size={16} />}>
                      Sort: {sortLabel}
                    </UiButton>
                  </HdsMenu.Trigger>
                  <HdsMenu.Content align="start">
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
              {/* Liveness sits with the list it checks: one caption-sized row under the toolbar,
                  never above the page title. */}
              <PipelineLiveness jobs={jobs} />
            </Stack>
          </Box>
          {shown.length === 0 ? (
            // On the canvas under the toolbar, with room above and below (rev-3 filtered-empty).
            <Box sx={{ py: 'lg' }}>
              {q.trim() ? (
                <EmptyState
                  centered
                  icon={Search}
                  title={`No jobs match "${q.trim()}"`}
                  description="Try a shorter word, or clear the search."
                  action={
                    <UiButton variant="tertiary" onClick={() => setQ('')}>
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
                    <UiButton variant="tertiary" onClick={() => setFilter('active')}>
                      Show active
                    </UiButton>
                  }
                />
              )}
            </Box>
          ) : (
            <PanelRows label="Jobs shown">
              {shown.map((j) => (
                <PanelRow key={j.url} flush>
                  <JobCard job={j} />
                </PanelRow>
              ))}
            </PanelRows>
          )}
        </Panel>
      )}
      {(jobs.length === 0 || removedCount > 0) && (
        <Stack gap="normal">
          {jobs.length === 0 && (
            // First use: the shared teaching empty (#132): what this will hold, one primary action,
            // one way to see it working. One filled, centred card (icon tile, title, sentence, Add
            // job + sample data); Find the next company stays below it.
            <EmptyState
              framed
              icon={Briefcase}
              title="Track your first job"
              description="Paste a job link to save it here, then screen it, apply and follow up. You can also save jobs from Companies."
              action={
                <Stack direction="row" wrap="wrap" gap="px8" justify="center">
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
      {/* The list always ends by pointing back to Companies (#238), empty or not. Quiet, so Add
          job / Start applying stay the page's one primary. */}
      <Stack direction="row">
        <UiButton
          variant="tertiary"
          iconRight={<ArrowRight size={16} />}
          onClick={() => navigate({ tab: 'discover', sub: null })}
        >
          Find the next company
        </UiButton>
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
