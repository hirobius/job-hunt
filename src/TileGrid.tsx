import { Box, Link, Stack, Typography } from './ui/box';
import { Badge, Button, Card as HdsCard, HdsTooltip, IconButton } from '@hirobius/design-system';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { addJob, isSaved, useJobs } from './store';
import { useTileTriage, toggleDismiss } from './tileTriage';
import type { Tile } from './jobsData';

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 1.25,
} as const;

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
      <Link
        href={`tel:${m[1].replace(/-/g, '')}`}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {m[1]}
      </Link>
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
  return (
    <Box sx={grid}>
      {tiles.map((t) => {
        const saved = isSaved(t.url);
        const isAside = dismissedSet.has(t.url);
        return (
          <HdsCard
            key={t.url + t.name}
            bordered
            padding="none"
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              opacity: isAside ? 0.6 : 1,
            }}
          >
            <Box
              sx={{
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
              }}
            >
              <Typography sx={{ fontWeight: 600, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                {t.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.25, mb: 1.25, flex: 1 }}
              >
                {metaWithTel(t.meta)}
              </Typography>
              {kindOf(t.url) && (
                <Box sx={{ mb: 0.75 }}>
                  <Badge tone={kindOf(t.url)!.tone}>{kindOf(t.url)!.label}</Badge>
                </Box>
              )}
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ mt: 'auto' }}
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
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
                  onClick={() => addJob(t.url, t.name)}
                >
                  {saved ? 'Saved' : 'Save'}
                </Button>
                {(triage || onRemove) && (
                  <Stack direction="row" spacing={0} sx={{ ml: 'auto' }}>
                    {triage && (
                      <HdsTooltip>
                        <HdsTooltip.Trigger asChild>
                          <IconButton
                            size="sm"
                            variant="tertiary"
                            icon={isAside ? ArchiveRestore : Archive}
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
                          <IconButton
                            size="sm"
                            variant="tertiary"
                            tone="danger"
                            icon={Trash2}
                            onClick={() => onRemove(t.url)}
                            label="Remove tile"
                          />
                        </HdsTooltip.Trigger>
                        <HdsTooltip.Content>Remove</HdsTooltip.Content>
                      </HdsTooltip>
                    )}
                  </Stack>
                )}
              </Stack>
            </Box>
          </HdsCard>
        );
      })}
    </Box>
  );
}
