import { Box, Stack, Typography } from '@mui/material';
import TileGrid from './TileGrid';
import { APPRENTICESHIP_GROUPS } from './apprenticeships';

export default function ApprenticeshipsView() {
  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Earn-while-you-learn pathways for Washington — Spokane-local trades, healthcare &amp;
        employer postings, statewide search tools, and remote tech open to WA residents. Open one,
        or Save it to your queue. Dated postings are marked “verify” — click to confirm
        they&rsquo;re still hiring.
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
