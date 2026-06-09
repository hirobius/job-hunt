import { createTheme } from '@mui/material/styles';

const head = '"Clash Display", system-ui, sans-serif';
const body = '"Satoshi", system-ui, -apple-system, sans-serif';

// Jade dark. Headlines = Clash Display, everything else = Satoshi.
// Deliberately restrained type ramp: one display size, one heading size,
// body, and small — minimal variance.
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#1fc28f', contrastText: '#06140f' }, // jade
    success: { main: '#34d39e' },
    info: { main: '#49c7ff' },
    background: { default: '#0a1413', paper: '#101b19' },
    divider: 'rgba(255,255,255,0.10)',
    text: { primary: '#eef4f1', secondary: '#8aa39b' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: body,
    h1: { fontFamily: head, fontWeight: 600, fontSize: '2.4rem', letterSpacing: '-0.01em', lineHeight: 1.05 },
    h2: { fontFamily: head, fontWeight: 600, fontSize: '1.35rem', letterSpacing: '-0.005em', lineHeight: 1.15 },
    h3: { fontFamily: head, fontWeight: 600, fontSize: '1.15rem', lineHeight: 1.2 },
    subtitle1: { fontWeight: 600, fontSize: '1rem' },
    body1: { fontSize: '0.95rem' },
    body2: { fontSize: '0.85rem' },
    caption: { fontSize: '0.78rem' },
    button: { textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, fontSize: '0.8rem' },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
  },
});
