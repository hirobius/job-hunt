// HDS spike showcase — reachable at ?spike=hds (lazy; never in the main bundle). Renders the
// HDS-style Button (Tailwind+Radix+CVA, token-driven) right next to the live MUI Button so the
// two component systems can be compared side by side and you can confirm Tailwind utilities work
// while MUI is visually unaffected (no preflight). See docs/adr/0003.
import { Box, Button as MuiButton, Container, Link, Stack, Typography } from '@mui/material';
import './tailwind.css';
import { HdsButton } from './HdsButton';

export default function HdsSpike() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, sm: 6 } }}>
      <Typography variant="h1" sx={{ mb: 1 }}>
        HDS spike
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Tailwind v4 + Radix + CVA, driven by the committed HDS token layer — alongside MUI, no
        preflight. Both rows below should look on-brand (jade) and MUI should be unchanged.
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

        <Box>
          <Typography variant="h3" sx={{ mb: 1.5 }}>
            HDS-style (Tailwind + Radix + CVA, token-driven)
          </Typography>
          <div className="flex flex-row flex-wrap items-center gap-3">
            <HdsButton variant="primary">Primary</HdsButton>
            <HdsButton variant="secondary">Secondary</HdsButton>
            <HdsButton variant="primary" size="sm">
              Small
            </HdsButton>
            <HdsButton variant="primary" size="lg">
              Large
            </HdsButton>
            <HdsButton asChild variant="secondary">
              <Link href="#" underline="none">
                As a link (Radix Slot)
              </Link>
            </HdsButton>
          </div>
        </Box>
      </Stack>
    </Container>
  );
}
