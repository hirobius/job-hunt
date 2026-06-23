import { createTheme } from '@mui/material/styles';
import { hdsDarkPalette as hds } from './theme/hds-dark-palette.generated';

const head = '"Clash Display", system-ui, sans-serif';
const body = '"Satoshi", system-ui, -apple-system, sans-serif';

// Palette is GENERATED from @hirobius/design-system tokens (dark scheme) with the jade
// brand applied — see scripts/build-hds-tokens.mjs and docs/adr/0001. No hardcoded brand
// colors here. Headlines = Clash Display, body = Satoshi; restrained type ramp retained.
// success/info stay app-defined (HDS feedback hues not yet mapped); secondary/warning use
// MUI's dark defaults (HDS has no second accent — its `secondary` role is a neutral).
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: hds.primaryMain, contrastText: hds.primaryContrast },
    error: { main: hds.errorMain, contrastText: hds.errorContrast },
    success: { main: '#34d39e' },
    info: { main: '#49c7ff' },
    background: { default: hds.backgroundDefault, paper: hds.backgroundPaper },
    divider: hds.divider,
    text: { primary: hds.textPrimary, secondary: hds.textSecondary },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: body,
    h1: {
      fontFamily: head,
      fontWeight: 600,
      fontSize: '2.4rem',
      letterSpacing: '-0.01em',
      lineHeight: 1.05,
    },
    h2: {
      fontFamily: head,
      fontWeight: 600,
      fontSize: '1.35rem',
      letterSpacing: '-0.005em',
      lineHeight: 1.15,
    },
    h3: { fontFamily: head, fontWeight: 600, fontSize: '1.15rem', lineHeight: 1.2 },
    subtitle1: { fontWeight: 600, fontSize: '1rem' },
    body1: { fontSize: '0.95rem' },
    body2: { fontSize: '0.85rem' },
    caption: { fontSize: '0.78rem' },
    button: {
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      fontWeight: 600,
      fontSize: '0.8rem',
    },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
  },
});
