// The phone's walk control (#542, redesign phase 2, plan 5.6): one row of three named controls,
// no box around it. Left, the view picker (the open view's name, bold, with a caret inside): an HDS
// secondary select-style key with the Find chips' fill and height (`.rjb-view-picker`, ApplyWalk.css),
// its left edge on the page gutter, under the Find | Apply control (2026-11-13). An HDS Menu,
// drawn as a sheet on a phone (late.css `.rjb-menu-sheet`), with the seven views and "All jobs". No filters chip since 2026-11-13: there are no filters (Remote only follows the Search
// profile). Right, the pager: it only steps (a sideways swipe on the job steps it too).
// The view name takes the room it needs (prod audit 2026-11-12: it truncated with free space
// left); when the row is too narrow for both, the pager wraps under it. It only truncates on a
// screen too narrow for the name alone. Below lg only: at lg the list sits beside the job.
import { ChevronDown } from 'lucide-react';
import { Box, Button, Menu, Stack } from '@hirobius/design-system';
import { decided } from './decided';
import { skippedPostings } from './passed';
import ApplyPager from './ApplyPager';
import './ApplyWalk.css';
import { useBackSheet } from './useBackCloses';
import {
  FILTER_LABEL,
  NAMED_VIEWS,
  filterCounts,
  setPipelineView,
  usePipelineView,
  type Filter,
} from './pipelineView';
import type { Job } from './types';

// HDS Button has no truncation: the picker may shrink and its name ellipsises (the pager never).
const PICKER = { minWidth: 0, maxWidth: '100%', overflow: 'hidden' } as const;
const GROW = { flex: '1 0 auto', minWidth: 0, maxWidth: '100%' } as const;

export default function ApplyWalk({
  job,
  jobs,
  list,
  order,
  empty = false,
}: {
  job: Job;
  jobs: Job[];
  list: Job[];
  order: Job[];
  /** The view shows no jobs: no pager, the page shows the view's empty state. */
  empty?: boolean;
}) {
  const view = usePipelineView();
  const sheet = useBackSheet('apply-views');
  const skipped = skippedPostings(decided.use().values()).length;
  const counts = filterCounts(jobs, undefined, !!view.remoteOnly, skipped);
  const name = FILTER_LABEL[view.filter];
  return (
    <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="space-between">
      <Stack direction="row" gap="tight" align="center" style={GROW}>
        <Menu {...sheet}>
          <Menu.Trigger asChild>
            <Button
              variant="secondary"
              shadow="none"
              size="md"
              label={`View: ${name}`}
              iconRight={<ChevronDown size={16} />}
              className="rjb-view-picker"
              style={PICKER}
            >
              {/* The label is the Button's own type (HDS ui size, the Button weight), like every
                  other key: no weight of its own (Adrian 2026-11-18: it was bold, 700 beside 600). */}
              <Box as="span" className="rjb-truncate" sx={{ minWidth: 0 }}>
                {name}
              </Box>
            </Button>
          </Menu.Trigger>
          <Menu.Content align="start" className="rjb-menu-sheet">
            <span className="rjb-sheet-handle" aria-hidden="true" />
            <Menu.RadioGroup
              value={view.filter}
              onValueChange={(v) => setPipelineView({ filter: v as Filter })}
            >
              {NAMED_VIEWS.map((f) => (
                <Menu.RadioItem key={f} value={f}>
                  {`${FILTER_LABEL[f]} (${counts[f]})`}
                </Menu.RadioItem>
              ))}
              <Menu.Separator />
              <Menu.RadioItem value="all">{`${FILTER_LABEL.all} (${counts.all})`}</Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu>
      </Stack>
      {!empty && (
        <Box>
          <ApplyPager job={job} list={list} order={order} />
        </Box>
      )}
    </Stack>
  );
}
