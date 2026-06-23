import { createTheme, type Theme } from '@mui/material/styles';
import { hdsPalette } from './theme/hds-palette.generated';

const head = '"Clash Display", system-ui, sans-serif';
const body = '"Satoshi", system-ui, -apple-system, sans-serif';

// Palette is GENERATED from @hirobius/design-system tokens (light + dark) with the jade
// brand applied — see scripts/build-hds-tokens.mjs and docs/adr/0001. No hardcoded brand
// colors here. success/warning/info stay app-defined (HDS feedback hues not yet mapped).
// success/warning are mode-aware: the bright dark-mode values fail WCAG AA for small text
// on light surfaces (chip labels, the "gaps"/"Not claimed" overlines, success/error text
// buttons), so light mode uses darker variants ≥4.5:1 — see src/theme.contrast.test.ts.
export function makeTheme(mode: 'light' | 'dark'): Theme {
  const p = hdsPalette[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: p.primaryMain, contrastText: p.primaryContrast },
      error: { main: p.errorMain, contrastText: p.errorContrast },
      success: { main: mode === 'dark' ? '#34d39e' : '#047857' },
      warning: { main: mode === 'dark' ? '#ffa726' : '#b45309' },
      info: { main: '#49c7ff' },
      background: { default: p.backgroundDefault, paper: p.backgroundPaper },
      divider: p.divider,
      text: { primary: p.textPrimary, secondary: p.textSecondary },
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
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } },
      },
    },
  });
}
