# HDS and design language

How the app uses `@hirobius/design-system` (HDS): components, `sx`, density, theme, lint and polish rules.

- **Vite + React 19 + TypeScript + HDS (`@hirobius/design-system`) — and nothing else for UI
  (epic #89, 2026-10).** Every element is real HDS: layout (`Box` with HDS's token-only `sx`,
  `Stack`, `Switcher`, `Grid`, `Container`), type (`Text` on the HDS ramp: display / title / body
  / ui / caption / mono), and components (Button incl. icon-only `Button iconOnly` + `Icon`, Card,
  Tag/Badge, SegmentedControl, Input, Textarea, Tabs, Menu, Dialog, `Tooltip` (imported as
  `HdsTooltip`), Alert, Spinner, Skeleton, Combobox, `Disclosure`, `EmptyState`, `InlineLink`).
  The old local `src/ui` layer (a MUI-style `sx` engine + Box/Stack/Typography/Reveal) is
  **deleted**, and `src/hdsOnly.test.ts` fails if a local UI primitive layer or an import of one
  comes back.
  - **HDS `sx` dialect** (`Box sx`): spacing numbers are **4px** units — prefer the t-shirt keys
    (`'xs'` 8 · `'sm'` 16 · `'md'` 24 · `'lg'` 32 · `'xl'` 48); colours are token keys
    (`content.secondary`, `surface.raised`, `border.default`, `feedback.error`, `accent`);
    `border` needs a style (`'1px solid'`). Prefer named primitives (Stack/Switcher/Grid) over
    `Box sx`, and parent gaps over child margins.
  - **Responsive `sx` takes a `base` key (HDS 0.26.2, hds#652):** `{ flexDirection: { base:
'column', sm: 'row' } }`; `xs` means min-width 375, so never use it as the base. For a row of
    peer fields prefer `Switcher`. The old nested `'&'` override is gone (`hdsOnly.test.ts`).
  - **Secondary text** is `<Text variant="caption" tone="secondary">` (HDS 0.26, hds#655);
    `hds-gaps/tone` is gone (slice 4): use `Text tone`, never an inline colour. Bold is
    `Text weight="bold"` (HDS 0.28).
  - **Empty states** import `src/hds-gaps/EmptyState` (HDS `EmptyState`, upright since HDS 0.43, so the
    old `not-italic` patch is gone; `centered` / `framed` draw rev-3's centred teaching empty with an
    icon tile). `e2e/layout-rules.spec.ts` fails on any italic text.
  - **HDS gap registry (#146):** every local workaround (`src/hds-gaps/`, the
    `base.css` patches) is listed with its upstream ask in `docs/hds-upstream-asks-0.9.md`. Delete
    a workaround in the HDS upgrade PR that ships its fix, and update the table.

- **Design language (pure HDS, Adrian 2026-10-12; graphite 2026-10-15):** HDS typography
  (`fonts.css`, Sora since HDS 0.41.0 (regular 400, semibold 600, bold 700), the HDS type ramp), surfaces and the default **graphite
  accent**. There is **no local colour override** — the jade `brand-jade.css` was removed, and
  `hdsOnly.test.ts` fails if a `src/theme/brand-*.css` or an accent-token remap comes back. No ALL CAPS anywhere (HDS never sets it; `hdsOnly.test.ts` checks).
- **Design system:** `@hirobius/design-system` (HDS) is consumed **directly from public
  npm** (exact-pinned `0.46.0`; `hdsOnly.test.ts` enforces the exact pin) — see `docs/adr/0005` and `docs/adr/0007`.
  The HDS ESLint plugin comes from the private `@hirobius/hds-toolkit` (GitHub Packages, hirobius/ops#691):
  `package.json` pins it by its full tarball URL and `.npmrc` keeps only the auth line (no `@hirobius` scope
  mapping, job-hunt#567), so installs need `HDS_PACKAGES_TOKEN` (classic, `read:packages`) and design-system
  always resolves from registry.npmjs.org. `src/hirobiusHosts.test.ts` checks each `@hirobius` lockfile host.
  **Compact density is the app's only density** (`data-density="compact"` on `<html>` in `index.html` and
  `theme-init.js`; HDS 0.30: space 4/8/12/16/24/32, body 15, caption 13, ui 14, title 24; no toggle). Upgrade with
  `npx @hirobius/design-system@latest upgrade` (codemods + a to-do list; `--check` to verify).
  `main.tsx` imports `@hirobius/design-system/styles.css` (reset-free, scoped to `[data-hds]` —
  set on `<body>` in `index.html`) and `fonts.css`, then
  `src/theme/base.css` (border-box + body chrome from HDS tokens — what reset-free `styles.css`
  leaves to the host). Theming is pure HDS token CSS vars — **no MUI theme object**; `ColorMode`
  just flips `data-theme` on `<html>` (light/dark) and HDS's variables cascade. Status colors are
  HDS feedback tokens; status/destructive actions use HDS `Button tone` / `Badge tone`. AA contrast
  is enforced by `src/theme.contrast.test.ts` against the shipped `variables.css`.
  ⚠️ `vite.config.ts` manualChunks must match react EXACTLY — a loose
  `includes('react')` catches HDS's radix/lucide deps → circular-chunk startup crash.
  **Lazy loading (quick wins, 2026-10-22):** supabase-js is a dynamic import (`src/supabase.ts`
  `loadSupabase()`; boot loads it only with a stored session or a magic-link return, else on
  sign-in) and stays out of every manualChunks group (a named group pulls tslib in and vendor then
  imports it). Never import `@supabase/supabase-js` statically (`supabaseLazy.test.tsx`); tests
  that sign in call `loadSupabase()` first. The Pipeline, job page, Apply mode and Company page are
  `routeViews.ts` lazy views (`lazyView.tsx`); `test/setup.ts` preloads them. Follow up, Add interview, Recently removed and the job page's liveness note load on first use too (`lazyHosts.tsx`, `lazyDialogs.ts`, #368 pass); the stores read only `feed/sources/boardUrl.ts` / `feed/term.ts` / `boardSet` `BOARD_KINDS`, never ats.ts, match.ts or the probe (`entryChunk.test.ts`). What's left at startup is mostly HDS (motion, tailwind-merge, styles.css): upstream asks in `docs/hds-upstream-asks-0.9.md` "Startup cost asks". App wraps the bar in
  `header` and every page in one `main`; each route sets `document.title` (`pageTitle.ts`).

- **Flat, steady Disclosure rows + facts one per line (2026-11-12, #679):** `src/hds-gaps/DisclosureRow.tsx` (hds#1508) wraps HDS
  `Disclosure variant="row"` (Daily picks' Draft note): HDS 0.41 snaps its wrapper gap 0 → 8px and drops the preview line in the frame the
  body starts a height tween, so rows jumped; here the gap stays 0, the body pads itself and opens at once.
  BlankText's fill box is a hairline row, no longer a Card inside the panel's Card. One fact per line, the icon on the first text line,
  is HDS `Card.Facts` (stacked by default since HDS 0.43, hds#1509) in `DetailTitleBlock`, the posting cards and Daily
  picks; the local `FactLines` gap is deleted (HDS 0.44 PR). DisclosureRow stays in the HDS gap registry.

- **Design polish (#133, `docs/specs/design-polish.md`):** banners are not page
  furniture: unsynced is only the Account menu's sync line (no Avatar dot), and the sample's Clear is the Account menu's "Clear sample data" (2026-11-13). Section heads are
  `Text variant="body"` + `className="rjb-semibold"`; `title` is the page head only. `base.css` holds the
  host resets (heading/paragraph margin 0, `.rjb-semibold`, phone tab padding, 44px phone controls (`--rjb-touch`, retro quick wins 2026-11-08),
  reduced motion); secondary colour is `Text tone="secondary"`. Guards: inline `style={{`
  ceiling and no inline font size/weight in `hdsOnly.test.ts` (only lower the ceiling), lint is
  `--max-warnings=0`, composed contrast pairs in `theme.contrast.test.ts` (all at 4.5 since the 0.32.0 audit; tracked
  upstream: touch size hds#750), and `e2e/a11y.spec.ts` (axe on every route, light/dark, 1440/390; phone sweep for 44px
  targets, uppercase, running motion). `axe-core` is an exact-pinned devDependency (4.14.0).

- **Rules audit guards (2026-11-18):** `e2e/open-state-targets.spec.ts` probes 44px targets in the Account menu, its
  dialogs, the view picker, a job and its More menu at 390 (a link that is a row's whole value is HDS
  `InlineLink standalone`; below sm `base.css` sets its target to `--rjb-touch`). A posting description's `em` run is
  upright (`PostingDescription.css`, `postingDescription.test.tsx`). `hdsOnly.test.ts` lists each browser dialog
  (`confirm`, `alert`, `prompt`) at its exact count: only lower it.
