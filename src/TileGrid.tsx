import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { Card as HdsCard } from '@hirobius/design-system';
import { Button } from './ui/Button';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { addJob, isSaved, useJobs } from './store';
import { useTileTriage, togglePin, toggleDismiss } from './tileTriage';
import type { Tile } from './jobsData';

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 1.25,
} as const;

/** Shared grid of link tiles with an Open + Save-to-queue action. Used by Discover and
 *  Apprenticeships. With `triage`, each tile also gets pin / set-aside controls (the
 *  parent owns the actual floating/hiding via the tileTriage store). */
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
  const { pinned, dismissed } = useTileTriage();
  const pinnedSet = new Set(pinned);
  const dismissedSet = new Set(dismissed);
  return (
    <Box sx={grid}>
      {tiles.map((t) => {
        const saved = isSaved(t.url);
        const isPinned = pinnedSet.has(t.url);
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
                {t.meta}
              </Typography>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ mt: 'auto' }}
                alignItems="center"
                useFlexGap
                flexWrap="wrap"
              >
                <Button
                  size="small"
                  variant="text"
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {cta}
                </Button>
                <Button
                  size="small"
                  variant={saved ? 'text' : 'outlined'}
                  disabled={saved}
                  onClick={() => addJob(t.url, t.name)}
                >
                  {saved ? 'Saved' : 'Save'}
                </Button>
                {(triage || onRemove) && (
                  <Stack direction="row" spacing={0} sx={{ ml: 'auto' }}>
                    {triage && (
                      <Tooltip title={isPinned ? 'Unpin' : 'Pin to top'}>
                        <IconButton
                          size="small"
                          color={isPinned ? 'primary' : 'default'}
                          onClick={() => togglePin(t.url)}
                          aria-label={isPinned ? 'Unpin tile' : 'Pin tile to top'}
                        >
                          {isPinned ? (
                            <PushPinIcon fontSize="small" />
                          ) : (
                            <PushPinOutlinedIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                    {triage && (
                      <Tooltip title={isAside ? 'Restore' : 'Set aside'}>
                        <IconButton
                          size="small"
                          onClick={() => toggleDismiss(t.url)}
                          aria-label={isAside ? 'Restore tile' : 'Set tile aside'}
                        >
                          {isAside ? (
                            <UnarchiveOutlinedIcon fontSize="small" />
                          ) : (
                            <ArchiveOutlinedIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                    {onRemove && (
                      <Tooltip title="Remove">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => onRemove(t.url)}
                          aria-label="Remove tile"
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
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
