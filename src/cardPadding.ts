import { useAtLeast } from '@hirobius/design-system';

/** A card's inner padding (roomy layout): HDS `item` (20) on a phone, the surface padding (28)
 *  from sm, never more than the gap between cards. HDS Card `padding` takes no responsive value
 *  (HDS gap registry, "Responsive card padding"). */
export function useCardPadding(): 'item' | 'component' {
  return useAtLeast('sm') ? 'component' : 'item';
}
