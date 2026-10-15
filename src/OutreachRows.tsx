// Rows shared by the Teams tool and the By company view: one outreach target (a design-system team
// with its repo, stars and open roles), the watch action, and the saved-targets section. Kept apart
// from the engine so Live postings can show saved targets without loading the GitHub search code.
import { useMemo } from 'react';
import { Badge, Button, InlineLink, Stack, Text, useToast } from '@hirobius/design-system';
import { atsSearchUrl } from './jobsData';
import { boardsFromUrls, canonicalBoardUrl, type Board } from './feed/sources/ats';
import { removeTarget, useTargets, type Target } from './feed/targets';
import { SOURCE_LABEL } from './feed/types';
import { watchBoard } from './feed/watchlist';

export const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

export type Row = Omit<Target, 'savedAt'>;

const rolesText = (r: Row) =>
  r.board
    ? `Open roles: ${r.openRoles ?? 0}`
    : 'Open roles: none found (no public board on the five systems we check)';

export function TargetRow({
  r,
  saved,
  watching,
  onSave,
  onRemove,
  onWatch,
}: {
  r: Row;
  saved: boolean;
  watching: boolean;
  onSave?: () => void;
  onRemove?: () => void;
  onWatch: (b: Board) => void;
}) {
  const careers = atsSearchUrl(`"${r.company}"`, { role: 'careers', where: '', mode: 'any' });
  return (
    <li>
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
            {` · ${r.stars.toLocaleString()} stars · ${rolesText(r)}`}
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
        </Stack>
      </Stack>
    </li>
  );
}

export const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--primitive-space-3)',
} as const;

/** Hook: what the track already watches and the watch action, shared by both surfaces. */
export function useWatching(categoryId: string, boardUrls: string[]) {
  const { toast } = useToast();
  const watched = useMemo(() => boardsFromUrls(boardUrls, Infinity), [boardUrls]);
  const isWatching = (b?: Board) =>
    !!b && watched.some((w) => w.kind === b.kind && w.slug.toLowerCase() === b.slug.toLowerCase());
  const watch = (b: Board) => {
    const r = watchBoard(categoryId, canonicalBoardUrl(b));
    if (r.ok)
      toast({
        title: `Watching ${r.label}`,
        description: 'Its openings now show up in Live postings.',
        tone: 'success',
      });
    else toast({ title: r.error, tone: 'warning' });
  };
  return { isWatching, watch };
}

/** The saved targets of a track, as a section. Used under the By company view. */
export function SavedTargets({
  categoryId,
  boardUrls,
  heading = true,
}: {
  categoryId: string;
  boardUrls: string[];
  heading?: boolean;
}) {
  const targets = useTargets(categoryId);
  const { isWatching, watch } = useWatching(categoryId, boardUrls);
  return (
    <Stack gap="xs" as="section" aria-label="Outreach targets">
      {heading && (
        <Text variant="title" as="h3">
          Outreach targets
        </Text>
      )}
      {targets.length === 0 ? (
        <Text variant="caption" as="p" style={{ ...SECONDARY, margin: 0 }}>
          Companies with no opening yet that you want to write to. Find design-system teams in the
          Teams tool and save the ones worth a note.{' '}
          <InlineLink href="#/discover/teams" externalIcon={false}>
            Find design-system teams
          </InlineLink>
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
