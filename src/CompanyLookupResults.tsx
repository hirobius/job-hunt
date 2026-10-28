// What a company lookup (companyLookup.ts) came back with: boards found (one Watch away), boards
// the name matched that don't show they are this company's (Watch anyway), already watched, no
// public board (keep it as a target) or couldn't check (never read as "no board"). Shared by Add a
// company (#237) and the Find box (#384).
import { useState } from 'react';
import { Alert, Badge, Button, Icon, Stack, Text } from '@hirobius/design-system';
import { Star } from 'lucide-react';
import type { DiscoverResult } from './feed/discoverBoards';
import type { Board } from './feed/sources/ats';
import { SOURCE_LABEL } from './feed/types';
import { listStyle } from './outreachShared';

const key = (b: Board) => `${b.kind}:${b.slug}`;

export function CompanyLookupResults({
  asked,
  result,
  watchOne,
  onStar,
}: {
  asked: string;
  result: DiscoverResult;
  /** Watch a board found; true when it was added. */
  watchOne: (b: Board) => boolean;
  /** Keep the company as a target (a dream company). */
  onStar: () => void;
}) {
  const [watchedNow, setWatchedNow] = useState<string[]>([]);
  return (
    <>
      {result.found.length > 0 && (
        <ul aria-label="Boards found" style={listStyle}>
          {result.found.map((f) => {
            const done = watchedNow.includes(key(f.board));
            return (
              <li key={key(f.board)}>
                <Stack direction="row" gap="px8" align="center" justify="space-between">
                  <Stack direction="row" gap="px8" align="center" wrap="wrap">
                    <Text variant="ui" as="span">
                      {f.company}
                    </Text>
                    <Badge>{SOURCE_LABEL[f.board.kind]}</Badge>
                  </Stack>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={done}
                    aria-label={`${done ? 'Watching' : 'Watch'} ${f.company}`}
                    onClick={() => {
                      if (watchOne(f.board)) setWatchedNow((w) => [...w, key(f.board)]);
                    }}
                  >
                    {done ? 'Watching' : 'Watch'}
                  </Button>
                </Stack>
              </li>
            );
          })}
        </ul>
      )}
      {result.unconfirmed.length > 0 && (
        <Stack gap="px8">
          <Text variant="caption" as="p" tone="secondary">
            {`Not confirmed as ${asked}'s. Watch one only if you know it is theirs.`}
          </Text>
          <ul aria-label="Boards not confirmed" style={listStyle}>
            {result.unconfirmed.map((f) => {
              const done = watchedNow.includes(key(f.board));
              return (
                <li key={key(f.board)}>
                  <Stack direction="row" gap="px8" align="center" justify="space-between">
                    <Stack gap="px4">
                      <Stack direction="row" gap="px8" align="center" wrap="wrap">
                        <Text variant="ui" as="span">
                          {f.company}
                        </Text>
                        <Badge>{SOURCE_LABEL[f.board.kind]}</Badge>
                      </Stack>
                      <Text variant="caption" as="span" tone="secondary">
                        {f.why}
                      </Text>
                    </Stack>
                    <Button
                      size="sm"
                      variant="tertiary"
                      disabled={done}
                      aria-label={`${done ? 'Watching' : 'Watch anyway'} ${SOURCE_LABEL[f.board.kind]} board for ${f.company}`}
                      onClick={() => {
                        if (watchOne(f.board)) setWatchedNow((w) => [...w, key(f.board)]);
                      }}
                    >
                      {done ? 'Watching' : 'Watch anyway'}
                    </Button>
                  </Stack>
                </li>
              );
            })}
          </ul>
        </Stack>
      )}
      {result.alreadyWatched.length > 0 && (
        <Text variant="ui" as="p">{`Already watching ${result.alreadyWatched.join(', ')}.`}</Text>
      )}
      {result.missed.length > 0 && (
        <Stack gap="px8">
          <Text variant="ui" as="p">
            {`No public board found for ${asked} on the systems we check. It may hire elsewhere; keep it as a target to stay on your list.`}
          </Text>
          <div>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<Icon icon={Star} />}
              aria-label={`Keep ${asked} as a target`}
              onClick={onStar}
            >
              Keep as a target
            </Button>
          </div>
        </Stack>
      )}
      {result.unknown.length > 0 && (
        <Alert tone="warning">
          {`We couldn't check ${asked} right now (rate-limited, offline or blocked). Try again in a minute.`}
        </Alert>
      )}
    </>
  );
}
