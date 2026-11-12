// Facts one per line (#616; 2026-11-12, a phone recording): place, work mode, pay, posted day,
// each on its own line with its 16px icon on the first text line (align-items: flex-start), so a
// wrapped place never pulls its icon down to the middle. HDS Card.Facts runs the facts inline after
// each other; this stands in for it in the title block (DetailHeader), the posting cards and Daily
// picks until HDS offers a stacked layout (docs/hds-upstream-asks-0.9.md "Card.Facts stacked").
import type { LucideIcon } from 'lucide-react';
import { Box, Icon, Text } from '@hirobius/design-system';
import './FactLines.css';

export interface FactItem {
  icon: LucideIcon;
  label: string;
}

/** One fact: its icon on the first line of the text. `truncate` keeps a long place on one line. */
export function FactLine({
  icon,
  label,
  truncate = false,
  list = false,
}: FactItem & { truncate?: boolean; list?: boolean }) {
  const Row = list ? 'li' : 'div';
  return (
    <Row className="rjb-fact">
      <span className="rjb-fact-icon" aria-hidden="true">
        <Icon icon={icon} size="small" />
      </span>
      <Text
        variant="caption"
        as="span"
        tone="secondary"
        className={truncate ? 'rjb-truncate min-w-0' : 'min-w-0'}
      >
        {label}
      </Text>
    </Row>
  );
}

export function FactLines({
  items,
  truncateFirst = false,
  list = false,
}: {
  /** A list (the title block, as HDS Card.Facts was); a card's facts stay plain lines, so a
   *  list of cards counts only its cards. */
  list?: boolean;
  items: ReadonlyArray<FactItem | null | undefined | false>;
  /** The first fact (a posting card's place) stays on one line. */
  truncateFirst?: boolean;
}) {
  const kept = items.filter((i): i is FactItem => !!i);
  if (!kept.length) return null;
  return (
    <Box as={list ? 'ul' : 'div'} className="rjb-facts" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {kept.map((f, i) => (
        <FactLine key={`${i}:${f.label}`} {...f} truncate={truncateFirst && i === 0} list={list} />
      ))}
    </Box>
  );
}
