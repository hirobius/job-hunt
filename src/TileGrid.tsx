import { chunkMeta, metaLines } from './metaLines';
import {
  Badge,
  Button,
  Card as HdsCard,
  Tooltip as HdsTooltip,
  Disclosure,
  Icon,
  Box,
  Stack,
  Text,
  Grid,
  InlineLink,
} from '@hirobius/design-system';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { isSaved, useJobs } from './store';
import { saveWithNotice } from './saveNotice';
import { useTileTriage, toggleDismiss } from './tileTriage';
import { parseMeta } from './tileMeta';
import type { Tile } from './jobsData';

// Tile kind, derived from the URL (issue #12): aggregator queries are "Search", Google
// fallback leads are "Lead" (verify before relying), everything else is a direct
// employer/program page and gets no badge — absence of a badge = the strongest kind.
// Structured `kind` (Portal, Employer, Live) arrives with the meta migration.
const kindOf = (url: string): { label: string; tone: 'info' | 'warning' } | null =>
  /google\.com\/search/.test(url)
    ? { label: 'Lead', tone: 'warning' }
    : /(indeed|ziprecruiter|linkedin|snagajob|usajobs|worksourcewa)\./.test(url)
      ? { label: 'Search', tone: 'info' }
      : null;

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const telHref = (phone: string) => `tel:${phone.replace(/-/g, '')}`;

/** Shared grid of link tiles with an Open + Save-to-queue action. Used by Discover and
 *  Apprenticeships. Saving floats the tile in its group (issue #13 — pin is retired);
 *  with `triage`, each tile gets a set-aside control. */
export default function TileGrid({
  tiles,
  cta = 'Open',
  triage = false,
  onRemove,
}: {
  tiles: Tile[];
  cta?: string;
  triage?: boolean;
  onRemove?: (url: string) => void;
}) {
  useJobs(); // re-render on save
  const { dismissed } = useTileTriage();
  const dismissedSet = new Set(dismissed);
  // Enriched save (issue #57): carry the tile name → label and its meta → note so the queue
  // card isn't a bare URL; the save notice says where it went and offers Open / Undo.
  const save = (t: Tile) => {
    saveWithNotice(t.url, t.name, t.meta);
  };
  return (
    <Grid layout="auto-fill" minItemWidth="240px" gap="medium" align="stretch">
      {tiles.map((t) => {
        const saved = isSaved(t.url);
        const isAside = dismissedSet.has(t.url);
        const kind = kindOf(t.url);
        const meta = parseMeta(t.meta);
        // Pay and place read as chips; the first phone stays one tap from the card (every phone is
        // in the detail). With nothing parsed, the raw meta shows as the note; the detail repeats it two items a line.
        const chips = meta.chips.filter((c) => c.kind !== 'contact' || c.text === meta.phones[0]);
        const note = meta.notes[0];
        const host = hostOf(t.url);
        return (
          <HdsCard
            key={t.url + t.name}
            bordered
            padding="none"
            style={{
              height: '100%',
              opacity: isAside ? 0.6 : 1,
            }}
          >
            <Box
              as="article"
              aria-label={t.name}
              sx={{ p: 'sm', display: 'flex', flexDirection: 'column', gap: 'xs', height: '100%' }}
            >
              <Stack direction="row" gap="xs" align="center" justify="space-between">
                <Text
                  variant="body"
                  as="h3"
                  className="rjb-semibold"
                  title={t.name}
                  style={{
                    lineHeight: 1.2,
                    minWidth: 0,
                    // Two lines, then an ellipsis: one line cut most names at 1440. Full name in Details.
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {t.name}
                </Text>
                {kind && <Badge tone={kind.tone}>{kind.label}</Badge>}
              </Stack>
              {chips.length > 0 && (
                <Stack gap="px4">
                  {/* At most two chips per row (#192). */}
                  {chunkMeta(chips).map((row) => (
                    // Box, not Stack: Stack drops the data-meta-row hook the tests count.
                    <Box
                      key={row.map((c) => c.kind + c.text).join('|')}
                      data-meta-row=""
                      sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs', alignItems: 'center' }}
                    >
                      {row.map((c) =>
                        c.kind === 'contact' ? (
                          <InlineLink key={c.text} href={telHref(c.text)}>
                            {c.text}
                          </InlineLink>
                        ) : (
                          <Badge key={c.kind + c.text} tone="neutral">
                            {c.text}
                          </Badge>
                        ),
                      )}
                    </Box>
                  ))}
                </Stack>
              )}
              {note && (
                <Text
                  variant="caption"
                  as="span"
                  tone="secondary"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {note}
                </Text>
              )}
              <Box sx={{ flex: 1 }}>
                <Disclosure label="Details">
                  <Box sx={{ overflowWrap: 'anywhere' }}>
                    <Stack gap="tight">
                      <Text variant="ui" as="span">
                        {t.name}
                      </Text>
                      {metaLines(meta.raw.split(/\s+·\s+/)).map((line) => (
                        <Text
                          key={line}
                          variant="caption"
                          as="span"
                          data-meta-detail
                          tone="secondary"
                        >
                          {line}
                        </Text>
                      ))}
                      {meta.phones.map((ph) => (
                        <InlineLink key={ph} href={telHref(ph)}>
                          {ph}
                        </InlineLink>
                      ))}
                      {meta.emails.map((em) => (
                        <InlineLink key={em} href={`mailto:${em}`}>
                          {em}
                        </InlineLink>
                      ))}
                      {host && (
                        <Text variant="caption" as="span" tone="secondary">
                          {host}
                        </Text>
                      )}
                    </Stack>
                  </Box>
                </Disclosure>
              </Box>
              <Stack direction="row" wrap="wrap" gap="tight" align="center">
                <Button size="sm" variant="tertiary" asChild>
                  <a href={t.url} target="_blank" rel="noopener noreferrer">
                    {cta}
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant={saved ? 'tertiary' : 'secondary'}
                  disabled={saved}
                  onClick={() => save(t)}
                >
                  {saved ? 'Saved' : 'Save'}
                </Button>
                {triage && (
                  <Button
                    size="sm"
                    variant="tertiary"
                    iconLeft={<Icon icon={isAside ? ArchiveRestore : Archive} />}
                    onClick={() => toggleDismiss(t.url)}
                  >
                    {isAside ? 'Restore' : 'Set aside'}
                  </Button>
                )}
                {onRemove && (
                  <HdsTooltip>
                    <HdsTooltip.Trigger asChild>
                      <Button
                        size="sm"
                        variant="tertiary"
                        tone="danger"
                        iconOnly
                        iconLeft={<Icon icon={Trash2} />}
                        onClick={() => onRemove(t.url)}
                        label="Remove tile"
                      />
                    </HdsTooltip.Trigger>
                    <HdsTooltip.Content>Remove</HdsTooltip.Content>
                  </HdsTooltip>
                )}
              </Stack>
            </Box>
          </HdsCard>
        );
      })}
    </Grid>
  );
}
