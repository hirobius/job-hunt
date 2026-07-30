# CLAUDE.md — Apply Board

Project memory for future Claude Code sessions in this repo.

## What this is

**Apply Board** — a job-application tracker + discovery board, live at
**https://job-hunt-jade.vercel.app** (repo `hirobius/job-hunt`). Rebuilt from a
single static `index.html` into a React app (the old file is in git history at
commit `f15fd52`).

## Stack & conventions

- **Vite + React 18 + TypeScript + HDS (`@hirobius/design-system`). MUI is fully removed
  (issue #11 done).** Every component is **real HDS** (Buttons, Cards, Tag/Badge,
  SegmentedControl, IconButton/lucide, Input, Textarea, Tabs, Menu, Dialog, Tooltip, Alert,
  Spinner, Skeleton, Combobox). The gap HDS leaves — a generic `Box` and an `sx` escape hatch
  for one-off layout — is filled by a small, MUI/emotion-free primitive set in **`src/ui/`**,
  written to be routable upstream to HDS:
  - **`src/ui/box.tsx`** — a token-aware `sx` engine (spacing shorthands, HDS token color map,
    responsive `{xs,sm,md}` objects, nested `&` selectors → cached injected CSS classes) plus
    the `Box`/`Stack`/`Typography`/`Container`/`Link`/`Divider` primitives on top.
  - **`src/ui/Reveal.tsx`** — the MUI-free `<Collapse>` (CSS grid-rows 0fr↔1fr animation).
  - **The MUI-shaped adapters are retired (2026-07).** `ui/Button`, `ui/Dialog`, `ui/Tooltip`,
    `ui/Alert`, `ui/TextField` — thin shims that once let the MUI→HDS cutover proceed by
    import-swap — were **deleted** once MUI was gone; every call site now uses the real HDS
    component directly (Button `variant`/`tone`, HDS compound `Dialog`, `HdsTooltip`, `Alert tone`
    + a dismiss `IconButton`, `Input`/`Textarea`). **`src/ui` is now purely the layout gap:**
    `box.tsx` (Box/Stack/Typography/Container/Link/Divider + the `sx` engine) and `Reveal`.
  - **These layout primitives are the ONLY remaining non-HDS UI** — the last candidates to route
    upstream into HDS (see `docs/hds-upstream-asks-0.9.md` §"Layout primitives"). HDS 0.13 is its
    final frozen release and ships no `Box`/`sx`/layout equivalent, so until HDS grows one this
    layer stays local; it is deliberately kept small and dependency-free for exactly that handoff.
  - ⚠️ **No MUI `sx` on HDS components** — HDS takes semantic token props, not `sx`. Use the
    `src/ui` primitives (which DO take `sx`) for ad-hoc layout, HDS components for everything else.
- **Design language:** jade dark theme; headlines **Clash Display**, body **Satoshi**
  (loaded via Fontshare CDN in `index.html`). Uppercase is reserved for
  eyebrows/buttons/labels only.
