// The phone's walk control (#542, redesign phase 2, plan 5.6): one row of three named controls,
// no box around it. Left, the view picker (the open view's name, bold, with a caret): an HDS Menu,
// drawn as a sheet on a phone (late.css `.rjb-menu-sheet`), with the five views and "All jobs and
// filters". Beside it a "N filters" chip, only while a filter is on (search, Remote only); it opens
// the All jobs sheet. Right, the pager: it only steps (a sideways swipe on the job steps it too).
// The view name truncates, never the pager. Below lg only: at lg the list sits beside the job.
import { ChevronDown } from 'lucide-react';
import { Box, Button, Menu, Stack, Tag, Text } from '@hirobius/design-system';
import ApplyPager from './ApplyPager';
import { useBackSheet } from './useBackCloses';
import {
  FILTER_LABEL,
  NAMED_VIEWS,
  filterCounts,
  filtersOn,
  setPipelineView,
  usePipelineView,
  type Filter,
} from './pipelineView';
import type { Job } from './types';

// HDS Button has no truncation: the picker may shrink and its name ellipsises (the pager never).
const PICKER = { minWidth: 0, maxWidth: '100%', overflow: 'hidden' } as const;
const NAME = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;
const GROW = { flex: '1 1 0', minWidth: 0 } as const;

export default function ApplyWalk({
  job,
  jobs,
  list,
  order,
  onAllJobs,
}: {
  job: Job;
  jobs: Job[];
  list: Job[];
  order: Job[];
  onAllJobs: () => void;
}) {
  const view = usePipelineView();
  const sheet = useBackSheet('apply-views');
  const counts = filterCounts(jobs);
  const n = filtersOn(view);
  const name = FILTER_LABEL[view.filter];
  return (
    <Stack direction="row" gap="tight" align="center" justify="space-between">
      <Stack direction="row" gap="tight" align="center" style={GROW}>
        <Menu {...sheet}>
          <Menu.Trigger asChild>
            <Button
              variant="tertiary"
              size="md"
              label={`View: ${name}`}
              iconRight={<ChevronDown size={16} />}
              style={PICKER}
            >
              <Text as="span" variant="ui" weight="bold" style={NAME}>
                {name}
              </Text>
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
            </Menu.RadioGroup>
            <Menu.Separator />
            <Menu.Item onSelect={onAllJobs}>All jobs and filters</Menu.Item>
          </Menu.Content>
        </Menu>
        {n > 0 && (
          <Tag
            onClick={onAllJobs}
            aria-label={`${n} ${n === 1 ? 'filter' : 'filters'}, open All jobs`}
          >
            {`${n} ${n === 1 ? 'filter' : 'filters'}`}
          </Tag>
        )}
      </Stack>
      <Box>
        <ApplyPager job={job} list={list} order={order} />
      </Box>
    </Stack>
  );
}
