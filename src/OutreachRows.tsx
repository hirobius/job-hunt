// Rows of the Teams tool: one outreach target (a team found on GitHub with its repo, stars and
// open roles, or a starter pack's company with its board), the watch action, and the saved-targets
// rows (tray rows: CompaniesPanel puts them on one "Outreach targets" card once one is saved).
import type { ReactNode } from 'react';
import { Badge, Button, InlineLink, Stack, Text } from '@hirobius/design-system';
import { PanelRow, PanelRows } from './PipelinePanel';
import { atsSearchUrl } from './jobsData';
import type { Board } from './feed/sources/ats';
import { removeTarget, useTargets, type Target } from './feed/targets';
import { SOURCE_LABEL } from './feed/types';
import { useWatching } from './outreachShared';

export type Row = Omit<Target, 'savedAt'>;

// A starter pack's target has a board but no count yet; Live postings reads it once watched.
const rolesText = (r: Row) =>
  !r.board
    ? 'Board not found (none on the systems we check; it may hire elsewhere)'
    : r.openRoles === undefined
      ? null
      : `Open roles: ${r.openRoles}`;

export function TargetRow({
  r,
  saved,
  watching,
  onSave,
  onRemove,
  onWatch,
  rolesLine,
  star,
  children,
  showWatch = true,
}: {
  r: Row;
  /** False on a row that is already a watched company: its Watch button would only say so. */
  showWatch?: boolean;
  saved: boolean;
  watching: boolean;
  onSave?: () => void;
  onRemove?: () => void;
  onWatch: (b: Board) => void;
  /** Replaces the stored open-roles count (the Teams tool reads the board live). */
  rolesLine?: string;
  /** The dream-company star. */
  star?: ReactNode;
  /** Shown under the row: the team's matching roles. */
  children?: ReactNode;
}) {
  const careers = atsSearchUrl(`"${r.company}"`, { role: 'careers', where: '', mode: 'any' });
  return (
    <PanelRow>
      {/* Stack's "xs" is the 2px subgrid at any density: rows use the px steps (8 between
          actions, 12 to roles). */}
      <Stack gap="px12">
        <Stack direction="row" gap="px8" align="center" justify="space-between" wrap="wrap">
          <Stack gap="px4">
            <Stack direction="row" gap="px8" align="center" wrap="wrap">
              <Text variant="ui" as="span" className="rjb-semibold">
                {r.website ? (
                  <InlineLink href={r.website} externalIcon={false}>
                    {r.company}
                  </InlineLink>
                ) : (
                  r.company
                )}
              </Text>
              {r.board && <Badge>{SOURCE_LABEL[r.board.kind]}</Badge>}
            </Stack>
            {r.repo && r.repoUrl && (
              <Text variant="caption" as="p" tone="secondary">
                <InlineLink href={r.repoUrl} externalIcon={false}>
                  {r.repo}
                </InlineLink>
                {` · ${(r.stars ?? 0).toLocaleString()} stars`}
              </Text>
            )}
            {(rolesLine ?? rolesText(r)) && (
              <Text variant="caption" as="p" tone="secondary">
                {rolesLine ?? rolesText(r)}
              </Text>
            )}
          </Stack>
          <Stack direction="row" gap="px8" align="center" wrap="wrap">
            {!r.board && (
              <Button size="md" variant="tertiary" asChild>
                <a
                  href={careers}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Search careers for ${r.company}`}
                >
                  Search careers
                </a>
              </Button>
            )}
            {r.board && showWatch && (
              <Button
                size="md"
                variant="tertiary"
                disabled={watching}
                aria-label={`${watching ? 'Watching' : 'Watch board for'} ${r.company}`}
                onClick={() => onWatch(r.board!)}
              >
                {watching ? 'Watching' : 'Watch board'}
              </Button>
            )}
            {onSave && (
              <Button
                size="md"
                variant="tertiary"
                disabled={saved}
                aria-label={`${saved ? 'Saved' : 'Save as target:'} ${r.company}`}
                onClick={onSave}
              >
                {saved ? 'Saved' : 'Save as target'}
              </Button>
            )}
            {onRemove && (
              <Button
                size="md"
                variant="tertiary"
                className="rjb-quiet"
                aria-label={`Remove ${r.company}`}
                onClick={onRemove}
              >
                Remove
              </Button>
            )}
            {star}
          </Stack>
        </Stack>
        {children}
      </Stack>
    </PanelRow>
  );
}

/** The saved targets of a track, as tray rows on a card (the caller shows them only when there is
 *  at least one). */
export function SavedTargets({
  categoryId,
  boardUrls,
}: {
  categoryId: string;
  boardUrls: string[];
}) {
  const targets = useTargets(categoryId);
  const { isWatching, watch } = useWatching(categoryId, boardUrls);
  return (
    <PanelRows label="Saved targets">
      {targets.map((t) => (
        <TargetRow
          key={t.login}
          r={t}
          saved
          watching={isWatching(t.board)}
          onRemove={() => removeTarget(categoryId, t.login)}
          onWatch={watch}
        />
      ))}
    </PanelRows>
  );
}
