import { Box, Button, Card, CardContent, Link, Stack, Typography } from '@mui/material';
import { addJob, isSaved, useJobs } from './store';
import type { Tile } from './jobsData';

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 1.25,
} as const;

/** Shared grid of link tiles with an Open + Save-to-queue action. Used by Discover and
 *  Apprenticeships. */
export default function TileGrid({ tiles, cta = 'Open' }: { tiles: Tile[]; cta?: string }) {
  useJobs(); // re-render on save
  return (
    <Box sx={grid}>
      {tiles.map((t) => {
        const saved = isSaved(t.url);
        return (
          <Card
            key={t.url + t.name}
            variant="outlined"
            sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
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
              <Stack direction="row" spacing={0.5} sx={{ mt: 'auto' }}>
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
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
