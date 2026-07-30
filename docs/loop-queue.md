# Autonomous build queue (Ralph loop) — Apply Board

The source of truth for the self-driving build loop. Each iteration: **read this file → pick the
first unchecked item in the Ready queue whose dependencies are met → build it to its acceptance
criteria → run the Definition of Done → commit + push → tick its boxes here.** One item per
iteration. Stop conditions below.

## Loop protocol (guardrails — apply to every iteration)

- **Branch/PR:** **per-area PRs** (locked 2026-07). Each queue item (or small group) gets its own
  branch + PR off the agreed base, so review stays sane. Never push to `main` directly.
- **One item per iteration.** Smallest shippable slice. Don't batch unrelated items.
- **The verify gate is mandatory before ANY commit.** If it can't go green, **stop and flag** —
  never commit broken or unverified code.
- **Stop the loop when:** the Ready queue is empty · the next item is a Gate/Blocked item · two
  consecutive iterations fail their gate · anything needs a human decision not written here.
- **Don't guess decisions.** If an item's acceptance criteria are ambiguous, stop and ask.
- After each item: update `status.json` (updatedAt, headline, next) and tick this file's boxes.

### Definition of Done (the verify gate — every code item)

1. `npm run typecheck` clean
2. `npm run lint` clean
3. `npm run typecheck:api` clean
4. `npx vitest run` — all green; **new logic ships with table-driven tests**
5. `npm run build` succeeds
6. **UI changes:** headless Chromium (`/opt/pw-browsers/chromium` + `vite preview`) — screenshot at
   desktop **and** 390px, **click the new controls**, confirm no console errors (ignore the known
   Fontshare-CDN / Supabase proxy 404s)
7. Commit (descriptive body + the session footer) and push to the branch

Docs-only items skip 6; run 1–5 to be safe.

---

## ✅ Gates — ALL CLEARED (2026-07-27)

