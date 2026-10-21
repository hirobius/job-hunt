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
import { Banknote, ExternalLink, Globe, Linkedin, MapPin, Phone, Trash2 } from 'lucide-react';
import { isSaved, useJobs } from './store';
import { saveWithNotice } from './saveNotice';
import { useTileTriage, toggleDismiss } from './tileTriage';
import { parseMeta, splitTileName } from './tileMeta';
import type { Tile } from './jobsData';

// Tile kind, derived from the URL (issue #12): aggregator queries are "Search", Google
// fallback leads are "Lead" (verify before relying), everything else is a direct
// employer/program page and gets no badge — absence of a badge = the strongest kind.
// Structured `kind` (Portal, Employer, Live) arrives with the meta migration. Neutral (rev-3 H):
// the badge names a kind, it is not a status.
const kindOf = (url: string): string | null =>
  /google\.com\/search/.test(url)
    ? 'Lead'
    : /(indeed|ziprecruiter|linkedin|snagajob|usajobs|worksourcewa)\./.test(url)
      ? 'Search'
      : null;

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

const telHref = (phone: string) => `tel:${phone.replace(/-/g, '')}`;

const FACT_ICON = { pay: Banknote, place: MapPin, contact: Phone } as const;

/** Shared grid of link tiles (rev-3 H anatomy): the source with an icon and the kind badge on
 *  top, the title (two lines), the facts with icons, then Save, Open and a quiet Set aside on
 *  one centre line. Saving floats the tile in its group (issue #13 — pin is retired); with
 *  `triage`, each tile gets a set-aside control. */
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
        const { source, title } = splitTileName(t.name, t.url);
        // Pay, place and the first phone are the facts row (two a row, #192). Every phone and the
        // rest of the meta are in Details, shown only when there is more than the card says.
        const chips = meta.chips.filter((c) => c.kind !== 'contact' || c.text === meta.phones[0]);
        const note = meta.notes[0];
        const host = hostOf(t.url);
        const more = meta.phones.length > 1 || meta.emails.length > 0 || meta.notes.length > 1;
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
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" gap="px4" align="center">
                    <Icon icon={source === 'LinkedIn' ? Linkedin : Globe} size="small" />
                    <Text variant="caption" as="span" tone="secondary">
                      {source}
                    </Text>
                  </Stack>
                </Box>
                {kind && <Badge tone="neutral">{kind}</Badge>}
              </Stack>
              <Text variant="body" as="h3" weight="bold" className="rjb-card-title" title={t.name}>
                {title}
              </Text>
              {chips.length > 0 && (
                <Stack gap="px4">
                  {/* At most two facts per row (#192). */}
                  {chunkMeta(chips).map((row) => (
                    // Box, not Stack: Stack drops the data-meta-row hook the tests count.
                    <Box
                      key={row.map((c) => c.kind + c.text).join('|')}
                      data-meta-row=""
                      sx={{ display: 'flex', flexWrap: 'wrap', gap: 'sm', alignItems: 'center' }}
                    >
                      {row.map((c) => (
                        <Stack key={c.kind + c.text} direction="row" gap="px4" align="center">
                          <Icon icon={FACT_ICON[c.kind]} size="small" />
                          {c.kind === 'contact' ? (
                            <Text variant="caption" as="span">
                              <InlineLink href={telHref(c.text)}>{c.text}</InlineLink>
                            </Text>
                          ) : (
                            <Text variant="caption" as="span" tone="secondary">
                              {c.text}
                            </Text>
                          )}
                        </Stack>
                      ))}
                    </Box>
                  ))}
                </Stack>
              )}
              {note && (
                <Text variant="caption" as="span" tone="secondary" className="rjb-clamp-2">
                  {note}
                </Text>
              )}
              <Box sx={{ flex: 1 }}>
                {more && (
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
                )}
              </Box>
              {/* Save, Open, then the quiet Set aside on the far side, one centre line (rev-3 G). */}
              <Stack direction="row" gap="tight" align="center" justify="space-between">
                <Stack direction="row" gap="tight" align="center">
                  <Button
                    size="sm"
                    variant={saved ? 'tertiary' : 'secondary'}
                    disabled={saved}
                    onClick={() => save(t)}
                  >
                    {saved ? 'Saved' : 'Save'}
                  </Button>
                  {cta === 'Open' ? (
                    <Button size="sm" variant="secondary" iconOnly label={`Open ${title}`} asChild>
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${title}`}
                      >
                        <Icon icon={ExternalLink} />
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" asChild>
                      <a href={t.url} target="_blank" rel="noopener noreferrer">
                        {cta}
                      </a>
                    </Button>
                  )}
                </Stack>
                <Stack direction="row" gap="tight" align="center">
                  {triage && (
                    <Button size="sm" variant="tertiary" onClick={() => toggleDismiss(t.url)}>
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
              </Stack>
            </Box>
          </HdsCard>
        );
      })}
    </Grid>
  );
}
