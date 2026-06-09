import { createTheme } from '@mui/material/styles';

// Jade dark theme. Headlines = Fraunces, everything else = Hanken Grotesk.
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#1fc28f', contrastText: '#06140f' }, // jade
    success: { main: '#34d39e' },
    background: { default: '#0a1413', paper: '#101b19' },
    divider: 'rgba(255,255,255,0.10)',
    text: { primary: '#eef4f1', secondary: '#8aa39b' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Hanken Grotesk Variable", system-ui, -apple-system, sans-serif',
    h1: { fontFamily: '"Fraunces Variable", Georgia, serif', fontWeight: 600, letterSpacing: '-0.015em' },
    h2: { fontFamily: '"Fraunces Variable", Georgia, serif', fontWeight: 600, letterSpacing: '-0.01em' },
    h3: { fontFamily: '"Fraunces Variable", Georgia, serif', fontWeight: 600 },
    button: { textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});
