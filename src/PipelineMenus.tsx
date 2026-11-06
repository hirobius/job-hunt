// The Pipeline's Status and Sort menus (#129, rev-3 item 1), select-style and side by side. Shared
// by the Jobs panel and the job list column beside a job (#471).
import { Fragment, useMemo, type Ref } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button as UiButton, Menu as HdsMenu, Box, Stack, Text } from '@hirobius/design-system';
import { useJobs } from './store';
import { SORTS, type SortKey } from './jobSort';
import {
  FILTER_GROUPS,
  FILTER_LABEL,
  filterCounts,
  setPipelineView,
  usePipelineView,
  type Filter,
} from './pipelineView';
import { useBackSheet } from './useBackCloses';

// The Status and Sort menus read as selects (rev-3 item 1): they share the row, label left,
// chevron right. HDS Button has no stretch or alignment prop.
// They show only the value ("Active ⌄"): the "Status" / "Sort" prefix lives in the name. A long
// value truncates.
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

export default function PipelineMenus({
  statusTrigger,
  size,
}: {
  statusTrigger?: Ref<HTMLButtonElement>;
  size?: 'sm' | 'md';
}) {
  const jobs = useJobs();
  const { filter, sort } = usePipelineView();
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setSort = (sort: SortKey) => setPipelineView({ sort });
  const statusSheet = useBackSheet('pipeline-status');
  const sortSheet = useBackSheet('pipeline-sort');
  const sortDef = SORTS.find((s) => s.key === sort);
  // The trigger shows the short form; its name says the same words (WCAG label in name).
  const sortLabel = sortDef?.short ?? sortDef?.label ?? '';
  const counts = useMemo(() => filterCounts(jobs), [jobs]);
  return (
    <Stack direction="row" gap="tight" align="center">
      <HdsMenu {...statusSheet}>
        <HdsMenu.Trigger asChild>
          <UiButton
            ref={statusTrigger}
            size={size}
            variant="secondary"
            iconRight={<ChevronDown size={16} />}
            label={`Status: ${FILTER_LABEL[filter]}`}
            style={SELECT_LIKE}
          >
            <span style={SELECT_VALUE}>{FILTER_LABEL[filter]}</span>
          </UiButton>
        </HdsMenu.Trigger>
        <HdsMenu.Content align="start">
          <HdsMenu.RadioGroup value={filter} onValueChange={(v) => setFilter(v as Filter)}>
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
      <HdsMenu {...sortSheet}>
        <HdsMenu.Trigger asChild>
          <UiButton
            variant="secondary"
            iconRight={<ChevronDown size={16} />}
            label={`Sort: ${sortLabel}`}
            size={size}
            style={SELECT_LIKE}
          >
            <span style={SELECT_VALUE}>{sortLabel}</span>
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
    </Stack>
  );
}
