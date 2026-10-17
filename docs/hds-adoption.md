# HDS adoption map

> **Historical.** Written when the app ran on MUI. The app now uses HDS directly; see ADR 0005.

**Status:** planning doc — _no implementation_. Apply Board renders on **MUI v6** today and
consumes `@hirobius/design-system` (HDS) **only as design tokens** (see
[ADR 0001](./adr/0001-consume-hds-via-tokens-on-mui.md)). This document maps the MUI
components in use to their eventual HDS replacements so a later migration has a known target.

HDS (`@hirobius/design-system`, **v0.6.0**) is a **Tailwind + Radix** component library.
Migrating means swapping component imports _and_ moving from MUI's `sx`/emotion styling to
Tailwind classes — a separate, larger effort that is explicitly out of scope here.

## Component map (MUI → HDS)

| MUI (in use) | HDS target | Notes / gaps to watch |
|---|---|---|
| `Button` | `Button` | Map MUI `variant` (text/outlined/contained) → HDS variant (ghost/outline/solid) and `color` → intent. MUI `startIcon`/`endIcon` → HDS icon slots. `component={Link}` pattern (button-as-link) must map to HDS `asChild`/anchor support. |
| `IconButton` | `IconButton` | Ensure `aria-label` carries over (we rely on it everywhere). Confirm size scale parity. |
| `Card` / `CardContent` | `Card` | MUI `variant="outlined"` → HDS bordered card. Padding tokens differ — re-check the tile/snippet density. |
| `Chip` | `Tag` / `Badge` | Status chips use semantic colors (see below). HDS `Tag` (interactive/removable) vs `Badge` (static) — our clickable pillar chips and removable cases need `Tag`; status pills are `Badge`. |
| `Tabs` / `Tab` | `Tabs` | Radix Tabs is built on the tab/tabpanel/`aria-controls` model we just wired by hand — adoption should _simplify_ this. Keyboard behavior comes for free. Verify scrollable/overflow behavior (we use `variant="scrollable"`). |
| `ToggleButtonGroup` / `ToggleButton` | `SegmentedControl` | Our filter pills and the remote/Spokane/recency switches are single-select segmented controls. Confirm the group exposes an accessible name (we set `aria-label`). |
| `TextField` | `Input` / `Field` | MUI bundles label+input+helper; HDS `Field` likely composes `Label`+`Input`. Multiline (`Notes`, snippet body) → HDS `Textarea`. `size="small"` density mapping. |
| `Select` / `MenuItem` | `Select` | The pillar switcher. Radix Select differs in portal/scroll behavior; re-test in the header. |
| `Menu` / `MenuItem` | `DropdownMenu` | The per-job actions menu and the new Sort menu. Map `anchorEl` → Radix trigger/`asChild`. `selected` item state for the Sort menu. |
| `Dialog` | `Dialog` | AI intake / tailor / pillars dialogs. Radix focus-trap + portal; confirm our lazy-mount pattern still applies. |
| `Collapse` | `Disclosure` / `Collapsible` | Job details, snippet body, set-aside section. Animation parity to check. |
| `Typography` | `Text` / `Heading` | Map the `h1/h2/h3/subtitle1/body1/body2/caption` scale to HDS text styles. Clash Display / Satoshi families must be wired into the HDS Tailwind config. |
| `Skeleton` | (HDS `Skeleton`) | Our `Skeletons.tsx` is composed from `Skeleton` primitives — replace the primitive, keep the view-shaped compositions. |
| `Link` | `Link` | External links keep `target="_blank" rel="noopener noreferrer"`. |
| `Tooltip` | `Tooltip` | Radix Tooltip; verify touch behavior on mobile. |
| `Box` / `Stack` / `Container` | layout primitives / Tailwind | No HDS component needed — these become `div`s with Tailwind fl/grid utilities. |
| `Fade` | CSS transition / HDS motion | The "Saved ✓" flash — re-implement with a utility or HDS motion token. |

> Note: `TileGrid` and `EmptyState` are **app compositions**, not candidates to swap 1:1 — HDS
> already provides equivalents, so on migration they'd be rebuilt _from_ HDS primitives (Card,
> Text, Button) rather than ported.

## To contribute back to HDS

The one genuine gap is **semantic feedback colors**. App Board defines status hues locally in
`src/theme.ts` because the generated HDS token set only carries brand + neutrals
(`primary`, `error`, background/text/divider) — `success` / `warning` / `info` and the
Interviewing **`secondary`** violet are app-defined and mode-aware so the **outlined** status
chips clear WCAG AA (≥4.5:1) on both surfaces (asserted in `src/theme.contrast.test.ts`).

If HDS's `Badge`/`Tag` variants do **not** already cover the full status set
(Saved / Applied / Interviewing / Offer / Rejected), contribute:

- **`success`, `warning`, `info`** semantic tokens — light + dark, AA-safe for small text on
  both `background.default` and `background.paper`.
- a **`secondary`/violet** (or a dedicated "in-progress" intent) for the Interviewing state,
  with the same AA guarantee.

Concrete AA-verified values currently in the app (drop-in starting point):

| Intent | Dark | Light |
|---|---|---|
| success | `#34d39e` | `#047857` |
| warning | `#ffa726` | `#b45309` |
| info | `#49c7ff` | `#49c7ff` |
| secondary (Interviewing) | `#a78bfa` | `#6d28d9` |

If those variants **already exist** in HDS and pass AA, no contribution is needed — just map the
status → variant names during migration.

_Out of scope to contribute: `TileGrid`, `EmptyState` (HDS already has equivalents)._