- **Design system:** `@hirobius/design-system` (HDS) is consumed **directly from public
  npm** (`^0.13.0` — HDS's final, frozen release; no auth) — see `docs/adr/0005`. `main.tsx` imports
  `@hirobius/design-system/styles.css` (reset-free, scoped to `[data-hds]` — set on
  `<body>` in `index.html`), then `src/theme/brand-jade.css` (jade accent override), then
  `src/theme/base.css` (the border-box + body reset/chrome MUI's `CssBaseline` used to give,
  now that MUI is gone). Theming is pure HDS token CSS vars — **no MUI theme object**; `ColorMode`
  just flips `data-theme` on `<html>` (light/dark) and HDS's variables cascade. Status colors are
  HDS feedback tokens; status/destructive actions use HDS `Button tone` / `Badge tone`. AA contrast
  is enforced by `src/theme.contrast.test.ts` against the shipped `variables.css`.
  ⚠️ `vite.config.ts` manualChunks must match react EXACTLY — a loose
  `includes('react')` catches HDS's radix/lucide deps → circular-chunk startup crash.
- **State:** a shared external store via `useSyncExternalStore` in `src/store.ts`
  (no Redux). Jobs persist to `localStorage` key **`rjb_shortlist`** and sync to
  **Supabase** (table `tracker`, one JSON blob per user; keys in `src/config.ts`,
  publishable + RLS-protected). Cloud sync UI in `src/CloudSync.tsx`. Per-account curated
  content (the Discover/Apprenticeships board) lives separately in normalized RLS tables
  `categories`/`groups`/`tiles` — the curation data layer, `src/curation/`.
- **Structure:** `src/App.tsx` — tabbed shell with four tabs: **Trades** (tab label; slug
  is still `apprenticeships` for URL back-compat) → `ApprenticeshipsView.tsx` +
  `apprenticeships.ts`, the curated Spokane board. **Trades pivot (2026-07):** hands-on
  metal leads — the live order is set by `VISIBLE_GROUP_ORDER` (apply-first → welding/fab
  shops → foundry/casting → union JATCs → programs → live searches → veteran → finders);
  groups flagged `archived: true` on the `Group` type (healthcare, remote programs, AI/expert,
  SaaS) stash under a collapsed "Archived tracks" disclosure at the bottom (board-wide search
  still spans them). Then **Queue** (`TrackerView.tsx`), **Copy Deck** (`CopyDeckView.tsx`,
  incl. seeded call sheet + cold-call script; pillar-scoping removed — flat pinned-first list),
  **Discover** (`DiscoverView.tsx` + `jobsData.ts` groups and Title/ATS generators; the generators
  take a **user-set location + work-mode** (#58, no baked-in Spokane), and the trade/pillar switcher
  lives at the top of this view, not the header). `types.ts` for the Job model. Board rule: **NO
  static one-off job postings** —
  live searches or durable portals/company pages only, so tiles never go stale.
- **Pillars = trades** (`pillars.ts`): built-ins are **Sheet Metal & Fab** (default),
  **Welding & Machining**, **Construction Trades** — each drives Discover's title/ATS search
  terms + a curated "Apply Now" featured group. The old IT Support / Design Engineering
  pillars are gone. `PillarsDialog` (relabeled "Trades") still lets users add custom pillars.
  Header cleanup: the global pillar combobox + separate manage/feedback icon buttons were
  replaced by a single overflow menu (theme toggle stays inline); the tab bar is sized for
  readability and horizontal-scrolls on narrow screens.
- **Quick-add URL params** (handled in `App.tsx`): `?add=<url>`, `?applied=<url>`,
  `?status=<Status>&u=<url>`, optional `&t=<label>` — power the iOS shortcut /
  bookmarklet / Gmail-scan one-tap links.
- **Tracker model:** default "Active" filter = not-yet-applied (Saved) + pinned;
  applying drops a job out of the active queue. Follow-up loop: "Follow up in Nd" →
  "Follow up now" → "Log follow-up" resets the clock. Weak titles auto-derive from
  the URL. Board triage (pin / set-aside) lives in `tileTriage.ts` + `tileState.ts`;
  planned consolidation: saving also floats the tile (issue #13).

## Build / deploy / verify

- `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`.
- `vercel.json` builds this as Vite. **`main` is the live production site** — always
  `npm run build` (and ideally `tsc --noEmit`) before pushing to `main`.
- Branch pushes get Vercel **preview deploys** (use a branch for risky work; the
  live app stays on `main`).
- The build/typecheck/test gate does **not** catch visual or runtime-CSS issues. Verify
  renders with headless Chromium (`/opt/pw-browsers/...` + vite preview, screenshots at
  desktop + 390px, and CLICK things — decorative slots can swallow interactions), and
  confirm the Vercel deploy reaches `READY` before claiming it's live.
- Backlog lives in **GitHub Issues** (see Fleet hub below), not local TODO files.
  Upstream HDS gaps + accept criteria: `docs/hds-upstream-asks-0.9.md`.

## Skills — the architecture skill set

Vendored from github.com/mattpocock/skills into `.claude/skills/` (the container is ephemeral;
committed files are what survive). When asked for **"the architecture skill"**, an **"architecture
review"**, or to **improve/design the architecture**, invoke the **whole set as one workflow** —
not just the entry skill:

- **`/improve-codebase-architecture`** — the entry point. Scans for shallow modules / deepening
  opportunities, writes a visual HTML report to the OS temp dir (never the repo), then drives the
  grilling loop on the chosen candidate.
- **`/codebase-design`** — the shared architecture vocabulary (**module, interface, depth, seam,
  adapter, leverage, locality**) + principles (deletion test; "the interface is the test surface";
  "one adapter = hypothetical seam, two = real"; depth-as-leverage). Use these terms exactly.
  Companions: `DEEPENING.md`, `DESIGN-IT-TWICE.md` (parallel design-it-twice sub-agents).
- **`/grilling`** — interview the user one question at a time to stress-test the chosen design.
- **`/domain-modeling`** — keep `CONTEXT.md` (glossary only, no impl) + `docs/adr/` current as
  decisions crystallize. Companions: `CONTEXT-FORMAT.md`, `ADR-FORMAT.md`. Offer an ADR only when
  it's hard to reverse + surprising + a real trade-off.

Use `CONTEXT.md` for domain vocabulary and `/codebase-design` for architecture vocabulary; don't
re-litigate decisions already in `docs/adr/`.

## Notes

- Supabase redirect URLs must include any new origin for magic-link sign-in
  (production `job-hunt-jade.vercel.app` is already allowed).
- Keep personal contact info OUT of this public repo (letters/snippets ship with a
  "add your name + contact" placeholder).
- **AI is fully removed (2026-07).** The résumé-tailor went first (`TailorDialog`/`tailor-core.ts`/
  `api/tailor.ts`); then **"Add with AI" too (#54)** — `src/ai/` and `api/extract.ts` are gone,
  `@anthropic-ai/sdk` is dropped, and there is no Anthropic key / server AI endpoint anymore. The
  JD screener (#61) is **rules-based, client-side** — no AI. `docs/adr/0002` + `README`/`FEATURES`
  still describe the old AI design as historical context.

## 2026-07 — agnostic-product pivot + screening pipeline

The app is pivoting from a personal Spokane-trades board to an **agnostic, pillar-driven job-hunt
product** (design: `docs/agnostic-product-redesign.md`, decision: `docs/adr/0006`). Execution is
tracked under epic #30; the self-driving build backlog lives in `docs/loop-queue.md`. Shipped so
far this cycle:

- **Search is location-agnostic (#58).** `BOARDS` in `jobsData.ts` no longer hard-code Spokane —
  `build(term, { where, mode })` takes a user-set location + work-mode (Any/Remote/Hybrid/On-site).
  There is **no remote default** (remote roles draw ~5× the applicants); a shared `LocationControl`
  in `DiscoverView` drives both the Title and ATS panels.
- **Screening pipeline on jobs (#60).** Additive `Job` fields — `verdict` (match/stretch/reach),
  `mode`, `travelPct`, `applicants`, `blockers[]`, `angle`, `screenedAt` — normalized on read in
  `src/screening.ts`. Edited via `ScreeningEditor`; shown as card badges; new "Best fit" sort; a
  collapsible **Funnel** summary (`FunnelSummary` + `funnel.ts`).
- **Rules-based JD screener (#61).** `src/jdScreener.ts` + `ScreenJdDialog` — paste a JD → suggested
  mode/blockers/verdict from deterministic keyword rules, one-click apply.
- **Board↔Queue interop (#57).** Saved tiles leave the board (`partitionTiles`); enriched save
  carries a tile's meta into the job; a save toast; "Find more like this" seeds Discover.
- **Implementation Consulting** built-in pillar; simplified Trades board nav; top-level
  **error boundary** (#46).
- **Supabase provisioned (#31).** `tracker` + `categories`/`groups`/`tiles` tables now exist with
  RLS (the DB had been empty — cloud sync never had a backing table until now).
- **Open:** the #30 curation-store migration + IA consolidation (tabs → **Discover / Tracker /
  Templates**, #36) and onboarding are still ahead. ⚠️ GitHub Actions CI is non-functional
  org-wide (no runner assigned); merges currently rely on local verify + Vercel.

## Fleet hub

This repo is part of the Hirobius fleet. The operations hub is the
hirobius/ops repo: fleet state at /api/projects, consolidated tasks at
/ops/tasks (this repo's GitHub Issues sync there), current cross-project
state in docs/ai/HANDOFF.md (in ops). Conventions for every session here:
(a) track new work as GitHub Issues in THIS repo — never a local TODO
file; (b) before ending any session that changed project state, update
root status.json (updatedAt, phase, headline, next, blocked) — the ops
dashboard renders it; (c) read the ops HANDOFF before cross-project
decisions.