- **G1 — Supabase migration: DONE.** The DB was empty (paused; no `tracker` table — cloud sync had
  never worked). Restored the project and provisioned all four tables (`tracker` + `categories`/
  `groups`/`tiles`) with RLS. Security advisor clean (only the known #44 leaked-password toggle).
  Cloud sync now has its backing table for the first time.
- **G2 — Tab naming: LOCKED → `Discover / Tracker / Templates`** (per #36; NOT Board/Queue/Copy Deck).
- **G3 — AI direction: LOCKED → REMOVE Add-with-AI (#54).** `#40` and `#45` are now moot (dropped).
  #54 becomes Ready-queue item **R7**.

Historical detail for G1 kept below for reference.

### G1 — Apply the Supabase migration (human, ~2 min) → unblocks the entire #30 chain

Run this in the Supabase SQL editor (project `nelrcmbkimjjmfmgnixj`). Additive; `public.tracker`
untouched. Migration name: `curated_content_normalized_tables` (issue #31).

```sql
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  titles text[] not null default '{}',
  ats_roles text[] not null default '{}',
  seniority text, location text, tailor_role text,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  label text not null, sort_order int not null default 0,
  archived boolean not null default false
);
create table if not exists public.tiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null, url text not null, meta text,
  sort_order int not null default 0
);
alter table public.categories enable row level security;
alter table public.groups enable row level security;
alter table public.tiles enable row level security;
create policy "own categories" on public.categories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own groups" on public.groups for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tiles" on public.tiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### G2 — Lock the tab naming (decision)

`#36` says **Discover / Tracker / Templates**; this session used **Board / Queue / Copy Deck**.
Pick one. _(Recommendation: Board / Queue / Copy Deck — plainer, matches what the app already
shows.)_ Until locked, `#36` and everything after it stays blocked.

### G3 — Confirm the AI direction (decision)

`#54` proposes removing the "Add with AI" extract endpoint to zero out cost. This is entangled with
`#40` (auth+rate-limit the AI endpoint) and `#45` (SSRF hardening of `api/extract`). Decide:
**remove AI (do #54, and #40/#45 become moot)** or **keep + harden it (do #40/#45)**. The Ready
queue below assumes this is undecided and excludes those three.

---

## 🟢 Ready queue — loop these now (in order, no gates)

### R1 — Applicant funnel view _(net-new; from #60 §"funnel")_ — ✅ DONE
- [x] `src/funnel.ts` (pure): `Job[]` → `{ total, byVerdict, byMode, medianApplicants }`.
- [x] Table-driven tests (empty, mixed, odd/even median, ignores jobs without a count).
- [x] `src/FunnelSummary.tsx`: collapsible summary above the Queue list, hidden at 0 jobs, over
      the currently-shown list. Fit/mode tone-badges + median applicants. No chart lib.
- DoD met: typecheck + lint + 205 tests + build green; verified headless (MATCH 2 / STRETCH 1 /
  REACH 1, mode counts, median 200).

### R2 — Top-level error boundary _(#46)_ — ✅ DONE
- [x] `src/ErrorBoundary.tsx` (class component) catches render errors.
- [x] Fallback UI: "Something broke" + **Reload** + **Reset local data** (confirm → clear `rjb_*`
      keys → reload).
- [x] Wraps everything (outermost, inside StrictMode) in `main.tsx`.
- [x] Test: throwing child → fallback (text + both buttons); pass-through when no error.
- DoD met: typecheck + lint + 201 tests + build green; the fallback is unit-tested and the app
  renders normally under the boundary (headless, no console errors).

### R3 — Web metadata: favicon / OG / meta / robots _(#47)_ — ✅ DONE
- [x] `public/favicon.svg` (jade rounded-square + checkmark; self-contained) + `public/robots.txt`.
- [x] `index.html`: description, `og:*` (title/description/type/url), `theme-color`, favicon +
      apple-touch-icon.
- [x] Build copies `public/*` into `dist` (confirmed favicon.svg + robots.txt + head tags in dist).

### R4 — Dependabot + npm-audit CI step _(#47)_ — ✅ DONE
- [x] `.github/dependabot.yml` — npm + github-actions ecosystems, weekly, grouped minor/patch.
- [x] `npm audit --audit-level=high` step in the `verify` job (currently exits 0 locally).

### R5 — Docs refresh: CLAUDE.md + README _(housekeeping)_ — ✅ DONE
- [x] CLAUDE.md: Discover generators are location/mode-driven (not Spokane); AI fully removed (#54);
      new "2026-07 agnostic-product pivot + screening pipeline" section (#57/#58/#60/#61/#46/#31);
      points at `docs/agnostic-product-redesign.md` + ADR-0006.
- [x] README: fixed the false stack line (HDS not MUI; no Anthropic) + a note that the fuller
      refresh is tracked in #20.
- DoD met: typecheck + lint + build green (docs/markdown only).

### R6 — Complete data deletion across curation tables _(#42)_ — ALREADY DONE
`CloudSync.deleteMyData()` already deletes `tiles`/`groups`/`categories`/`tracker` by `user_id`
(CloudSync.tsx:163–166). Loop task reduces to: [ ] confirm the confirm-dialog copy says "all data"
and close #42. No code change expected.

### R7 — Remove "Add with AI" _(#54; G3 locked → remove)_ — ✅ DONE
- [x] Deleted the whole `src/ai/` (8 files) + `api/extract.ts`.
- [x] Removed the "Add with AI" button + lazy import + `aiOpen`/`aiMounted` state in `TrackerView`
      (dropped now-unused `React`/`lazy`/`Suspense`/`Sparkles` imports).
- [x] Dropped `@anthropic-ai/sdk` (lockfile updated); removed the `functions` block from
      `vercel.json`, the `typecheck:api` script from `package.json`, and its CI step.
- [x] Removed the two AI a11y test cases.
- [ ] README / CLAUDE.md doc sweep → folded into **R5**.
- DoD met: typecheck + lint + 199 tests + build green; verified headless (AI button gone, non-AI
  Add works, no console errors). Closes #54; #40/#45 → wontfix.

---

## 🔵 Blocked queue — #30 IA/curation chain (re-triaged 2026-07-27; Ralph-ready specs)

**Already done on `main`** (via merged PRs #50/#53) — do NOT rebuild:
- **#31 schema** ✅ (tables provisioned at G1) · **#32 curation data layer** ✅ — `src/curation/`
  is complete: `curationStore.ts` (CRUD + `useCategories/useGroups/useTiles`, local-first + Supabase),
  `map.ts` (row↔model, tested), `merge.ts`, `sync.ts` · **#33 importer** ✅ — `importStarter.ts` +
  a `?import=starter` trigger in `App.tsx` · **#35 case-study removal** ✅ — `caseStudies.ts` gone.

**The actual gap:** the curation store is **built but dormant.** `DiscoverView` still reads the
hardcoded `BUILTIN_PILLARS` from `pillarStore` (localStorage). A `Category` already *is* a pillar
(`{ label, titles[], atsRoles[], seniority, location }`) with `groups`→`tiles` as its curated
content. So the remaining work is **wire the UI onto the store, strip the hardcoded content, then
consolidate the IA + onboarding.** Order matters — B1 is the linchpin.

### ⚠️ Decisions Ralph must SURFACE, not guess (stop and ask)
- **D1 — Empty / signed-out state.** When the curation store is empty (new or signed-out user),
  what does Discover show? Options: (a) auto-seed the local cache from a default starter pack on
  first run; (b) force onboarding first; (c) empty state with a "pick a starter" CTA. _(Leaning (a)
  for signed-out + (c)/onboarding for signed-in — but confirm.)_
- **D2 — Fate of the Trades board's extras.** The curated board (`ApprenticeshipsView`) has
  pin/set-aside (`tileTriage`), paste-your-own-links (`userTiles`), and one board-wide search. When
  it folds into Discover (B3), which survive and at what scope (per-category vs global)?
- **D3 — Starter-pack catalog content (#59).** Which packs ship (Implementation Consulting default,
  Design Systems, Skilled Trades, …) and the fork-on-pick copy-into-store UX. Mostly grilled
  2026-07-27; confirm the pack list before building B5.

### B1 — Wire Discover onto the curation store (retire the hardcoded pillar read) — LINCHPIN
- [ ] `DiscoverView`/`TradeSwitcher` read **categories** from `curationStore` (`useCategories`)
      instead of `usePillars()`/`useActivePillar()` from `pillarStore`. A Category maps to the
      pillar shape the panels already expect (`titles`, `atsRoles`, `seniority`, `location`,
      `groups`→tiles).
- [ ] Active-category selection replaces active-pillar (persist the id; keep `?pillar=`/hash route).
- [ ] Resolve **D1** first (empty-store behavior) — do not ship a blank Discover.
- [ ] `pillarStore` + `pillars.ts` become unused by Discover; leave deletion to **B2**.
- DoD: full gate incl. headless — pick a category, Title/ATS/Apply-Now tabs render from store data;
      signed-out path works from the local cache.

### B2 — Strip hardcoded built-in content (#34)
- [ ] Delete/neutralize `BUILTIN_PILLARS` (`pillars.ts`), the `GROUPS` + Spokane search terms in
      `jobsData.ts`, and `apprenticeships.ts`; remove the `?import=starter` `StarterImportTrigger`
      once B5's onboarding supersedes it.
- [ ] Nothing personal ships in the repo; the content survives only as **starter packs** (B5).
- [ ] Update every import site + tests that referenced the deleted constants.
- DoD: full gate; app builds with no hardcoded pillar/board content; a fresh store still lands the
      user somewhere useful (via D1/B5).

### B3 — IA consolidation + tab rename (#36) — tab names LOCKED: Discover / Tracker / Templates
- [ ] Merge **Trades + Discover → one Discover** surface (fold `ApprenticeshipsView` in per D2);
      delete the separate Trades tab.
- [ ] Rename **Queue → Tracker**, **Copy Deck → Templates** (labels only; **keep URL slugs**
      `apprenticeships`/`queue`/`copy-deck` for back-compat, or add redirects).
- [ ] Update the tab bar, hash routes, and any deep links / `App.tsx` `TAB_SLUGS`.
- DoD: full gate + headless at desktop + 390px; every tab + sub-route resolves; old bookmarked
      slugs still work.

### B4 — In-app curation controls (#37)
- [ ] Category switcher + "＋ New category" at the top of Discover; extend the pillar editor
      (relabel "Categories") to add/remove/edit categories; inline add/remove for groups + tiles.
- [ ] All writes go through the existing `curationStore` API (`addCategory`/`addGroup`/`addTile`/
      `update*`/`remove*`).
- DoD: full gate + headless — create a category, add a group + tile, edit, delete; persists + syncs.

### B5 — Starter-pack catalog + first-run onboarding (#59 + #38)
- [ ] First-run: **set location** + **pick starter pack(s)** from a catalog (D3), or create a
      custom track. Fork-on-pick copies the pack into the user's curation rows.
- [ ] Teaching empty-states on each surface; fold in the #38 v1 layout cleanup (divider sweep).
- [ ] Consulting is the lead default pack; trades preserved as one optional pack.
- DoD: full gate + headless — brand-new store → onboarding → picked pack populates Discover; custom
      track gets the generated "floor".

**Suggested order:** B1 → B2 → B4 → B3 → B5. (B1 unblocks all; B2 after wiring; B4 needs the wired
UI; B3 is the visible IA change; B5 styles the final surfaces.) Each is its own per-area PR.

---

## 🔴 Human-gated (never loop here)
`#31` (done at G1) · `#44` Supabase auth config (dashboard) · `#16` enable Vercel analytics
(dashboard) · `#43` privacy/terms (legal review) · `#40`/`#45`/`#54` (pending G3).
