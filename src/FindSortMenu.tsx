// Find's Sort (Adrian 2026-11-12): its own icon key in the Review row beside Browse | Deck, out of
// the header's More menu. Named by the open sort ("Sort: Newest"), an HDS Tooltip "Sort", and an HDS
// Menu of radio items. Shown only while there is a list to sort; it orders the Deck too (#617).
import { Button, Icon, Menu, Tooltip as HdsTooltip } from '@hirobius/design-system';
import { ArrowUpDown } from 'lucide-react';
import { useBackSheet } from './useBackCloses';
import { SORT_LABEL, type FeedSort } from './feed/feed';
import type { FindSort } from './FindHeader';

const SORTS: FeedSort[] = ['newest', 'score', 'company'];

export function FindSortMenu({ sort }: { sort: FindSort }) {
  const sheet = useBackSheet('find-sort');
  return (
    <Menu modal={false} {...sheet}>
      <HdsTooltip>
        <HdsTooltip.Trigger asChild>
          <Menu.Trigger asChild>
            <Button
              size="sm"
              variant="tertiary"
              iconOnly
              iconLeft={<Icon icon={ArrowUpDown} />}
              label={`Sort: ${SORT_LABEL[sort.value]}`}
            />
          </Menu.Trigger>
        </HdsTooltip.Trigger>
        <HdsTooltip.Content>Sort</HdsTooltip.Content>
      </HdsTooltip>
      <Menu.Content align="end">
        <Menu.RadioGroup value={sort.value} onValueChange={(v) => sort.onChange(v as FeedSort)}>
          {SORTS.map((s) => (
            <Menu.RadioItem key={s} value={s}>
              {SORT_LABEL[s]}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu>
  );
}
