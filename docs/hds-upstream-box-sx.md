# Upstream ask: ship a `Box` + `sx` layout primitive

**For the HDS repo/thread.** Copy-paste-ready as a GitHub issue on
`hirobius/hirobius-design-system`. Successor to `docs/hds-upstream-asks-0.9.md` — the 0.9
asks (Textarea, general Tooltip, Skeleton, Combobox) all shipped in **0.11**; this is the
one remaining gap between a consumer and "pure HDS."

Grounded in a **full production cutover**: Apply Board (`hirobius/job-hunt`, Vite + React 18 +
TS, previously MUI v6) is now 100% HDS on `@hirobius/design-system@0.11.0`. The 0.11 component
additions closed every *component* gap. One *layout* gap forced us to build a local module to
finish — and it's the one every consuming app will hit.

---

## The gap

HDS's `Stack` / `Grid` / `Container` / `Text` / `Surface` are excellent for **structured**
layout, and that's by design — `Stack`'s `@ai-rules` explicitly forbid ad-hoc margins. But
every real screen has a residue of **one-off** layout that maps to no semantic token and
deserves no named component:

- a sticky search bar (`position: sticky; top: 0; zIndex: 2`)
- `position: relative` + an absolutely-positioned dismiss button
- a responsive `fontSize` / `padding` (`{ xs, sm }`)
- `scrollMarginTop` for a scroll-to target
- `& > *` width rules on an input wrapper
- `flex: 1; minWidth: 0`, `overflowWrap: 'anywhere'`, one-off `transform`/`transition`

Today the consumer's only options for this residue are:

1. **inline `style`** — but it can't express media queries, `&` child selectors, or
   `:hover`; and it invites raw hex values, drifting off the token system.
2. **hand-rolled CSS files** — defeats the point of an in-code design system and scatters
   layout away from the component.

MUI's `Box` + `sx` covered exactly this. Its absence is the **single reason** we couldn't go
pure-HDS without writing our own primitive.

## What we shipped locally (candidate to upstream)

A ~230-line, **dependency-free** `Box` with a deliberately **small, token-aware** `sx`
engine — not MUI's full `sx`, just the subset a real app actually uses. It lives at
[`src/ui/box.tsx`](../src/ui/box.tsx) in Apply Board. Reproduced design below.

### 1. The token map (MUI-style path → HDS CSS var)

The escape hatch stays **on-system** because color/spacing values resolve to HDS tokens:

```ts
const COLOR_TOKENS: Record<string, string> = {
  'primary.main':        'var(--semantic-accent-rest)',
  'primary.light':       'var(--semantic-accent-hover)',
  'primary.dark':        'var(--semantic-accent-pressed)',
  'text.primary':        'var(--semantic-color-content-primary)',
  'text.secondary':      'var(--semantic-color-content-secondary)',
  'text.disabled':       'var(--semantic-color-content-disabled)',
  'background.default':  'var(--semantic-color-surface-page)',
  'background.paper':    'var(--semantic-color-surface-raised)',
  divider:               'var(--semantic-color-border-default)',
  'success.main':        'var(--semantic-color-feedback-success)',
  'warning.main':        'var(--semantic-color-feedback-warning)',
  'info.main':           'var(--semantic-color-feedback-info)',
  'error.main':          'var(--semantic-color-feedback-error)',
  'action.selected':     'var(--semantic-color-surface-sunken)',
  'action.hover':        'var(--semantic-color-surface-sunken)',
};
```

(HDS would own the canonical key set — probably its own token names, e.g.
`color: 'content.secondary'` — rather than MUI's paths. We kept MUI paths to minimize
call-site churn during the cutover.)

### 2. The supported `sx` subset

- **Any CSS property** (camelCase) — passed through; numbers get `px` unless in a small
  `UNITLESS` set (`opacity`, `zIndex`, `fontWeight`, `lineHeight`, `flex`, `flexGrow`,
  `flexShrink`, `order`, `zoom`).
- **Spacing shorthands** — `m` / `mt` / `mr` / `mb` / `ml` / `mx` / `my` / `p` / `pt` / … /
  `px` / `py`, plus `gap` / `rowGap` / `columnGap`. Numeric values scale by an **8px** unit
  (`mb: 2` → `margin-bottom: 16px`).
- **Border radius** — numeric `borderRadius` scales by the theme radius unit (we used 12).
- **Numeric `border*`** — `borderTop: 1` → `border-top: 1px solid` (color from `borderColor`).
- **Token colors** — `color` / `backgroundColor` (`bgcolor` alias) / `borderColor` values
  resolve through `COLOR_TOKENS`.
