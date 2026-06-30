# Upstream brief — make @hirobius/design-system cleanly consumable (post-0.8.0)

For a Claude Code session **in the `@hirobius/design-system` repo**. Grounded in consuming
`0.8.0` from Apply Board (Vite + React 18 + TypeScript + MUI, strict `tsc`, `skipLibCheck`).

## What 0.8.0 already fixed (thank you — these landed and work)
- Built `.d.ts` (`exports["."].types → ./dist/types/...`) → consumer `tsc --noEmit` is clean.
- A vars-only `variables.css` ("no reset… cannot restyle host elements").
- Optional peers (`react-router`, `react-hook-form`, `zod`, `@hookform/resolvers`).
- `sideEffects: ["**/*.css"]`.

The package is now **consumable**. The items below are what's left to make it **clean** — none
are blockers, but each currently forces a workaround in the consumer.

## Gap 1 — No reset-free *component* CSS (highest impact)
Today it's all-or-nothing:
- `variables.css` = CSS variables only → **HDS components render unstyled** (verified: a real
  `<Button>` showed as a bare browser button).
- `tokens.css` = tokens **+ component/utility CSS + a global `@layer base` reset** (~229 kB).

So to get styled components you must ship a global reset you don't want. It happens to coexist
with MUI **only because MUI/emotion are unlayered and win over `@layer base`** — that's luck, not
contract, and it still ships a 229 kB stylesheet with a reset.

**Asks (any one unblocks):**
- Ship a **`styles.css` = tokens + components + utilities, NO preflight/base reset** (or make the
  reset its own opt-in `reset.css`).
- ✅ Accept: importing that file styles all components and changes **zero** host (non-HDS)
  element styles — `*`, `html`, `body`, headings, buttons unaffected.

## Gap 2 — No per-component entry points (JS + CSS tree-shaking)
Importing one `Button` pulls the single `dist/hirobius-ui.js` (~207 kB: `motion`, `lucide-react`,
all `@radix-ui/*`) and the whole `tokens.css`. There's no way to take just what you use.

**Asks:**
- Add **subpath exports per component**: `@hirobius/design-system/button`, `/card`, `/tag`, …
  (each with its own `types` + minimal CSS), so consumers tree-shake JS and styles.
- ✅ Accept: a consumer importing only `…/button` builds without `motion`/`lucide`/unused radix
  in the bundle, and without the full `tokens.css`.

## Gap 3 — Button has no semantic color (success / error / info)
`Button` exposes `variant: primary | secondary | tertiary` only. Real apps need destructive and
status actions (e.g. Delete = red, Copy/confirm = green, info = blue). There's no token-driven way
to express those today, so those surfaces can't migrate cleanly.

**Asks:**
- Add a **`tone` / `intent`** axis (`neutral | danger | success | info` …) to `Button` (and
  ideally `Tag`/`Badge`), driven by the existing semantic feedback tokens.
- ✅ Accept: `<Button tone="danger">Delete</Button>` renders an AA-contrast destructive button in
  light + dark.

## Verification to add upstream (so this doesn't regress)
A **smoke-consumer** in CI: `npm pack` → install the tarball into a tiny Vite+React+TS app and run
`tsc --noEmit`, `vite build`, importing from root **and** a subpath. Gate exports/types with
`@arethetypeswrong/cli` (`attw --pack`) and `publint`. Add a visual check that a component renders
**without** any global reset leaking to host elements.

## Out of scope
No component API/visual redesign — this is packaging/CSS-delivery/variants hygiene so the system
drops cleanly into another stack (MUI today, standalone tomorrow).
