/* eslint-disable react-refresh/only-export-components -- primitives + the shared sx engine/type co-located by design */
/*
 * Layout primitives — the MUI-free replacement for the `Box` / `Stack` / `Typography` /
 * `Container` / `Link` / `Divider` set (ADR-0004/0005, issue #11: final MUI deletion).
 *
 * HDS ships semantic primitives (Stack, Grid, Container, Text, Surface…) whose props are
 * design tokens (`gap="normal"`), not arbitrary CSS — so there is no `Box`, and no `sx`
 * escape hatch for the one-off layout every app still needs. This module fills exactly
 * that gap with a small, dependency-free, token-aware `sx` engine and the handful of
 * primitives built on it. It is written to be routed UPSTREAM to HDS as a `Box` + `sx`
 * primitive (see docs/hds-upstream-asks-0.9.md); nothing here depends on MUI or emotion.
 *
 * The `sx` prop is a deliberately small subset of MUI's: CSS properties (camelCase),
 * spacing shorthands (m/p/gap families, scaled 8px per unit), HDS token color strings
 * (`color: 'text.secondary'`), responsive objects (`{ xs, sm, md, lg }`), and nested
 * `&`-selectors. Values resolve to a real, cached CSS class so media queries and child
 * selectors work — the things inline `style` cannot express.
 */
import {
  createElement,
  forwardRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react';

// ---- token map: MUI-style theme path → HDS semantic CSS var (see src/theme.ts history) ----
const COLOR_TOKENS: Record<string, string> = {
  'primary.main': 'var(--semantic-accent-rest)',
  'primary.light': 'var(--semantic-accent-hover)',
  'primary.dark': 'var(--semantic-accent-pressed)',
  'text.primary': 'var(--semantic-color-content-primary)',
  'text.secondary': 'var(--semantic-color-content-secondary)',
  'text.disabled': 'var(--semantic-color-content-disabled)',
  'background.default': 'var(--semantic-color-surface-page)',
  'background.paper': 'var(--semantic-color-surface-raised)',
  divider: 'var(--semantic-color-border-default)',
  'success.main': 'var(--semantic-color-feedback-success)',
  'warning.main': 'var(--semantic-color-feedback-warning)',
  'info.main': 'var(--semantic-color-feedback-info)',
  'error.main': 'var(--semantic-color-feedback-error)',
  'action.selected': 'var(--semantic-color-surface-sunken)',
  'action.hover': 'var(--semantic-color-surface-sunken)',
};
const mapColor = (v: unknown): string =>
  typeof v === 'string' && COLOR_TOKENS[v] ? COLOR_TOKENS[v] : String(v);

// Breakpoints match MUI's defaults so migrated `{ xs, sm, md }` values keep their meaning.
const BP: Record<string, number> = { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 };
const isBpKey = (k: string) => k in BP;

// CSS length props take numbers verbatim (no px suffix); everything else numeric gets px.
const UNITLESS = new Set([
  'opacity',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
  'zoom',
]);

// Spacing shorthands → real CSS props, values scaled 8px per unit (MUI's default spacing).
const SPACE_ALIASES: Record<string, string[]> = {
  m: ['margin'],
  mt: ['marginTop'],
  mr: ['marginRight'],
  mb: ['marginBottom'],
  ml: ['marginLeft'],
  mx: ['marginLeft', 'marginRight'],
  my: ['marginTop', 'marginBottom'],
  p: ['padding'],
  pt: ['paddingTop'],
  pr: ['paddingRight'],
  pb: ['paddingBottom'],
  pl: ['paddingLeft'],
  px: ['paddingLeft', 'paddingRight'],
  py: ['paddingTop', 'paddingBottom'],
};
const SPACE_SCALED = new Set(['gap', 'rowGap', 'columnGap']);
const scale = (v: unknown) => (typeof v === 'number' ? `${v * 8}px` : (v as string));

const RENAME: Record<string, string> = { bgcolor: 'backgroundColor' };
const COLOR_PROPS = new Set(['color', 'backgroundColor', 'borderColor']);
const BORDER_PROPS = new Set(['border', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft']);

const camelToKebab = (p: string) => p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const cssValue = (prop: string, val: unknown): string => {
  if (typeof val === 'number' && !UNITLESS.has(prop)) return `${val}px`;
  return String(val);
};

type Decls = Record<string, string>;

// The app's old MUI theme set shape.borderRadius = 12, and sx multiplies numeric radii by it.
const RADIUS_UNIT = 12;

// Expand one { prop: value } into concrete CSS declarations (handling shorthands + tokens).
function expand(prop: string, value: unknown, out: Decls) {
  if (prop in SPACE_ALIASES) {
    for (const real of SPACE_ALIASES[prop]) out[real] = scale(value);
    return;
  }
  if (SPACE_SCALED.has(prop)) {
    out[prop] = scale(value);
    return;
  }
  if (prop === 'borderRadius' && typeof value === 'number') {
    out[prop] = `${value * RADIUS_UNIT}px`;
    return;
  }
  if (BORDER_PROPS.has(prop) && typeof value === 'number') {
    out[prop] = `${value}px solid`;
    return;
  }
  const name = RENAME[prop] ?? prop;
  out[name] = COLOR_PROPS.has(name) ? mapColor(value) : cssValue(name, value);
}

const declsToText = (d: Decls) =>
  Object.entries(d)
    .map(([k, v]) => `${camelToKebab(k)}:${v}`)
    .join(';');

// Deterministic hash → stable class name, so identical sx objects share one injected rule.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return 'bx' + (h >>> 0).toString(36);
}

let sheet: CSSStyleSheet | null = null;
const injected = new Set<string>();
function inject(cls: string, rules: string[]) {
  if (injected.has(cls) || typeof document === 'undefined') return;
  injected.add(cls);
  if (!sheet) {
    const el = document.createElement('style');
    el.setAttribute('data-ui-box', '');
    document.head.appendChild(el);
    sheet = el.sheet as CSSStyleSheet;
  }
  for (const r of rules) {
    try {
      sheet.insertRule(r, sheet.cssRules.length);
    } catch {
      /* ignore malformed rule */
    }
  }
}

export type Sx = Record<string, unknown>;

// Declarations bucketed by breakpoint → selector-suffix ('' = the element itself). A nested
// '&'-selector appends its suffix; a responsive value routes into the matching breakpoint —
// and the two compose, so `'& x': { p: { xs, sm } }` works.
type Buckets = Record<string, Record<string, Decls>>;
const ensure = (b: Buckets, bp: string, sel: string): Decls => ((b[bp] ??= {})[sel] ??= {});

function walk(style: Sx, sel: string, b: Buckets) {
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    if (key.startsWith('&')) {
      walk(value as Sx, sel + key.slice(1), b);
    } else if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).some(isBpKey)
    ) {
      for (const [bp, v] of Object.entries(value as Record<string, unknown>))
        if (v != null && isBpKey(bp)) expand(key, v, ensure(b, bp, sel));
    } else {
      expand(key, value, ensure(b, 'xs', sel));
    }
  }
}

