import { createTheme, type Theme } from '@mui/material/styles';
import { hdsMuiThemeOptions } from '@hirobius/design-system/mui';

const head = '"Clash Display", system-ui, sans-serif';
const body = '"Satoshi", system-ui, -apple-system, sans-serif';

// On-accent text: HDS default (white-ish), never inverted — see brand-jade.css.
const onAccent = 'var(--semantic-color-content-onAccent)';

// MUI's augmentColor computes light/dark/contrastText from `main` via color math, which
// throws on a `var()` string — so every color channel is spelled out. The values barely
// matter visually (our surfaces use main + outlined/text variants); what matters is that
// MUI never has to parse them.
const tone = (v: string) => ({ main: v, light: v, dark: v, contrastText: onAccent });

// Palette comes from the HDS /mui preset (ADR-0005): every value is an HDS token CSS
// variable that flips light/dark via [data-theme] on <html>, so ONE options object
// covers both modes — `mode` is still passed so MUI's derived colors (action states,
// elevation overlays) match the visible scheme. Status hues are HDS's semantic feedback
// tokens (the same vars behind HDS <Button tone> / <Badge tone>), AA-verified upstream
// and re-asserted in src/theme.contrast.test.ts against the shipped variables.css.
export function makeTheme(mode: 'light' | 'dark'): Theme {
  const hds = hdsMuiThemeOptions();
  const accent = hds.palette.primary.main;
  return createTheme({
    ...hds,
    palette: {
      mode,
      primary: {
        main: accent,
        light: 'var(--semantic-accent-hover)',
        dark: 'var(--semantic-accent-pressed)',
        contrastText: onAccent,
      },
      // secondary = the Interviewing status hue; HDS ships it as the inProgress feedback token.
      secondary: tone('var(--semantic-color-feedback-inProgress)'),
      error: tone(hds.palette.error.main),
      warning: tone(hds.palette.warning.main),
      info: tone(hds.palette.info.main),
      success: tone(hds.palette.success.main),
      background: hds.palette.background,
      text: hds.palette.text,
      divider: hds.palette.divider,
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
      // One shared, visible keyboard focus ring across all interactive elements. The jade
      // accent clears 3:1 (WCAG non-text) on both surfaces; the offset keeps it legible
      // even when the focused control is itself jade.
      MuiButtonBase: {
        styleOverrides: {
          root: {
            '&:focus-visible': {
              outline: `2px solid ${accent}`,
              outlineOffset: 2,
              borderRadius: 6,
            },
          },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 2 },
          },
        },
      },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } },
      },
    },
  });
}
