# HDS gap registry (live, #146)

Every local stand-in for something HDS doesn't do yet, with its upstream ask. Rule: when an HDS
release ships the fix, the upgrade PR deletes the workaround and moves its row to "Retired". HDS is
pinned at **0.32.0** (public npm; GitHub Packages stops at 0.26.2). Rows marked _shipped_ have
the HDS fix out and wait for their screen's redesign slice to migrate.

## Open

| Workaround                                  | Where                                                                                                                               | What HDS lacks                                                                                                                                                                                                                                                                                                                                                                      | Upstream                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Inline fillable blank (rev-3 A)             | `.rjb-blank` / `.rjb-chip` in `src/theme/base.css` (`BlankText.tsx`)                                                                | a tappable inline token chip (TokenField chips aren't buttons; Tag is a 24px pill with no inline size)                                                                                                                                                                                                                                                                              | to file                       |
| Two-line card title (rev-3 H)               | `.rjb-card-title` / `.rjb-clamp-2` / `.rjb-clamp-3` in `base.css`                                                                   | a line clamp on `Text`, and a quiet (no underline at rest) title link                                                                                                                                                                                                                                                                                                               | to file                       |
| Clear-input end padding (phone)             | `input:has(~ button[aria-label='Clear input'])` in `src/theme/base.css` (job Details fields)                                        | the input's end padding should follow the clear button's width (the 40/44px touch rule widens the × but the text keeps 28px of padding, so it runs under it)                                                                                                                                                                                                                        | to file                       |
| One-line truncation                         | `.rjb-truncate` in `src/theme/base.css`                                                                                             | a `truncate` option on `Text` / `InlineLink`                                                                                                                                                                                                                                                                                                                                        | to file                       |
| Keyboard-aware dialog                       | `src/hds-gaps/useVisualViewportVars.ts`                                                                                             | a top-anchored, keyboard-aware Dialog or Sheet                                                                                                                                                                                                                                                                                                                                      | related: hds#690              |
| `Text` weight                               | `.rjb-semibold` in `src/theme/base.css`                                                                                             | _shipped_ 0.28: `Text weight` (regular, medium, bold; no semibold step)                                                                                                                                                                                                                                                                                                             | hds#825                       |
| Action feedback motion (#212)               | `[data-motion=flash\|collapse]` / `.rjb-pop` in `base.css` (`src/feedback.ts`)                                                      | motion wired into components: a pressed toggle that pops, a list item that highlights on insert and collapses on removal                                                                                                                                                                                                                                                            | hds `claude/component-motion` |
| Phone touch size                            | 40px rule in `src/theme/base.css`                                                                                                   | a touch size on sm controls                                                                                                                                                                                                                                                                                                                                                         | hds#750                       |
| EmptyState italic + centred                 | `src/hds-gaps/EmptyState.tsx` (every app empty state imports it)                                                                    | a non-italic EmptyState title, and a centred teaching variant (icon tile, bold title, framed)                                                                                                                                                                                                                                                                                       | to file                       |
| Alert title size in a panel                 | `.rjb-inline-alerts` in `src/theme/base.css` (Live postings)                                                                        | an Alert `size` (its titleSm title reads as a page head and wraps at 390)                                                                                                                                                                                                                                                                                                           | to file                       |
| Avatar inflated by touch rule               | `.rjb-avatar` / `.rjb-account` in `src/theme/base.css` (Account menu)                                                               | the phone touch-size rule (`.h-8` min-height, `.w-8[class*=h-8]` min-width) must not target Avatar, which is not a control; icon Button touch width 40 like the app                                                                                                                                                                                                                 | to file                       |
| Compact save Toast                          | `NoticeHost` drops the description and uses `tone="success"`                                                                        | an inline-actions or compact Toast layout (title and Open / Undo on one line, rev-3 #s-save-notice)                                                                                                                                                                                                                                                                                 | to file                       |
| Toast announced politely (#365)             | `src/hds-gaps/toastAnnouncer.ts` (installed in `main.tsx`)                                                                          | a Radix `type` on `ToastOptions` (polite / background for non-error tones), and a separator between the title and description in Radix's announce text (draft in the `claude/jh-a11y` PR)                                                                                                                                                                                           | to file                       |
| Shell dialog placement                      | `.rjb-sheet` in `src/account/sheet.css` (sign-in, Reset)                                                                            | a top-anchored, keyboard-aware Dialog / AlertDialog placement on a phone                                                                                                                                                                                                                                                                                                            | related: hds#690              |
| 16px phone form fields                      | `@media (max-width: 639.98px)` input/textarea/select rule in `base.css`                                                             | compact density sets fields to 13px; iOS Safari zooms on focus below 16px. Fields need ≥ 16px below `sm`                                                                                                                                                                                                                                                                            | to file                       |
| Tab row flush with the gutter               | `.rjb-job-tabs` first-tab padding in `src/theme/base.css` (job page)                                                                | a TabsList option whose first tab (label and underline) starts on the content edge                                                                                                                                                                                                                                                                                                  | to file                       |
| Apply pager size + disabled                 | `nav[aria-label='Jobs to apply']` in `base.css` (`ApplyMode`)                                                                       | a bordered 40x40 compact Pagination button; a disabled tertiary without the grey primary fill                                                                                                                                                                                                                                                                                       | to file                       |
| Fill field surface (rev-3 A)                | `.rjb-fillbox` in `src/theme/base.css` (`BlankText.tsx`)                                                                            | a page-surface Card, so an input in a card in a raised panel isn't a dark hole                                                                                                                                                                                                                                                                                                      | to file                       |
| Message dialog size + scroll body           | `.rjb-dialog` / `.rjb-dialog-body` in `src/theme/base.css` (`FollowUp`, `UseTemplate`)                                              | a size option and a scrolling body with a pinned header and footer on `Dialog.Content`, and a 16px phone inset                                                                                                                                                                                                                                                                      | to file                       |
| Grouped list (Adrian 2026-11-04)            | `PipelinePanel` `ItemList` / `ItemRow`, `.rjb-items` hairlines in `src/theme/base.css` (Apply mode, New companies, Review new, kit) | an inset grouped list: heading outside the surface, rows with leading / trailing slots, inset dividers, group gap > row gap (spec under "Grouped list ask")                                                                                                                                                                                                                         | to file                       |
| ------------------------------------        | ---------------------------------------------------------------------------------------------------                                 | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------                                                                                                                                                                                                     | ----------------              |
| Disclosure row hover/press (rev-3 M)        | `.rjb-doc-row` in `src/theme/base.css` (`DocumentsLibrary.tsx`)                                                                     | a hover and pressed background on `Disclosure variant="row"`, so the whole row reads as tappable                                                                                                                                                                                                                                                                                    | to file                       |
| Dialog title/description gap                | `[role='alertdialog'] h2 + p` in `src/theme/base.css`                                                                               | the header's `space-y-1.5` loses to a host's unlayered `h2, p { margin: 0 }`; a gap (or a layered reset) that survives it. Also: the 24px title is heavier than the mock's 20px                                                                                                                                                                                                     | to file                       |
| Back link aligned to the heading            | `.rjb-back` in `src/theme/base.css` (`DocumentsView`, `DocumentEditor`, `CompanyPage`, `JobHeader`, `LegalPage`)                    | a flush / inline tertiary Button (no inline padding), so a back link's icon lines up with the page heading                                                                                                                                                                                                                                                                          | to file                       |
| Inline text-link button (Pipeline)          | `.rjb-inline-link` in `src/theme/base.css` (`SampleBanner`)                                                                         | a link-styled Button variant (or `InlineLink` as a button): InlineLink takes only an `href`                                                                                                                                                                                                                                                                                         | to file                       |
| Icon stroke 1.75 (rev-3 item 3)             | `[data-hds] svg.lucide` in `src/theme/base.css`                                                                                     | a 1.75 default stroke on the shared `Icon` and the icons inside HDS components                                                                                                                                                                                                                                                                                                      | to file                       |
| Page header counts line (Pipeline)          | hand-built `header` in `TrackerView.tsx`                                                                                            | `PageHeader` `description` sits 4 under the title and beside the actions on a phone (it drops below the actions row with a 12 gap)                                                                                                                                                                                                                                                  | to file                       |
| Vertical row chevron (rev-3)                | `.rjb-disclosure-vertical` in `src/theme/base.css` (`LiveFeedPanel`, `FeedFit`)                                                     | a chevron direction on `Disclosure variant="row"` (down when closed, up when open; it turns right)                                                                                                                                                                                                                                                                                  | to file                       |
| Company type-ahead (rev-3 L)                | `FindBoardsPanel.tsx` (typed text read from the bubbling change event)                                                              | `onInputChange` on creatable `Combobox` for async options, and a rich option (leading logo/initial, a second line)                                                                                                                                                                                                                                                                  | to file                       |
| Documents row preview (rev-3 M)             | `.rjb-doc-preview` in `base.css`; chips in the row label (`DocumentsLibrary.tsx`)                                                   | a multi-line `preview` on `Disclosure variant="row"` that can stay while open                                                                                                                                                                                                                                                                                                       | to file                       |
| Select trigger text centred and wrapping    | `[data-hds] button[role='combobox'] > span:first-child` in `src/theme/base.css` (`DocumentEditor` Fill for)                         | Select's trigger value is centred with `white-space: normal`, so a long option label wraps onto two centred lines and the trigger outgrows its 40px peers; ask: start-aligned, one line, ellipsis                                                                                                                                                                                   | to file                       |
| framer-motion pin                           | `overrides` in `package.json` (framer-motion 12.23.24, motion-dom 12.23.23, motion-utils 12.23.6)                                   | pin `motion` → framer-motion: 12.42 wraps every AnimatePresence child in PopChild and reads `children.props.ref`, a React 18 console error on each Disclosure open                                                                                                                                                                                                                  | to file                       |
| Toast action icon (rev-3 O)                 | none: Reload ships as a text-only action (`RELOAD_ACTION` in `src/cloudMessages.ts`)                                                | an `icon` on `ToastAction`, so the sync-failure toast's Reload carries the mock's RotateCw (16px)                                                                                                                                                                                                                                                                                   | to file                       |
| Quiet tertiary (rev-3 G)                    | `.rjb-quiet` in `src/theme/base.css` (`TileGrid` Set aside, Details)                                                                | a quiet tone on tertiary `Button` (secondary text colour), for a low-priority action beside a primary one                                                                                                                                                                                                                                                                           | to file                       |
| Query text wrap + clamp (ATS search)        | `.rjb-query` / `.rjb-clamp-4` in `src/theme/base.css` (`DiscoverView`)                                                              | a word-boundary wrap and a line clamp on `Text variant="mono"` (shared ask with one-line truncation)                                                                                                                                                                                                                                                                                | to file                       |
| Title menu trigger (rev-3 G)                | `.rjb-title-trigger` in `src/theme/base.css` (`DiscoverHeader`)                                                                     | a `PageHeader` title that opens a Menu (a switcher in the heading's own type)                                                                                                                                                                                                                                                                                                       | to file                       |
| Dismissible tag (Manage track)              | `.rjb-term` / `.rjb-term-x` in `src/theme/base.css` (`ManageTrackDialog`)                                                           | a dismiss slot on `Tag` (a static pill whose X alone removes it, with a 40px hit area)                                                                                                                                                                                                                                                                                              | to file                       |
| NavList row trailing action                 | `src/hds-gaps/NavListActionItem.tsx` + `.css` (`JobRail.tsx`)                                                                       | a trailing action slot on `NavList.Item`, rendered beside its link, not inside it (the job rail's posting link, Adrian 2026-10-22)                                                                                                                                                                                                                                                  | to file                       |
| App shell at the portfolio measure          | `src/hds-gaps/PageShell.tsx` + `.css` (`App.tsx`)                                                                                   | a `shell` width (1180) on `Container` (it offers 760 and 1200 only, set inline) and a fluid region gutter token (`clamp(1.25rem, 5vw, 4rem)`), so header, tabs and pages share the portfolio's container (Adrian 2026-10-22)                                                                                                                                                        | to file                       |
| Disclosure row preview wrap                 | `.rjb-disclosure-wrap` in `src/theme/base.css` (`DiscoverView` SectionRow: ATS search, Apply now sections)                          | a `wrap` option on Disclosure `variant="row"`'s preview (today it always truncates to one line), for a description that must read in full on a phone                                                                                                                                                                                                                                | to file                       |
| Motion runtime at startup (#368)            | none possible app-side (see "Startup cost asks" below)                                                                              | `hirobius-ui.js` imports the full `motion/react` statically: 37.1 kB gzip of the first-paint JS                                                                                                                                                                                                                                                                                     | to file                       |
| `m` + LazyMotion in every component (#490)  | none possible app-side: the app stays on HDS 0.36 (#490 on hold, 2026-11-07)                                                        | 0.37 moves Motion to 14; only `Button` uses `m` + `LazyMotion(domAnimation)`. Alert, Toast, Tooltip, Disclosure, SegmentedControl, Checkbox, Radio, Toggle, Slider, Form, ControlLabel, InlineCode, ErrorPattern, AsyncState and scroll import the full `motion` proxy, so first-paint JS is 261.6 kB on 0.37 (253.7 on 0.36; motion-dom + framer-motion ≈ 42 kB gzip of the entry) | filed: hds#1386               |
| tailwind-merge + full CSS at startup (#369) | none possible app-side (see "Startup cost asks" below)                                                                              | runtime `twMerge` in `cn` (8.4 kB gzip) and one 22.6 kB gzip render-blocking `styles.css`                                                                                                                                                                                                                                                                                           | to file                       |

## Grouped list ask (Adrian 2026-11-04)

Phone review against iOS Notes / GitHub mobile: our panels read as collapsed blocks held together by
full-width hairlines. The baseline is the inset grouped list. Ask HDS for one component (working name
`List` / `List.Group` / `List.Item`):

1. **Group heading outside the surface.** `List.Group title count action` renders the heading (title
   ramp step, optional count Badge, optional trailing menu/action) above a raised, rounded surface;
   the rows live inside it. Heading is a real `h2` / `h3` (level prop).
2. **Row anatomy, fixed rhythm.** `List.Item` slots: `leading` (icon tile, Avatar/logo, 32-40px),
   `title` (one line, truncate or clamp 2), `description` (one line, secondary), `meta` (one line,
   caption tertiary: date · source), `trailing` (one quiet affordance: chevron, count, icon Button,
   Switch). Min height 56 (touch), padding from tokens; the whole row is the hit target when `href` /
   `onClick` is set (hover + pressed fill, focus ring inside the surface).
3. **Inset dividers.** The divider starts at the text column (after `leading`), never edge to edge,
   and is drawn by the list, not by the host.
4. **Rhythm tokens.** Gap between groups > gap between a heading and its surface > row padding (e.g.
   32 / 8 / 12 in compact). Exposed as tokens so hosts never set margins.
5. **One primary per row.** Docs guidance: secondary actions go in a trailing overflow menu or
   swipe, not a row of filled buttons. Optional `List.Item actions` renders them as tertiary.
6. **Variants:** `inset` (default, raised rounded surface) and `plain` (no surface, for page-level
   feeds), both with the same row anatomy. Empty group shows a `List.Empty` slot.
7. **A11y:** `ul`/`li` semantics, row link names = title, trailing count announced with the title.

Downstream: once shipped, `ItemList` / `ItemRow` and the `.rjb-items` rule are deleted, and Apply
mode, New companies, Review new, the Application kit, Documents and the Companies dialog move onto it.

## Startup cost asks (#368, #369; measured 2026-10-30 on HDS 0.32.0)

The app trimmed what it controls (branch `claude/perf-startup`: first-paint JS 260.0 → 235.9 kB
gzip). What is left at first paint is mostly HDS, and HDS is one module (`dist/hirobius-ui.js`,
236 kB raw), so the app cannot split it, load part of it later, or drop a dependency one
component needs: Rollup tree-shakes exports but never splits a module across chunks. Numbers
below come from `vite build` with the dependency swapped for a no-op stub (a local experiment,
never shipped), against the 235.9 kB baseline.

### A. Motion: 37.1 kB gzip of startup JS (#368)

- **Today:** `hirobius-ui.js` line 17, `import { motion, AnimatePresence } from "motion/react"`.
  `motion.*` is the full proxy (layout, drag, gestures, every feature bundle), so framer-motion +
  motion-dom + motion-utils (~250 kB pre-minify) ride in the first chunk for every page, though
  only Checkbox, Radio, Slider, Toggle, TokenField and one AnimatePresence user animate. This app
  renders none of them before first paint (Toggle: Search profile; Checkbox: Upload final copy;
  TokenField: Document editor), all in lazy chunks.
- **Ask (any one, in order of preference):**
  1. CSS transitions (HDS motion tokens) for those controls' checks, thumbs and chips: no JS
     runtime at all. Saves the full 37.1 kB.
  2. `LazyMotion` + `m.*` with `domAnimation` loaded by `features={() => import(...)}`, so the
     runtime arrives after first paint. Saves most of it (`m` + LazyMotion is ~5 kB).
  3. Per-component subpath exports (ask 1 below), so a host that never imports those controls
     never bundles motion.
- **Accept:** a Vite app that imports `Button`, `Text`, `Stack`, `Dialog` and `Tabs` from HDS has
  no `framer-motion` / `motion-dom` module in its entry chunk graph (check with Rollup's
  `chunk.modules`), and the controls' motion still runs under reduced-motion rules.

### B. tailwind-merge: 8.4 kB gzip of startup JS (#369)

- **Today:** `dist/cn.js` = `twMerge(clsx(...))`; every HDS component calls it, so
  tailwind-merge (~56 kB pre-minify, its full Tailwind class table) is in the first chunk.
- **Ask:** resolve variant/override conflicts at build time (cva's `compoundVariants`, ordered
  layers), keep `clsx` only at runtime, or switch to `extendTailwindMerge` with only the class
  groups HDS components emit. Export `cn` from `./cn` unchanged so hosts that pass `className`
  overrides still merge (the app's own `className` values are `rjb-*` classes, never Tailwind
  utilities, so plain concatenation would be correct here).
- **Accept:** no `tailwind-merge` module in a host's entry chunk graph; HDS's own component tests
  for `className` overrides still pass.

### C. `styles.css`: 22.6 kB gzip (150.5 kB raw), render-blocking (#369)

- **Today:** one stylesheet for every component; the app links all of it before first paint (it
  is 22.6 of the app's 25.3 kB initial CSS).
- **Ask:** per-component CSS shipped next to per-component JS (so a lazy chunk's components bring
  their own CSS), or a `core.css` (tokens, base, layout primitives, Button, Text, Card, Tabs,
  Dialog, Toast, Menu) plus the rest as an opt-in file.
- **Accept:** a host importing only the core set links ≤ 10 kB gzip of HDS CSS at first paint,
  and `css-contract.json` still lists every class a component needs.

**Together A + B:** 45.5 kB gzip off every cold load (235.9 → 190.4 kB), ~0.5 s at slow 4G
(~700 kbps), plus C's render-blocking CSS. When a release ships one, the upgrade PR re-measures
with `npm run build` (the `size budget ok` line) and lowers `BUDGET.initialJsGzip` /
`initialCssGzip` in `src/sizeBudget.ts` to lock it in.

## Retired

| Workaround                                                              | Retired in                                                                                                 | Upstream |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| `TokenTextarea` + chip-edit helpers in `templateEditor.ts`              | redesign slice 3 (HDS `TokenField`, 0.28)                                                                  | hds#826  |
| `TabsOverflowFade` (shell tabs, Discover, Find boards)                  | redesign slice 3 (TabsList and SegmentedControl fade and scroll, 0.28)                                     | hds#823  |
| `hds-gaps/tone.ts` `SECONDARY` (plain span or p)                        | redesign slice 4 (every use is now `Text tone="secondary"`)                                                | hds#655  |
| `barePanel.ts` (Discover sections)                                      | redesign slice 3 (`TabsContent variant="bare"`, 0.28)                                                      | hds#819  |
| `ActionToast` (Open, Undo)                                              | redesign slice 2 (HDS Toast `actions`, 0.28; `NoticeHost`)                                                 | hds#815  |
| `AsyncState` (Live postings)                                            | redesign slice 2 (HDS `AsyncState` pattern, 0.28)                                                          | hds#818  |
| `EmptyState.tsx` icon composition                                       | redesign slice 2 (HDS `EmptyState icon`, 0.28; every caller uses HDS)                                      | hds#825  |
| Menu height cap in `base.css`                                           | redesign slice 2 (Menu caps its height, 0.28)                                                              | hds#821  |
| `.rjb-resize` (Your evidence textarea)                                  | 0.32.0 audit (`Textarea resize`, default vertical)                                                         | none     |
| Dark pressed accent held at 3.0 (`theme.contrast.test.ts`)              | 0.32.0 audit (the pair meets 4.5 on the shipped tokens)                                                    | hds#748  |
| Tab strip 1px vertical overflow (`[role='tablist']` in `base.css`)      | 0.31.0 upgrade (TabsList has no bottom border, so triggers fit its 40px box)                               | to file  |
| Bordered chips and panels (`.rjb-chip`, `.rjb-blank`, `bordered` Cards) | 0.31.0 upgrade (soft surfaces: Tag and TokenField chips are a muted fill with no edge; Card is borderless) | hds#891  |
| Job page `TabsOverflowFade` + inline bare panel                         | redesign slice 2 (three tabs, `TabsContent variant="bare"`)                                                | hds#819  |
| `RailList` (selectable link list)                                       | 0.30.0 upgrade (`NavList`, 0.28; link mode, as rail rows are routes)                                       | hds#817  |
| `DANGER` menu item colour                                               | 0.30.0 upgrade (`Menu.Item tone="danger"`, 0.28)                                                           | hds#822  |
| `useBreakpoint` / `useAtLeast` hook                                     | 0.30.0 upgrade (HDS `useAtLeast`, 0.28)                                                                    | hds#824  |
| Shell `BARE_PANEL` style                                                | 0.30.0 upgrade (`TabsContent variant="bare"`, 0.28)                                                        | hds#819  |
| Account trigger (icon-only Menu button)                                 | 0.30.0 upgrade (`Avatar` icon fallback + status dot, 0.30)                                                 | rev-3 P  |
| Nested `'&'` breakpoint override in `sx`                                | 0.26.2 upgrade (`base` key)                                                                                | hds#652  |
| `EmptyState` action composed outside HDS                                | 0.26.2 upgrade (`action` prop, 0.25)                                                                       | hds#654  |
| `Text` + inline secondary colour                                        | 0.26.2 upgrade (`tone="secondary"`, 0.26)                                                                  | hds#655  |
| Active-tab underline patch in `base.css`                                | 0.26.2 upgrade (bug bash, 0.26)                                                                            | hds#749  |
| Wrapper fade on TabsList                                                | 0.26.2 upgrade (TabsList fades, 0.26.1)                                                                    | hds#723  |
| `<section>` around a `Stack` for `aria-*`                               | 0.26.2 upgrade (Stack forwards `aria-*`, 0.26.1)                                                           | 0.26.1   |
| Auto-fit `Grid` instead of MetricTiles                                  | Insights view removed; MetricTiles caps at 2 columns on a phone in 0.26.1                                  | 0.26.1   |
| `Sheet` / `SheetMenu`, `.app-sheet*`, `body { overflow-x: clip }`       | removed with the v1 redesign (#149)                                                                        | hds#690  |

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
