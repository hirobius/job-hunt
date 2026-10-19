# @hirobius/design-system — downstream consumption story (send-back)

> **Historical.** A 2026-10 brief to the HDS repo, closed by HDS 0.9.0.

**For the HDS repo/thread.** Grounded in consuming HDS from **Apply Board** (Vite + React 18 +
TypeScript + MUI v6/Emotion; strict `tsc`, `skipLibCheck: true`; deployed on Vercel). Baseline
consumed: **`0.8.0`**.

**What changed since the last brief:** HDS is going **public on npm**. That removes the private
GitHub Packages registry + `NODE_AUTH_TOKEN` constraint that forced Apply Board to consume HDS as
**committed token artifacts** (generate at dev time, commit the output, so the deploy never needs
the registry). With a public package, a downstream app can just `npm i @hirobius/design-system`
and consume it directly at build time. **That makes the packaging/CSS-delivery gaps below the
whole ballgame** — they're now the last mile between "installable" and "drops in cleanly."

None of the items below are blockers; each is a workaround we currently carry. Each has an explicit
**✅ Accept** so the gap can be closed and checked off.

---

## What 0.8.0 already fixed (thank you — verified working)

- Built `.d.ts` (`exports["."].types`) → consumer `tsc --noEmit` is clean.
- A **vars-only** `variables.css` (CSS variables, no reset).
- Optional peers (`react-router`, `react-hook-form`, `zod`, `@hookform/resolvers`).
- `sideEffects: ["**/*.css"]`.

The package is **consumable** today. The rest is making it **clean**.

---

## Gap 1 — No reset-free *component* CSS  *(highest impact)*

CSS delivery is all-or-nothing:

- `variables.css` = variables only → **HDS components render unstyled** (verified: a real
  `<Button>` showed as a bare browser button).
- `tokens.css` = tokens **+ component/utility CSS + a global `@layer base` reset** (~229 kB).

So to get styled components you must also ship a global reset you don't want. In our app it happens
to coexist with MUI **only because MUI/Emotion are unlayered and win over `@layer base`** — that's
luck, not a contract, and it still ships a reset that restyles host (non-HDS) elements.

**Ask (either form unblocks):**
- Ship **`styles.css` = tokens + components + utilities, NO preflight/base reset**, or
- split the reset into its own **opt-in `reset.css`**.

**✅ Accept:** importing the styled-components CSS styles every HDS component and changes **zero**
host-element styles — `*`, `html`, `body`, headings, `button`, `a`, form controls are untouched.

---

## Gap 2 — No per-component entry points (JS + CSS tree-shaking)

Importing one `Button` pulls the single `dist/hirobius-ui.js` (~207 kB: `motion`, `lucide-react`,
all `@radix-ui/*`) plus the whole `tokens.css`. There's no way to take just what you use — a real
cost for an incremental adopter migrating one component at a time.

**Ask:** add **per-component subpath exports** — `@hirobius/design-system/button`, `/card`,
`/tag`, … — each with its own `types` and minimal CSS.

**✅ Accept:** a consumer importing only `…/button` builds **without** `motion` / `lucide-react` /
unused `@radix-ui/*` in the bundle, and without the full `tokens.css`.

---

## Gap 3 — `Button` has no semantic color (destructive / success / info)

`Button` exposes `variant: primary | secondary | tertiary` only. Real apps need destructive and
status actions — Delete = red, Copy/confirm = green, info = blue. There's no token-driven way to
express those, so those surfaces can't migrate off MUI cleanly (we keep MUI's `color` there).

**Ask:** add a **`tone` / `intent`** axis (`neutral | danger | success | info` …) to `Button`
(ideally `Tag`/`Badge` too), driven by the semantic feedback tokens (see Gap 4).

**✅ Accept:** `<Button tone="danger">Delete</Button>` renders an AA-contrast destructive button in
light **and** dark.

---

## Gap 4 — No semantic feedback tokens (success / warning / info / in-progress)

The generated token set carries **brand + neutrals only** (`primary`, `destructive`,
`background`, `card`, `foreground`, `muted-foreground`, `border`). `success` / `warning` / `info`
and a distinct "in-progress" hue are **absent**, so we define them locally in `theme.ts` and can't
delete the hardcodes. This is the token half of Gap 3.

**Ask:** add **`success`, `warning`, `info`** semantic tokens (light + dark), plus a distinct
**in-progress / secondary** hue — each AA-safe for **small text** on both `background` and `card`
surfaces.

**Drop-in starting point** — AA-verified values in production in Apply Board today (asserted by an
automated contrast test, ≥4.5:1 for small text on both surfaces):

| Intent | Dark | Light |
|---|---|---|
| success | `#34d39e` | `#047857` |
| warning | `#ffa726` | `#b45309` |
| info | `#49c7ff` | `#49c7ff` |
| in-progress / secondary | `#a78bfa` | `#6d28d9` |

**✅ Accept:** a consumer can theme status UI (Saved / Applied / Interviewing / Offer / Rejected)
from HDS tokens alone, with no locally-defined status hex, and pass AA in both modes. *(If HDS
`Badge`/`Tag` already cover the full status set at AA, this is a no-op — just publish the token
names so we can map to them.)*

---

## Nice-to-have — a `/mui` preset

Not required, but an `@hirobius/design-system/mui` entry that maps the tokens to an MUI
`ThemeOptions` palette would let MUI-based consumers (like us) theme from HDS without a local
Style-Dictionary step. Low priority relative to Gaps 1–4.

---

## Verification to add upstream (so this doesn't regress)

- **Smoke-consumer in CI:** `npm pack` → install the tarball into a tiny Vite + React + TS app →
  `tsc --noEmit` + `vite build`, importing from **root and a subpath**.
- Gate exports/types with **`@arethetypeswrong/cli`** (`attw --pack`) and **`publint`**.
- A visual check that a component renders **without** any global reset leaking to host elements.

---

## Out of scope (this is packaging/CSS-delivery/variants hygiene, not a redesign)

No component API or visual redesign. The goal is that HDS **drops cleanly into another stack**
(MUI today, standalone tomorrow): install → import a component or a subpath → get types + styles,
no global reset leak, optional tree-shaking. Also **not** upstream's concern: Apply Board's own
MUI→HDS migration, its committed-token generator, and its ADR decisions — those live downstream.
