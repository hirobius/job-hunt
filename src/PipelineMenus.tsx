// The Apply list's Sort menu (#129, rev-3 item 1), select-style. The Status menu beside it went in
// #541: the named views (JobViews) replaced it. Shared by the Jobs panel, the phone filter bar and
// the job list column beside a job (#471).
import { ChevronDown } from 'lucide-react';
import { Button as UiButton, Menu as HdsMenu, Stack } from '@hirobius/design-system';
import { SORTS, type SortKey } from './jobSort';
import { setPipelineView, usePipelineView } from './pipelineView';
import { useBackSheet } from './useBackCloses';

// The Sort menu reads as a select (rev-3 item 1): label left, chevron right. HDS Button has no
// stretch or alignment prop. It shows only the value ("Newest ⌄"): the "Sort" prefix lives in
// the name. A long value truncates.
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

export default function PipelineMenus({ size }: { size?: 'sm' | 'md' }) {
  const { sort } = usePipelineView();
  const setSort = (sort: SortKey) => setPipelineView({ sort });
  const sortSheet = useBackSheet('pipeline-sort');
  const sortDef = SORTS.find((s) => s.key === sort);
  // The trigger shows the short form; its name says the same words (WCAG label in name).
  const sortLabel = sortDef?.short ?? sortDef?.label ?? '';
  return (
    <Stack direction="row" gap="tight" align="center">
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