const BP_ORDER = ['xs', 'sm', 'md', 'lg', 'xl'];

/** Resolve an sx object to a cached class name (or '' when empty). */
export function sxClass(sx?: Sx): string {
  if (!sx) return '';
  const buckets: Buckets = {};
  walk(sx, '', buckets);

  const cls = hash(JSON.stringify(buckets));
  if (!injected.has(cls)) {
    const rules: string[] = [];
    for (const bp of BP_ORDER) {
      const bySel = buckets[bp];
      if (!bySel) continue;
      // One rule per (breakpoint, selector): insertRule() accepts a single rule only, so a
      // base rule plus a '&'-selector rule must be inserted separately. A @media wrapper is
      // itself one rule, so its inner style rules can be concatenated inside it.
      const parts = Object.entries(bySel)
        .filter(([, d]) => Object.keys(d).length)
        .map(([sel, d]) => `.${cls}${sel}{${declsToText(d)}}`);
      if (!parts.length) continue;
      if (bp === 'xs') rules.push(...parts);
      else rules.push(`@media (min-width:${BP[bp]}px){${parts.join('')}}`);
    }
    inject(cls, rules);
  }
  return cls;
}

const join = (...xs: (string | undefined | false)[]) => xs.filter(Boolean).join(' ');

// ---- Box: the polymorphic styled element ----
export interface BoxProps {
  as?: ElementType;
  component?: ElementType; // MUI alias for `as`
  sx?: Sx;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  // Polymorphic escape hatch: a Box can render any element, so it forwards arbitrary
  // element props (value/onChange/href/…). `any` is deliberate here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const Box = forwardRef<HTMLElement, BoxProps>(function Box(
  { as, component, sx, className, children, ...rest },
  ref,
) {
  const Tag = (as ?? component ?? 'div') as ElementType;
  return createElement(
    Tag,
    { ref, className: join(sxClass(sx), className) || undefined, ...rest },
    children,
  );
});

// ---- Stack: flex flow with a gap ----
type Responsive<T> = T | Partial<Record<keyof typeof BP, T>>;
export interface StackProps extends Omit<BoxProps, 'sx'> {
  direction?: Responsive<'row' | 'column'>;
  spacing?: Responsive<number>;
  alignItems?: string;
  justifyContent?: string;
  flexWrap?: CSSProperties['flexWrap'];
  useFlexGap?: boolean; // accepted for parity; gap is always used
  sx?: Sx;
}

