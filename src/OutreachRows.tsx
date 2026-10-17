// Rows shared by the Teams tool and the By company view: one outreach target (a team found on GitHub,
// with its repo, stars and open roles), the watch action, and the saved-targets section. Kept apart
// from the engine so Live postings can show saved targets without loading the GitHub search code.
import type { ReactNode } from 'react';
import { Badge, Button, InlineLink, Stack, Text } from '@hirobius/design-system';
import { atsSearchUrl } from './jobsData';
import type { Board } from './feed/sources/ats';
import { removeTarget, useTargets, type Target } from './feed/targets';
import { SOURCE_LABEL } from './feed/types';
import { SECONDARY } from './hds-gaps/tone';
import { listStyle, useWatching } from './outreachShared';

export type Row = Omit<Target, 'savedAt'>;

const rolesText = (r: Row) =>
  r.board
    ? `Open roles: ${r.openRoles ?? 0}`
    : 'Board not found (none on the systems we check; it may hire elsewhere)';

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
}: {
  r: Row;
  saved: boolean;
  watching: boolean;
  onSave?: () => void;
  onRemove?: () => void;
  onWatch: (b: Board) => void;
  /** Replaces the stored open-roles count (the Companies tool reads the board live). */
  rolesLine?: string;
  /** The dream-company star. */
  star?: ReactNode;
  /** Shown under the row: the team's matching roles. */
  children?: ReactNode;
}) {
  const careers = atsSearchUrl(`"${r.company}"`, { role: 'careers', where: '', mode: 'any' });
  return (
    <li>
      <Stack gap="xs">
        <Stack direction="row" gap="xs" align="center" justify="space-between" wrap="wrap">
          <Stack gap="px4">
            <Stack direction="row" gap="xs" align="center" wrap="wrap">
              <Text variant="ui" as="span">
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
            <Text variant="caption" style={SECONDARY}>
              <InlineLink href={r.repoUrl} externalIcon={false}>
                {r.repo}
              </InlineLink>
              {` · ${r.stars.toLocaleString()} stars · ${rolesLine ?? rolesText(r)}`}
            </Text>
          </Stack>
          <Stack direction="row" gap="xs" align="center" wrap="wrap">
            {!r.board && (
              <Button size="sm" variant="tertiary" asChild>
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
            {r.board && (
              <Button
                size="sm"
                variant="secondary"
                disabled={watching}
                aria-label={`${watching ? 'Watching' : 'Watch board for'} ${r.company}`}
                onClick={() => onWatch(r.board!)}
              >
                {watching ? 'Watching' : 'Watch board'}
              </Button>
            )}
            {onSave && (
              <Button
                size="sm"
                variant="secondary"
                disabled={saved}
                aria-label={`${saved ? 'Saved' : 'Save as target:'} ${r.company}`}
                onClick={onSave}
              >
                {saved ? 'Saved' : 'Save as target'}
              </Button>
            )}
            {onRemove && (
              <Button
                size="sm"
                variant="tertiary"
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
    </li>
  );
}

/** The saved targets of a track, as a section. Used under the By company view. */
export function SavedTargets({
  categoryId,
  boardUrls,
  heading = true,
  findLink = true,
}: {
  categoryId: string;
  boardUrls: string[];
  heading?: boolean;
  /** Point to the Companies tool's team search (off where there is none to point to). */
  findLink?: boolean;
}) {
  const targets = useTargets(categoryId);
  const { isWatching, watch } = useWatching(categoryId, boardUrls);
  return (
    <Stack gap="xs" as="section" aria-label="Outreach targets">
      {heading && (
        <Text variant="body" as="h3" className="rjb-semibold">
          Outreach targets
        </Text>
      )}
      {targets.length === 0 ? (
        <Text variant="caption" as="p" style={SECONDARY}>
          Companies with no opening yet that you want to write to.
          {findLink && (
            <>
              {' '}
              Find teams in the Companies tool and save the ones worth a note.{' '}
              <InlineLink href="#/discover/teams" externalIcon={false}>
                Find teams
              </InlineLink>
            </>
          )}
        </Text>
      ) : (
        <ul aria-label="Saved targets" style={listStyle}>
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
        </ul>
      )}
    </Stack>
  );
}
