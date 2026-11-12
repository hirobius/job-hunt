// The Apply screen's filter bar on a phone (Proposal A, Adrian 2026-11-08): one compact row at the
// top (Filters and Add job, then what is shown; All jobs sits with the pager under it); Filters opens the search and Sort (the named views moved to the walk row's picker, #542)
// (the shared pipelineView). Liveness checks itself on open (#602): no action here. Open or closed
// is kept for this page load (view memory).
import { useRef } from 'react';
import { ListFilter, Search } from 'lucide-react';
import { Box, Button, Icon, Input, Stack, Text, Toggle } from '@hirobius/design-system';
import AddJobButton from './AddJob';
import PipelineMenus from './PipelineMenus';
import { useClosedOnBoard } from './useClosedOnBoard';
import { SampleBanner } from './demo/SampleData';
import { FILTER_LABEL, remoteFiltered, setPipelineView, usePipelineView, visibleJobs } from './pipelineView';
import { useRemembered } from './viewMemory';
import { focusNewHeading, pageHeadingNow } from './focusRescue';
import type { Job } from './types';

export default function ApplyFilterBar({ jobs }: { jobs: Job[] }) {
  const view = usePipelineView();
  const shown = visibleJobs(jobs, view);
  const [open, setOpen] = useRemembered('apply:filters', false);
  const search = useRef<HTMLInputElement>(null);
  const closedTail = useClosedOnBoard(remoteFiltered(jobs, view.remoteOnly));
  const cleared = view.filter !== 'toApply' || view.q.trim() !== '';
  // Two items at most on a dotted line (#192): the search rides with the status.
  const summary = `${FILTER_LABEL[view.filter]}${view.q.trim() ? ` “${view.q.trim()}”` : ''} · ${shown.length} ${shown.length === 1 ? 'job' : 'jobs'}${closedTail}`;
  return (
    <Box as="section" aria-label="Filter jobs">
      <Stack gap="tight">
        <Stack direction="row" gap="tight" align="center" wrap="wrap">
          <Button
            size="md"
            variant="secondary"
            iconLeft={<Icon icon={ListFilter} />}
            aria-expanded={open}
            aria-controls="rjb-apply-filters"
            onClick={() => setOpen(!open)}
          >
            Filters
          </Button>
          <AddJobButton size="md" />
          {/* Outside Filters, so it shows while they are closed (Adrian 2026-11-09). Per device. */}
          <RemoteOnlySwitch />
        </Stack>
        <Text variant="caption" as="p" tone="secondary" role="status">
          {summary}
        </Text>
        {open && (
          <Box id="rjb-apply-filters" className="rjb-form-full">
            <Stack gap="tight">
              <Input
                ref={search}
                aria-label="Search saved jobs"
                placeholder="Search jobs"
                value={view.q}
                onChange={(e) => setPipelineView({ q: e.target.value })}
                leadingVisual={<Search size={16} />}
              />
              <PipelineMenus />
              {cleared && (
                <Box>
                  <Button
                    size="md"
                    variant="tertiary"
                    onClick={() => {
                      setPipelineView({ filter: 'toApply', q: '' });
                      search.current?.focus();
                    }}
                  >
                    Clear filters
                  </Button>
                </Box>
              )}
            </Stack>
          </Box>
        )}
        <SampleBanner jobs={jobs} onCleared={() => focusNewHeading(pageHeadingNow())} />
      </Stack>
    </Box>
  );
}

/** Apply's Remote only switch (Adrian 2026-11-09): the phone's filter bar and the lg job rail. */
export function RemoteOnlySwitch() {
  const { remoteOnly } = usePipelineView();
  return (
    <Toggle
      label="Remote only"
      checked={!!remoteOnly}
      onChange={(on) => setPipelineView({ remoteOnly: on })}
    />
  );
}