export const Stack = forwardRef<HTMLElement, StackProps>(function Stack(
  { direction = 'column', spacing, alignItems, justifyContent, flexWrap, useFlexGap, sx, ...rest },
  ref,
) {
  void useFlexGap;
  const merged: Sx = {
    display: 'flex',
    flexDirection: direction,
    ...(spacing != null ? { gap: spacing } : {}),
    ...(alignItems ? { alignItems } : {}),
    ...(justifyContent ? { justifyContent } : {}),
    ...(flexWrap ? { flexWrap } : {}),
    ...sx,
  };
  return <Box ref={ref} sx={merged} {...rest} />;
});

// ---- Typography: MUI variant names → jade type scale (kept from the old MUI theme) ----
const TYPE: Record<string, Sx> = {
  h1: {
    fontFamily: '"Clash Display", system-ui, sans-serif',
    fontWeight: 600,
    fontSize: '2.4rem',
    letterSpacing: '-0.01em',
    lineHeight: 1.05,
  },
  h2: {
    fontFamily: '"Clash Display", system-ui, sans-serif',
    fontWeight: 600,
    fontSize: '1.35rem',
    letterSpacing: '-0.005em',
    lineHeight: 1.15,
  },
  h3: {
    fontFamily: '"Clash Display", system-ui, sans-serif',
    fontWeight: 600,
    fontSize: '1.15rem',
    lineHeight: 1.2,
  },
  h6: { fontFamily: '"Clash Display", system-ui, sans-serif', fontWeight: 600, fontSize: '1rem' },
  subtitle1: { fontWeight: 600, fontSize: '1rem' },
  body1: { fontSize: '0.95rem' },
  body2: { fontSize: '0.85rem' },
  caption: { fontSize: '0.78rem' },
  overline: {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
};
const TYPE_TAG: Record<string, string> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h6: 'h6',
  subtitle1: 'h6',
  body1: 'p',
  body2: 'p',
  caption: 'span',
  overline: 'span',
};

export interface TypographyProps extends Omit<BoxProps, 'sx'> {
  variant?: keyof typeof TYPE;
  color?: string;
  align?: CSSProperties['textAlign'];
  sx?: Sx;
}

export const Typography = forwardRef<HTMLElement, TypographyProps>(function Typography(
  { variant = 'body1', color, align, component, as, sx, ...rest },
  ref,
) {
  const merged: Sx = {
    margin: 0,
    ...TYPE[variant],
    ...(color ? { color } : {}),
    ...(align ? { textAlign: align } : {}),
    ...sx,
  };
  return <Box ref={ref} as={as ?? component ?? TYPE_TAG[variant] ?? 'p'} sx={merged} {...rest} />;
});

// ---- Container: centered max-width column ----
const MAXW: Record<string, string> = { xs: '444px', sm: '600px', md: '900px', lg: '1200px' };
export interface ContainerProps extends Omit<BoxProps, 'sx'> {
  maxWidth?: keyof typeof MAXW | false;
  sx?: Sx;
}
export const Container = forwardRef<HTMLElement, ContainerProps>(function Container(
  { maxWidth = 'lg', sx, ...rest },
  ref,
) {
  const merged: Sx = {
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    ...(maxWidth ? { maxWidth: MAXW[maxWidth] } : {}),
    ...sx,
  };
  return <Box ref={ref} sx={merged} {...rest} />;
});

// ---- Link ----
export interface LinkProps extends Omit<BoxProps, 'sx'> {
  href?: string;
  underline?: 'none' | 'hover' | 'always';
  color?: string;
  variant?: keyof typeof TYPE;
  target?: string;
  rel?: string;
  sx?: Sx;
}
export const Link = forwardRef<HTMLElement, LinkProps>(function Link(
  { href, underline = 'always', color = 'primary.main', variant, sx, ...rest },
  ref,
) {
  const merged: Sx = {
    color,
    cursor: 'pointer',
    textDecoration: underline === 'always' ? 'underline' : 'none',
    ...(variant ? TYPE[variant] : {}),
    ...(underline === 'hover' ? { '&:hover': { textDecoration: 'underline' } } : {}),
    ...sx,
  };
  return <Box ref={ref} as="a" href={href} sx={merged} {...rest} />;
});

// ---- Divider ----
export interface DividerProps extends Omit<BoxProps, 'sx'> {
  orientation?: 'horizontal' | 'vertical';
  sx?: Sx;
}
export const Divider = forwardRef<HTMLElement, DividerProps>(function Divider(
  { orientation = 'horizontal', sx, ...rest },
  ref,
) {
  const merged: Sx =
    orientation === 'vertical'
      ? { borderLeft: 1, borderColor: 'divider', alignSelf: 'stretch', ...sx }
      : { borderTop: 1, borderColor: 'divider', ...sx };
  return <Box ref={ref} as="hr" sx={{ margin: 0, border: 0, ...merged }} {...rest} />;
});
