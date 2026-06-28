import { Box, Stack, Typography } from '@mui/material';
import TileGrid from './TileGrid';
import { APPRENTICESHIP_GROUPS } from './apprenticeships';

export default function ApprenticeshipsView() {
  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Spokane-eligible and remote opportunities, current by design. The <strong>search</strong>{' '}
        tiles return only what&rsquo;s actually posted right now; the{' '}
        <strong>program portals</strong> take applications on a rolling basis. Static one-off
        postings are deliberately left off (they can&rsquo;t be pre-verified and go stale) — click a
        search to see today&rsquo;s openings, and Save any to your queue.
      </Typography>
      {APPRENTICESHIP_GROUPS.map((g) => (
        <Box key={g.id}>
          <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', mb: 1 }}>{g.label}</Typography>
          <TileGrid tiles={g.tiles} cta={g.id.includes('search') ? 'Search' : 'Open'} />
        </Box>
      ))}
    </Stack>
  );
}
