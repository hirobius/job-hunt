import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
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
}: {
  tiles: Tile[];
  cta?: string;
  triage?: boolean;
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
          <Card
            key={t.url + t.name}
            variant="outlined"
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              opacity: isAside ? 0.6 : 1,
            }}
          >
            <CardContent
              sx={{
                p: 1.5,
                pb: '12px !important',
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
                  component={Link}
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
                {triage && (
                  <Stack direction="row" spacing={0} sx={{ ml: 'auto' }}>
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
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
