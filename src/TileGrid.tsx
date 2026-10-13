import {
  Badge,
  Button,
  Card as HdsCard,
  Tooltip as HdsTooltip,
  useToast,
  Icon,
  Box,
  Text,
  Grid,
  InlineLink,
} from '@hirobius/design-system';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { addJob, isSaved, useJobs } from './store';
import { useTileTriage, toggleDismiss } from './tileTriage';
import type { Tile } from './jobsData';

// Tile kind, derived from the URL (issue #12): aggregator queries are "Search", Google
// fallback leads are "Lead" (verify before relying), everything else is a direct
// employer/program page and gets no badge — absence of a badge = the strongest kind.
const kindOf = (url: string): { label: string; tone: 'info' | 'warning' } | null =>
  /google\.com\/search/.test(url)
    ? { label: 'Lead', tone: 'warning' }
    : /(indeed|ziprecruiter|linkedin|snagajob|usajobs|worksourcewa)\./.test(url)
      ? { label: 'Search', tone: 'info' }
      : null;

// First phone number in the meta becomes tap-to-call (issue #12).
const PHONE = /\b(\d{3}-\d{3}-\d{4})\b/;
function metaWithTel(meta: string) {
  const m = meta.match(PHONE);
  if (!m || m.index == null) return meta;
  return (
    <>
      {meta.slice(0, m.index)}
      <InlineLink href={`tel:${m[1].replace(/-/g, '')}`}>{m[1]}</InlineLink>
      {meta.slice(m.index + m[1].length)}
    </>
  );
}

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
  const { toast } = useToast();
  // Enriched save (issue #57): carry the tile name → label and its meta → note so the queue
  // card isn't a bare URL; confirm with a toast pointing at the Queue.
  const save = (t: Tile) => {
    if (addJob(t.url, t.name, t.meta)) {
      toast({ title: 'Added to Queue', description: t.name, tone: 'success' });
    }
  };
  return (
    <Grid layout="auto-fill" minItemWidth="160px" gap="medium">
      {tiles.map((t) => {
        const saved = isSaved(t.url);
        const isAside = dismissedSet.has(t.url);
        return (
          <HdsCard
            key={t.url + t.name}
            bordered
            padding="none"
            style={{ opacity: isAside ? 0.6 : 1 }}
          >
            <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', flex: 1 }}>
              <Text variant="body" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                {t.name}
              </Text>
              <Box sx={{ flex: 1, mt: 0.5, mb: 2.5 }}>
                <Text
                  variant="caption"
                  style={{ color: 'var(--semantic-color-content-secondary)' }}
                >
                  {metaWithTel(t.meta)}
                </Text>
              </Box>
              {kindOf(t.url) && (
                <Box sx={{ mb: 1.5 }}>
                  <Badge tone={kindOf(t.url)!.tone}>{kindOf(t.url)!.label}</Badge>
                </Box>
              )}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 1,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  mt: 'auto',
                }}
              >
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
                {(triage || onRemove) && (
                  <Box sx={{ display: 'flex', flexDirection: 'row', gap: 0, ml: 'auto' }}>
                    {triage && (
                      <HdsTooltip>
                        <HdsTooltip.Trigger asChild>
                          <Button
                            size="sm"
                            variant="tertiary"
                            iconOnly
                            iconLeft={<Icon icon={isAside ? ArchiveRestore : Archive} />}
                            onClick={() => toggleDismiss(t.url)}
                            label={isAside ? 'Restore tile' : 'Set tile aside'}
                          />
                        </HdsTooltip.Trigger>
                        <HdsTooltip.Content>{isAside ? 'Restore' : 'Set aside'}</HdsTooltip.Content>
                      </HdsTooltip>
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
                  </Box>
                )}
              </Box>
            </Box>
          </HdsCard>
        );
      })}
    </Grid>
  );
}