- **Responsive objects** — `{ xs, sm, md, lg, xl }` on any property → `min-width` media
  queries at MUI's default breakpoints (`0 / 600 / 900 / 1200 / 1536`). `xs` is the base.
- **Nested `&` selectors** — `'& > *'`, `'&:hover'`, `'& [role="tab"]'`, etc. Responsive
  values compose **inside** selectors too.

### 3. The resolver → cached injected class

Each `sx` object resolves to a **hashed, cached CSS class** (not inline style), so media
queries and selectors actually work and identical objects share one rule. Algorithm:

1. **`walk(style, selectorSuffix, buckets)`** — recurse the object into a
   `Record<breakpoint, Record<selectorSuffix, Decls>>`:
   - key starts with `&` → recurse with `suffix + key.slice(1)`
   - value is a responsive object → distribute each breakpoint value into that bp's bucket
   - otherwise → expand shorthands/tokens into the `xs` (base) bucket
2. **hash** the resolved buckets → class name (e.g. `bx1sahnm4`).
3. **generate rules**: for each breakpoint, one rule per selector suffix
   (`.cls`, `.cls > *`, `.cls:hover`); wrap non-`xs` breakpoints in a `@media` block.
4. **inject once** into a shared `<style>` via `insertRule`, guarded by a `Set` of seen
   class names.

### 4. Non-obvious bug to bake into the reference impl ⚠️

**`CSSStyleSheet.insertRule()` accepts exactly one rule at a time.** When an `sx` has both
base declarations **and** a `&`-selector (e.g. `underline="hover"` → `&:hover`, or a
`& > *` wrapper), the naive "concatenate the rules and insert the string" throws — and if
the throw is swallowed, it **silently drops _all_ styles for that class, including the base
ones**. Symptom: an element gets its generated class but renders unstyled (e.g. a `Link`
that should be `display:block` renders inline).

Fix: insert **each top-level rule separately**. A `@media {...}` block is itself a single
rule, so its inner style rules *can* be concatenated inside it.

```ts
for (const bp of BP_ORDER) {
  const bySel = buckets[bp];
  if (!bySel) continue;
  const parts = Object.entries(bySel)
    .filter(([, d]) => Object.keys(d).length)
    .map(([sel, d]) => `.${cls}${sel}{${declsToText(d)}}`);
  if (!parts.length) continue;
  if (bp === 'xs') rules.push(...parts);              // one insertRule per rule
  else rules.push(`@media (min-width:${BP[bp]}px){${parts.join('')}}`); // one @media rule
}
```

## Suggested API / design goals

Ship a first-class `Box` (or `Frame` / `Slot` — name is yours) with a small, **token-first**
`sx` prop as the sanctioned escape hatch for ad-hoc layout:

1. **Token-first colors/spacing** — `sx` accepts HDS semantic tokens by name, resolving to
   CSS vars, so the escape hatch stays on-system.
2. **Responsive + `&` selectors** — the two things inline `style` can't do, and the whole
   reason a `Box` beats `style`.
3. **Keep it small on purpose** — an explicitly bounded subset, documented as "not all of
   CSS-in-JS." A narrow `sx` is a *feature*: it keeps consumers from drifting off tokens.
4. **`@ai-rules` guidance** — "reach for `Stack`/`Grid` first; use `Box sx` only for
   genuinely one-off layout" — so agents don't default to it.
5. **Polymorphic** via `as` / `component`.

The reusable core is **`Box` + the `sx` resolver + the token map**. `Stack` / `Typography` /
`Container` / `Link` / `Divider` are trivial wrappers once that exists (we ship those too,
but they're not the ask).

## Offer

Our implementation is available as a starting point (MIT, no deps beyond React + your `cn`):
[`src/ui/box.tsx`](../src/ui/box.tsx). Happy to port it as a PR against
`hirobius-design-system` directly — say the word.

---

### Appendix: what 0.11 already fixed (thank-you signal)

From the 0.9 field report (`docs/hds-upstream-asks-0.9.md`), all shipped in 0.11 and used in
the cutover:

- **`Tooltip`** (general accessible tooltip) — replaced MUI `Tooltip`; we wrap it in a
  6-line `title=`-shape adapter.
- **`Textarea`** — replaced every multiline `TextField` (job notes, snippet bodies, résumé
  paste).
- **`Skeleton`** — Suspense fallbacks.
- **`Combobox`** — the trade switcher.

The coexistence contract (`styles.css` scoped to `[data-hds]`) held through the entire
strangler — MUI and HDS rendered side-by-side for months with zero CSS collisions, which is
what made an incremental cutover possible at all.
