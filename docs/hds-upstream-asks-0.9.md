# HDS gap registry (live, #146)

Every local stand-in for something HDS doesn't do yet, with its upstream ask. Rule: when an HDS
release ships the fix, the upgrade PR deletes the workaround and moves its row to "Retired". HDS is
pinned at **0.30.0** (public npm; GitHub Packages stops at 0.26.2). Rows marked _shipped_ have
the HDS fix out and wait for their screen's redesign slice to migrate.

## Open

| Workaround                      | Where                                                                | What HDS lacks                                                                                         | Upstream         |
| ------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| Inline fillable blank (rev-3 A) | `.rjb-blank` / `.rjb-chip` in `src/theme/base.css` (`BlankText.tsx`) | a tappable inline token chip (TokenField chips aren't buttons; Tag is a 24px pill with no inline size) | to file          |
| Two-line card title (rev-3 H)   | `.rjb-card-title` / `.rjb-clamp-2` / `.rjb-clamp-3` in `base.css`    | a line clamp on `Text`, and a quiet (no underline at rest) title link                                  | to file          |
| One-line truncation             | `.rjb-truncate` in `src/theme/base.css`                              | a `truncate` option on `Text` / `InlineLink`                                                           | to file          |
| Resizable textarea              | `.rjb-resize` in `src/theme/base.css`                                | a `resize` prop on `Textarea`                                                                          | to file          |
| Keyboard-aware dialog           | `src/hds-gaps/useVisualViewportVars.ts`                              | a top-anchored, keyboard-aware Dialog or Sheet                                                         | related: hds#690 |
| `Text` weight                   | `.rjb-semibold` in `src/theme/base.css`                              | _shipped_ 0.28: `Text weight` (regular, medium, bold; no semibold step)                                | hds#825          |
| Phone touch size                | 40px rule in `src/theme/base.css`                                    | a touch size on sm controls                                                                            | hds#750          |
| Dark pressed accent contrast    | held pair in `src/theme.contrast.test.ts`                            | _shipped_ 0.27: AA on the dark pressed accent                                                          | hds#748          |

## Retired

| Workaround                                                        | Retired in                                                                | Upstream |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| `TokenTextarea` + chip-edit helpers in `templateEditor.ts`        | redesign slice 3 (HDS `TokenField`, 0.28)                                 | hds#826  |
| `TabsOverflowFade` (shell tabs, Discover, Find boards)            | redesign slice 3 (TabsList and SegmentedControl fade and scroll, 0.28)    | hds#823  |
| `hds-gaps/tone.ts` `SECONDARY` (plain span or p)                  | redesign slice 4 (every use is now `Text tone="secondary"`)               | hds#655  |
| `barePanel.ts` (Discover sections)                                | redesign slice 3 (`TabsContent variant="bare"`, 0.28)                     | hds#819  |
| `ActionToast` (Open, Undo)                                        | redesign slice 2 (HDS Toast `actions`, 0.28; `NoticeHost`)                | hds#815  |
| `AsyncState` (Live postings)                                      | redesign slice 2 (HDS `AsyncState` pattern, 0.28)                         | hds#818  |
| `EmptyState.tsx` icon composition                                 | redesign slice 2 (HDS `EmptyState icon`, 0.28; every caller uses HDS)     | hds#825  |
| Menu height cap in `base.css`                                     | redesign slice 2 (Menu caps its height, 0.28)                             | hds#821  |
| Job page `TabsOverflowFade` + inline bare panel                   | redesign slice 2 (three tabs, `TabsContent variant="bare"`)               | hds#819  |
| `RailList` (selectable link list)                                 | 0.30.0 upgrade (`NavList`, 0.28; link mode, as rail rows are routes)      | hds#817  |
| `DANGER` menu item colour                                         | 0.30.0 upgrade (`Menu.Item tone="danger"`, 0.28)                          | hds#822  |
| `useBreakpoint` / `useAtLeast` hook                               | 0.30.0 upgrade (HDS `useAtLeast`, 0.28)                                   | hds#824  |
| Shell `BARE_PANEL` style                                          | 0.30.0 upgrade (`TabsContent variant="bare"`, 0.28)                       | hds#819  |
| Account trigger (icon-only Menu button)                           | 0.30.0 upgrade (`Avatar` icon fallback + status dot, 0.30)                | rev-3 P  |
| Nested `'&'` breakpoint override in `sx`                          | 0.26.2 upgrade (`base` key)                                               | hds#652  |
| `EmptyState` action composed outside HDS                          | 0.26.2 upgrade (`action` prop, 0.25)                                      | hds#654  |
| `Text` + inline secondary colour                                  | 0.26.2 upgrade (`tone="secondary"`, 0.26)                                 | hds#655  |
| Active-tab underline patch in `base.css`                          | 0.26.2 upgrade (bug bash, 0.26)                                           | hds#749  |
| Wrapper fade on TabsList                                          | 0.26.2 upgrade (TabsList fades, 0.26.1)                                   | hds#723  |
| `<section>` around a `Stack` for `aria-*`                         | 0.26.2 upgrade (Stack forwards `aria-*`, 0.26.1)                          | 0.26.1   |
| Auto-fit `Grid` instead of MetricTiles                            | Insights view removed; MetricTiles caps at 2 columns on a phone in 0.26.1 | 0.26.1   |
| `Sheet` / `SheetMenu`, `.app-sheet*`, `body { overflow-x: clip }` | removed with the v1 redesign (#149)                                       | hds#690  |

---

# @hirobius/design-system 0.9.0 — field report + remaining asks (Apply Board cutover)

> **Superseded (2026-10-12, epic #89).** HDS shipped these asks — `Box` with a token-only `sx`,
> `Stack`, `Text`, `Switcher`, `Disclosure`, `EmptyState` — and the app now uses them; the local
> `src/ui` layer this document argued for is deleted. Kept as history. Open HDS gaps found during the
> move are filed in hirobius/hds (hds#652 and the follow-ups linked from #89).

**For the HDS repo/thread.** Grounded in a full production cutover of Apply Board
(Vite + React 18 + TS, previously MUI v6) onto `@hirobius/design-system@0.9.0` from public
npm. Six migration waves are live or on preview: consumption model + feedback tokens,
Button (all ~40 sites), Card, Tag/Badge, SegmentedControl, IconButton + lucide, Input,
Tabs (top nav + sub-tabs), Menu. Every wave was gate-checked (tsc, build, 136 tests incl.
a token-level AA contrast audit of the shipped `variables.css`) and verified on headless
renders with real interactions.

## What worked first try (signal, not just praise)

- **`styles.css` coexistence contract holds.** Zero host-element changes verified —
  MUI and HDS rendered side-by-side for the whole strangler migration without a single
  CSS collision. This is the feature that made an incremental cutover possible at all.
- **`/mui` preset works** with MUI v6 `cssVariables` mode; MUI-themed status colors and
  HDS `tone` colors are identical by construction.
- **Button `tone`, Badge `inProgress`, semantic feedback tokens** — dropped in exactly
  as specced in the previous brief. The status system (Saved/Applied/Interviewing/
  Offer/Rejected) is fully token-driven now.
- **Tabs** replaced a hand-built MUI tab/tabpanel ARIA setup and **all role-based a11y
  tests passed unchanged** — Radix wiring matched what we'd built by hand. Scrollable
  TabsList removed MUI's mobile scroll-arrow clutter.
- **Menu** (RadioGroup for sort, per-row item menus) deleted two pieces of anchorEl
  state plumbing. **SegmentedControl** exposes radiogroup semantics (we updated one
  test's role query — correct change).
- **Input's built-in clear affordance** is great — we deleted a custom clear button.

## Asks, in priority order

### 1. Per-component subpath exports (carried over — now the top cost)

One `Button` import pulls all of `hirobius-ui.js` (~308 kB src → our vendor chunk is
~406 kB with motion, lucide, all radix). Now that the app consumes ~12 HDS components
this is tolerable, but any light consumer pays the full freight.
**Accept:** importing only `@hirobius/design-system/button` builds without motion/
lucide/unused radix and without the full stylesheet.

### 2. `Textarea`

The last two text surfaces (job Notes, snippet body) are still MUI because HDS has no
multiline field. Same shell/label/helper contract as `Input`.
**Accept:** `<Textarea label="Notes" minRows={2} />` renders the Input visual language;
we delete our final `TextField`.

### 3. General `Tooltip` primitive

The shipped Tooltip is the internal image-interaction pill (`@internal`, cursor/centered
modes). There's no general hover/focus tooltip, so HDS IconButtons app-wide are still
wrapped in **MUI** Tooltip — one of the last blockers to deleting `@mui/material`.
**Accept:** `<Tooltip content="Pin to top"><IconButton …/></Tooltip>` — Radix tooltip,
overlay-token themed, works on hover + keyboard focus.

### 4. Document (or slot-ify) Input's trailing-visual semantics

`trailingVisual` is `aria-hidden` + `pointer-events-none` — deliberately decorative. We
put a clear _button_ in it and it silently became invisible to a11y and unclickable
(caught only because our render harness clicks things). Two asks:

- **Docs:** state loudly that visuals are decorative and that a built-in clear exists
  (we discovered the built-in by accident, then deleted our workaround).
- **API:** an interactive `trailingAction` slot (positioned, focusable, not hidden) for
  cases like password-reveal, copy, or unit pickers.
  **Accept:** an interactive element in the designated slot is clickable and in the a11y
  tree; docs cover the decorative slots + built-in clear.

### 5. `/mui` preset: ship complete color objects (+ channel keys)

Two consumer papercuts with `cssVariables: true`:

- MUI's `augmentColor` throws running color math on `var()` strings, so every palette
  color needs explicit `light`/`dark`/`contrastText`. The preset ships only `main`, so
  consumers must wrap each entry themselves (we carry a `tone()` helper for this).
- MUI warns it can't derive `palette.*Channel` from `var()` values
  (`secondaryChannel` in our console).
  **Accept:** `createTheme({ ...hdsMuiThemeOptions() })` produces zero warnings and needs
  no consumer-side color wrapping.

### 6. Token-drive the Tabs active-underline color

Active trigger is `border-foreground` (hardcoded to content color). The accent _tint_ is
token-driven, the underline isn't — a brand that wants an accent underline must override
a Tailwind class.
**Accept:** underline color reads a semantic token (default can stay foreground).

### 7. Contrast check: tertiary button focus/hover state

Watch item from our renders: tertiary buttons in the focused/hover state render a pale
`accent-subtle` pill; at small sizes the label reads low-contrast against it (observed
in dark mode). May be fine — flagging for an AA pass on that state specifically.
**Accept:** tertiary hover/focus label meets 4.5:1 in both themes.

### 8. `Tag` delete affordance

`Tag` covers filter/toggle chips well. Removable chips (our PillarsDialog list editor
uses MUI Chip `onDelete`) have no HDS equivalent.
**Accept:** `<Tag onRemove={…}>` (or a `RemovableTag`) with a keyboard-accessible
remove control.

## Addendum (2026-07): adapters retired — layout primitives are the last ask

The MUI-shaped compatibility shims (`ui/Button`, `ui/Dialog`, `ui/Tooltip`, `ui/Alert`,
`ui/TextField`) that this report tracked have all been **deleted**. Every call site now
consumes the real HDS component directly — Button `variant`/`tone`, the compound `Dialog`
(`Dialog.Content`/`Header`/`Title`/`Footer`), `HdsTooltip`, `Alert tone` with a dismiss
`IconButton`, and `Input`/`Textarea`. `@mui/*` and `@emotion/*` are already gone from the
tree; nothing MUI-shaped remains in the component layer.

### 9. Layout primitives — `Box` / `Stack` / `Typography` + an `sx` engine (the ONLY remaining non-HDS UI)

After the adapter retirement, the entire local UI layer is `src/ui/box.tsx`
(`Box`/`Stack`/`Typography`/`Container`/`Link`/`Divider` on a token-aware `sx` engine —
spacing shorthands, the HDS token color map, responsive `{xs,sm,md}` objects, nested `&`
selectors → cached injected CSS classes) plus `Reveal` (a CSS-grid `<Collapse>`). ~150
`sx=` sites and ~200 primitive elements depend on it. HDS has no layout/`sx` primitive, so
this cannot be deleted — only _adopted upstream_. It is kept MUI/emotion-free and
dependency-light specifically so it can be lifted into HDS wholesale.
**Accept:** HDS ships a layout primitive set (`Box`/`Stack` + a token-scoped style prop)
that covers ad-hoc spacing/flex/grid and the responsive-object + nested-selector cases,
so consumers stop hand-rolling one. Until then this layer stays local by design, not debt.

## Downstream state (historical — see addendum above for current state)

Still MUI in Apply Board, by cause: Tooltip (ask 3), multiline fields (ask 2),
PillarsDialog/AI dialogs (migratable now via HDS Dialog/Combobox/Callout — next wave,
plus ask 8 for its chip editor), Skeletons/Collapse/Select (migratable now), layout
primitives (last sweep). Once asks 2–3 land we can delete `@mui/material`,
`@emotion/*`, and `@mui/icons-material` entirely; ask 1 then determines the final
bundle size.
