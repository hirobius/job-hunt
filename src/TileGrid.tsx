import { chunkMeta, metaLines } from './metaLines';
import {
  Badge,
  Button,
  Card as HdsCard,
  Tooltip as HdsTooltip,
  Icon,
  Popover,
  Box,
  Stack,
  Text,
  Grid,
  InlineLink,
} from '@hirobius/design-system';
import {
  Banknote,
  Calendar,
  ExternalLink,
  Globe,
  Linkedin,
  MapPin,
  Phone,
  Trash2,
} from 'lucide-react';
import { isSaved, useJobs } from './store';
import { saveWithNotice } from './saveNotice';
import { useTileTriage, toggleDismiss } from './tileTriage';
import { parseMeta, postedWindow, splitTileName, type MetaChip } from './tileMeta';
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

const FACT_ICON = { pay: Banknote, place: MapPin, contact: Phone, posted: Calendar } as const;

type Fact = { kind: MetaChip['kind'] | 'posted'; text: string };

/** Shared grid of link tiles (rev-3 H anatomy): the source with an icon and the kind badge on
 *  top, the title (two lines), the facts row with icons (where, and for a search how recent),
 *  then Save, Open and a quiet Set aside on one centre line. Saving floats the tile in its group
 *  (issue #13 — pin is retired); with `triage`, each tile gets a set-aside control. */
export default function TileGrid({
  tiles,
  cta = 'Open',
  triage = false,
  onRemove,
  place,
}: {
  tiles: Tile[];
  cta?: string;
  triage?: boolean;
  onRemove?: (url: string) => void;
  /** Where the track searches ("Remote", "Spokane, Hybrid"): the place fact of a tile whose own
   *  name and meta name none. */
  place?: string;
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
        const split = splitTileName(t.name, t.url);
        const { source, title } = split;
        // The facts row is always there (rev-3 H): pay, the place (the meta's, else the one the
        // name carried, else the track's) and the first phone, plus how recent a search's
        // postings are. Two a row (#192).
        const metaPlace = meta.chips.some((c) => c.kind === 'place');
        const placeText = metaPlace ? null : (split.place ?? place);
        const chips: Fact[] = [
          ...meta.chips.filter((c) => c.kind !== 'contact' || c.text === meta.phones[0]),
          ...(placeText ? [{ kind: 'place' as const, text: placeText }] : []),
          ...(kind ? [{ kind: 'posted' as const, text: postedWindow(t.url) }] : []),
        ];
        const host = hostOf(t.url);
        // A search link's note only restates its title; an employer page's note (what they do,
        // who they hire) and every extra contact sit behind Details.
        const more =
          meta.phones.length > 1 || meta.emails.length > 0 || (!kind && meta.notes.length > 0);
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
              {/* Pushes the actions to the card's foot, so tiles in a row line up. */}
              <Box sx={{ flex: 1 }} />
              {/* Save, Open, then the quiet Set aside on the far side, one centre line (rev-3 G); all
                  40px tall at every width, so the footer is one even row (desktop QA). */}
              <Stack direction="row" gap="px8" align="center" justify="space-between">
                <Stack direction="row" gap="px8" align="center">
                  <Button
                    size="sm"
                    className="rjb-h-40"
                    variant={saved ? 'tertiary' : 'secondary'}
                    disabled={saved}
                    onClick={() => save(t)}
                  >
                    {saved ? 'Saved' : 'Save'}
                  </Button>
                  {cta === 'Open' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      iconOnly
                      label={`Open ${title}`}
                      className="rjb-icon-40"
                      asChild
                    >
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
                    <Button size="sm" variant="secondary" className="rjb-h-40" asChild>
                      <a href={t.url} target="_blank" rel="noopener noreferrer">
                        {cta}
                      </a>
                    </Button>
                  )}
                </Stack>
                <Stack direction="row" gap="px8" align="center">
                  {more && (
                    <Popover>
                      <Popover.Trigger asChild>
                        <Button size="sm" variant="tertiary" className="rjb-h-40">
                          Details
                        </Button>
                      </Popover.Trigger>
                      <Popover.Content align="end" aria-label={`Details: ${t.name}`}>
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
                      </Popover.Content>
                    </Popover>
                  )}
                  {triage && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="rjb-h-40"
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
                          className="rjb-icon-40"
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
