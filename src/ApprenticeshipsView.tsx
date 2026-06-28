import { Box, Stack, Typography } from '@mui/material';
import TileGrid from './TileGrid';
import { APPRENTICESHIP_GROUPS } from './apprenticeships';

export default function ApprenticeshipsView() {
  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Earn-while-you-learn pathways — registered apprenticeships, tech apprenticeships, and
        veteran programs. Open one, or Save it to your queue to track it like any other application.
      </Typography>
      {APPRENTICESHIP_GROUPS.map((g) => (
        <Box key={g.id}>
          <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', mb: 1 }}>{g.label}</Typography>
          <TileGrid tiles={g.tiles} />
        </Box>
      ))}
    </Stack>
  );
}
