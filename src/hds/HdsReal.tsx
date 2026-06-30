// Real @hirobius/design-system (v0.8.0) — validation showcase at ?spike=hds.
// HDS's full stylesheet (tokens.css) is loaded globally in main.tsx so its components are styled;
// its base reset is in @layer base, which MUI/emotion (unlayered) win over — so they coexist.
import { Box, Button as MuiButton, Container, Stack, Typography } from '@mui/material';
import { Button as HdsButton } from '@hirobius/design-system';

export default function HdsReal() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h1" sx={{ mb: 1 }}>
        Real HDS · v0.8.0
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        The real <code>@hirobius/design-system</code> Button beside MUI. HDS styles come from{' '}
        <code>tokens.css</code> (its reset is in <code>@layer base</code>, which unlayered MUI wins
        over) — MUI is visually unchanged.
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
