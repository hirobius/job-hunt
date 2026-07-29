# Autonomous build queue (Ralph loop) — Apply Board

The source of truth for the self-driving build loop. Each iteration: **read this file → pick the
first unchecked item in the Ready queue whose dependencies are met → build it to its acceptance
criteria → run the Definition of Done → commit + push → tick its boxes here.** One item per
iteration. Stop conditions below.

## Loop protocol (guardrails — apply to every iteration)

- **Branch:** work only on `claude/apply-board-consulting-roles-xpl2a9` (the pinned branch). Never
  push to `main`. _(If the PR strategy is changed to per-area PRs, this line gets updated.)_
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

## ⛔ Gates — clear these before the Blocked queue can run

These are **not** loop-able (human / decision). The loop must stop if it reaches one.

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

### R2 — Top-level error boundary _(#46)_
A render crash must not blank the app.
- [ ] `src/ErrorBoundary.tsx` (class component) catches render errors.
- [ ] Fallback UI: "Something broke" + **Reload** + **Reset local data** (confirm → clear `rjb_*`
      localStorage keys → reload).
- [ ] Wrap `<App/>` under the existing providers in `main.tsx`.
- [ ] Test: a throwing child renders the fallback.
- DoD: full gate + a screenshot of the fallback (via a scratch throwing component).

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

### R5 — Docs refresh: CLAUDE.md + README _(housekeeping)_
- [ ] CLAUDE.md: BOARDS are no longer Spokane-locked (location is a user field — #58); add the
      screening fields (#60), JD screener (#61), and Board↔Queue interop (#57); point at
      `docs/agnostic-product-redesign.md` + ADR-0006 for the product pivot.
- [ ] README: refresh stale stack/status lines.
- DoD: docs only; run 1–5.

### R6 — Complete data deletion across curation tables _(#42, forward-safe)_
- [ ] `CloudSync.tsx` `deleteMyData()` also deletes the user's `categories`/`groups`/`tiles` rows.
- [ ] **Forward-safe:** must not throw if the tables don't exist yet (per-table try/catch) — they
      arrive with G1.
- [ ] Update the confirm copy to say all data is removed.
- DoD: typecheck/lint/build; guard the logic with a unit test where practical (mock the client).

---

## 🔵 Blocked queue — runs after G1 (+ G2 for the IA items), in this order

Dependency chain from epic #30. Do **not** start until the gate(s) are cleared.

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
