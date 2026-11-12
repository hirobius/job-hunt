// One detail template (redesign §5.4, #546): a saved job on Apply and a posting on Find, at 1440,
// share one header. Top to bottom: an optional Back, the title block (the title as the page's h1,
// the company or its "not stated" line, the facts one per line (FactLines), then the badges), with an
// optional More beside it, then one action row (ActionDock: inline from lg, docked on a phone).
// The content follows the header on its own page (Apply: the kit, Details, Notes…; Find: the
// description). Lives in the lazy route chunks only (JobPage and Today share it).
import type { ReactNode } from 'react';
import { Box, Stack, Text } from '@hirobius/design-system';
import { FactLines, type FactItem } from './hds-gaps/FactLines';
import { ActionDock } from './hds-gaps/ActionDock';

type Facts = FactItem[];

/** The title block: title, company line, facts, then the badges (only when there are some). */
export function DetailTitleBlock({
  title,
  titleId,
  company,
  noCompany,
  logo,
  facts,
  badges,
}: {
  title: string;
  /** The h1's id, when the page's region is named by it. */
  titleId?: string;
  company?: string;
  /** The line shown when there is no company ("Company not stated"). */
  noCompany: string;
  /** Beside the company (a job's CompanyLogo). */
  logo?: ReactNode;
  facts: Facts;
  /** Badges under the facts; nothing renders when it is empty. */
  badges?: ReactNode;
}) {
  return (
    <Stack gap="tight" data-rjb-title-block="">
      <Text variant="title" as="h1" id={titleId} className="rjb-break">
        {title}
      </Text>
      <Stack direction="row" gap="px8" align="center">
        {company && logo}
        {company ? (
          <Text variant="ui" as="p">
            {company}
          </Text>
        ) : (
          <Text variant="ui" as="p" tone="secondary">
            {noCompany}
          </Text>
        )}
      </Stack>
      <FactLines list items={facts} />
      {badges && (
        <Stack direction="row" wrap="wrap" gap="px8" align="center">
          {badges}
        </Stack>
      )}
    </Stack>
  );
}

/** The header: Back, the title block with More at its top end, then the one action row. */
export function DetailHeader({
  back,
  titleBlock,
  more,
  docked,
  label,
  onKeysGone,
  keys,
  children,
}: {
  back?: ReactNode;
  titleBlock: ReactNode;
  /** A menu beside the title block: it does not commit. */
  more?: ReactNode;
  /** A phone docks the keys at the bottom; from lg they sit in one row under the title block. */
  docked: boolean;
  /** The action row's name, e.g. "Actions for Design Systems Lead". */
  label: string;
  onKeysGone?: () => void;
  keys: ReactNode;
  /** Dialogs the keys open. */
  children?: ReactNode;
}) {
  return (
    <Box as="header" sx={{ mb: 'lg' }}>
      <Stack gap="normal">
        {back}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 'xs' }}>
          <Box sx={{ flex: '1 1 0%', minWidth: 0 }}>{titleBlock}</Box>
          {more}
        </Box>
        {/* With no keys it draws nothing; it stays mounted so a focused key that leaves with the
            state (a sync from another device) hands focus to the new filled key, or the title. */}
        <ActionDock docked={docked} label={label} onKeysGone={onKeysGone}>
          {keys}
        </ActionDock>
        {children}
      </Stack>
    </Box>
  );
}
