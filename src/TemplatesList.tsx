// The Templates list (#132): search, New snippet, and one row per template, pinned first. Each row
// is a link to `#/copy-deck/<id>` so it works with the back button, a middle click and a phone's
// one-pane flow. The star marks a pinned template; the caption is the body's first line.
import { Star } from 'lucide-react';
import { Box, Button, Icon, Input as HdsInput, Stack, Text } from '@hirobius/design-system';
import EmptyState from './EmptyState';
import type { Snippet } from './copyDeckStore';

const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;

const snippetHash = (id: string) => `#/copy-deck/${encodeURIComponent(id)}`;
const firstLine = (body: string) => body.split('\n').find((l) => l.trim()) ?? '';

export default function TemplatesList({
  items,
  currentId,
  query,
  onQuery,
  onNew,
}: {
  items: Snippet[];
  currentId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onNew: () => void;
}) {
  return (
    <Stack gap="tight">
      <HdsInput
        type="search"
        size="sm"
        aria-label="Search templates"
        placeholder="Search templates"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <Button variant="secondary" onClick={onNew}>
        New snippet
      </Button>
      {items.length === 0 ? (
        <EmptyState
          title="No matches"
          message={`Nothing is named or says “${query.trim()}”.`}
          action={
            <Button variant="secondary" size="sm" onClick={() => onQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <nav aria-label="Templates">
          <Box as="ul" sx={LIST}>
            {items.map((s) => {
              const current = s.id === currentId;
              // Flat rows split by hairlines (#241); the open one sits on the raised surface.
              return (
                <Box
                  as="li"
                  key={s.id}
                  sx={{
                    px: 'xs',
                    py: 'sm',
                    borderBottom: 'thin solid',
                    borderColor: 'border.default',
                    '& > a': { display: 'block', color: 'inherit', textDecoration: 'none' },
                    ...(current ? { bg: 'surface.raised' } : {}),
                  }}
                >
                  <a href={snippetHash(s.id)} aria-current={current ? 'page' : undefined}>
                    <Stack gap="tight">
                      <Stack direction="row" gap="tight" align="center">
                        {s.pinned && (
                          <Box
                            as="span"
                            role="img"
                            aria-label="Pinned"
                            sx={{ display: 'inline-flex' }}
                          >
                            <Icon icon={Star} weight="fill" />
                          </Box>
                        )}
                        <Text variant="ui" as="span" className="rjb-semibold">
                          {s.label.trim() || 'Untitled'}
                        </Text>
                      </Stack>
                      <Box
                        sx={{
                          '& > p': {
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          },
                        }}
                      >
                        <Text variant="caption" tone="secondary">
                          {firstLine(s.body) || 'Empty'}
                        </Text>
                      </Box>
                    </Stack>
                  </a>
                </Box>
              );
            })}
          </Box>
        </nav>
      )}
    </Stack>
  );
}
