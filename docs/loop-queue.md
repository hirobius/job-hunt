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

### R1 — Applicant funnel view _(net-new; from #60 §"funnel")_
A compact read on pipeline shape so you can see what's winnable.
- [ ] `src/funnel.ts` (pure): aggregate a `Job[]` → `{ total, byVerdict, byMode, medianApplicants }`.
- [ ] Table-driven tests for the aggregation (empty, mixed, medians with/without applicant counts).
- [ ] A collapsible **Funnel** summary above the Queue list; hidden when there are 0 jobs.
- [ ] Shows: verdict counts (Match/Stretch/Reach as tone-colored stat tiles), mode counts, and
      median applicants. Simple stat tiles — no chart lib in v1. Reads live from the store.
- DoD: full gate + screenshots (desktop + 390px), with a couple of seeded jobs.

### R2 — Top-level error boundary _(#46)_ — ✅ DONE
- [x] `src/ErrorBoundary.tsx` (class component) catches render errors.
- [x] Fallback UI: "Something broke" + **Reload** + **Reset local data** (confirm → clear `rjb_*`
      keys → reload).
- [x] Wraps everything (outermost, inside StrictMode) in `main.tsx`.
- [x] Test: throwing child → fallback (text + both buttons); pass-through when no error.
- DoD met: typecheck + lint + 201 tests + build green; the fallback is unit-tested and the app
  renders normally under the boundary (headless, no console errors).

### R3 — Web metadata: favicon / OG / meta / robots _(#47)_
- [ ] `public/favicon.svg` (jade mark; self-contained, no external refs) + `public/robots.txt`.
- [ ] `index.html`: `<title>`, description, `og:*` (title/description/type/url), `theme-color`,
      favicon + apple-touch-icon links.
- [ ] Build copies `public/*` into `dist`.
- DoD: build; headless check that `<head>` has the favicon + og tags.

### R4 — Dependabot + npm-audit CI step _(#47)_
- [ ] `.github/dependabot.yml` — npm ecosystem, weekly, grouped minor/patch.
- [ ] Add `npm audit --audit-level=high` as a step in `.github/workflows/ci.yml` `verify` job.
- DoD: YAML parses (the loop can `node -e` a YAML parse or eyeball); 1–5 unaffected. (Actions run
      only on GitHub — don't block on it.)

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

## 🔵 Unblocked queue — G1/G2/G3 cleared; needs a per-item acceptance-criteria pass before looping

Dependency chain from epic #30. Gates are cleared, so these are eligible — but each still needs its
own acceptance-criteria + DoD written (like the Ready queue) **before** it loops, now that the real
curation-store schema exists. Tab names are locked to **Discover / Tracker / Templates**.

1. **#32** — Supabase-backed curation data layer (replace `pillarStore` localStorage projection;
   local cache + sync-on-login). _(needs G1)_
2. **#33** — one-time importer: seed current pillars + Trades board into the signed-in account.
3. **#34** — strip built-in personal content → neutral starter _(coordinate with #59)_.
4. **#35** — remove the case-study page + `caseStudies.ts`.
5. **#36** — merge Trades + Discover → one browse tab; rename tabs _(needs G2)_.
6. **#37** — in-app category curation controls (add/remove/edit).
7. **#59** — starter-pack catalog + white-collar-first defaults (fork-on-pick) _(extends #33/#34/#38)_.
8. **#38** — onboarding empty states + v1 layout cleanup.

Each Blocked item needs its own acceptance-criteria pass (like the Ready queue) **before** it loops
— that pass happens once G1/G2 are cleared and we can see the real curation-store shape.

---

## 🔴 Human-gated (never loop here)
`#31` (done at G1) · `#44` Supabase auth config (dashboard) · `#16` enable Vercel analytics
(dashboard) · `#43` privacy/terms (legal review) · `#40`/`#45`/`#54` (pending G3).
