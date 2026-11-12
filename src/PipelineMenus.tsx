// The Apply list's Sort menu (#129). The Status menu beside it went in
// #541: the named views (JobViews) replaced it. Shared by the All jobs sheet (a chip, #543) and
// the job list column beside a job (#471, an icon, #614).
import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { Button as UiButton, Icon, Menu as HdsMenu, Stack, Tag } from '@hirobius/design-system';
import { SORTS, type SortKey } from './jobSort';
import { setPipelineView, usePipelineView } from './pipelineView';
import { useBackSheet } from './useBackCloses';

/** `compact`: the lg list column's quiet icon-only Sort (#614), never a filled select.
 *  `chip`: the All jobs sheet's Sort chip beside its filter chips (#543), an HDS Tag. */
export default function PipelineMenus({
  size,
  chip,
}: {
  size?: 'sm' | 'md';
  compact?: boolean;
  chip?: boolean;
}) {
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
          {chip ? (
            <Tag aria-label={`Sort: ${sortLabel}`}>
              <Stack as="span" direction="row" gap="px4" align="center">
                <Icon icon={ArrowUpDown} size="small" />
                {sortLabel}
                <ChevronDown size={16} aria-hidden="true" />
              </Stack>
            </Tag>
          ) : (
            <UiButton
              iconOnly
              variant="tertiary"
              size={size}
              label={`Sort: ${sortLabel}`}
              iconLeft={<Icon icon={ArrowUpDown} size="small" />}
            />
          )}
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
