// A header's meta line (rev-3 B): "Bramble & Finch · Remote · Applied Oct 9" as plain caption text.
// Each item is its own text node with the separator between them, so no rendered string holds
// more than one item (the #192 two-per-line rule reads leaf text) and a narrow phone wraps it
// between items. HDS MetaLine takes two items at most; a header has three facts.
import { Fragment } from 'react';
import { Text } from '@hirobius/design-system';

export function MetaCaption({
  items,
}: {
  items: ReadonlyArray<string | null | undefined | false>;
}) {
  const kept = items.filter((i): i is string => !!i);
  if (kept.length === 0) return null;
  return (
    <Text variant="caption" as="p" tone="secondary">
      {kept.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true">{' · '}</span>}
          <span>{item}</span>
        </Fragment>
      ))}
    </Text>
  );
}
