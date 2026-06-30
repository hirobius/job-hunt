// Real @hirobius/design-system (v0.8.0) — validation showcase at ?spike=hds.
// Uses the vars-only `variables.css` (no reset, "cannot restyle host elements") so it can't
// collide with MUI. Renders the real HDS Button next to MUI for a side-by-side.
import { Box, Button as MuiButton, Container, Stack, Typography } from '@mui/material';
import '@hirobius/design-system/variables.css';
import { Button as HdsButton } from '@hirobius/design-system';

export default function HdsReal() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Real HDS · v0.8.0
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        The real <code>@hirobius/design-system</code> Button beside MUI. Loaded via vars-only{' '}
        <code>variables.css</code> (no reset) — MUI should be visually unchanged.
      </Typography>

      <Stack spacing={4}>
        <Box>
          <Typography variant="h3" sx={{ mb: 1.5 }}>
            MUI (current)
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <MuiButton variant="contained">Primary</MuiButton>
            <MuiButton variant="outlined">Secondary</MuiButton>
            <MuiButton variant="text">Text</MuiButton>
          </Stack>
        </Box>

        <Box data-theme="dark">
          <Typography variant="h3" sx={{ mb: 1.5 }}>
            HDS v0.8.0 (real package)
          </Typography>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <HdsButton variant="primary">Primary</HdsButton>
            <HdsButton variant="secondary">Secondary</HdsButton>
            <HdsButton variant="tertiary">Tertiary</HdsButton>
            <HdsButton variant="primary" size="sm">
              Small
            </HdsButton>
            <HdsButton variant="primary" size="lg">
              Large
            </HdsButton>
          </div>
        </Box>
      </Stack>
    </Container>
  );
}
