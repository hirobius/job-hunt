# CLAUDE.md — Apply Board

Project memory for future Claude Code sessions in this repo.

## What this is

**Apply Board** — a job-application tracker + discovery board, live at
**https://job-hunt-jade.vercel.app** (repo `hirobius/job-hunt`). Rebuilt from a
single static `index.html` into a React app (the old file is in git history at
commit `f15fd52`).

## Stack & conventions

- **Vite + React 18 + TypeScript + MUI v6.**
- **Design language:** jade dark theme; headlines **Clash Display**, body **Satoshi**
  (loaded via Fontshare CDN in `index.html`). Uppercase is reserved for
  eyebrows/buttons/labels only.
- **Design tokens:** the MUI palette in `src/theme.ts` is **generated from
  `@hirobius/design-system` tokens** (dark scheme) with a single jade brand seed.
  `npm run tokens:build` (`scripts/build-hds-tokens.mjs`) emits `src/tokens/hds-tokens.css`
  (framework-neutral CSS vars, light+dark) and `src/theme/hds-palette.generated.ts`;
  brand override in `src/theme/brand-jade.css`. Rationale + tradeoffs in
  `docs/adr/0001-consume-hds-via-tokens-on-mui.md`. Regen needs `NODE_AUTH_TOKEN`
  (read:packages); the deployed build does **not** (generated files are committed).
- **State:** a shared external store via `useSyncExternalStore` in `src/store.ts`
  (no Redux). Jobs persist to `localStorage` key **`rjb_shortlist`** and sync to
  **Supabase** (table `tracker`, one JSON blob per user; keys in `src/config.ts`,
  publishable + RLS-protected). Cloud sync UI in `src/CloudSync.tsx`.
- **Structure:** `src/App.tsx` (tabbed shell: Queue / Copy Deck / Discover),
  `TrackerView.tsx`, `CopyDeckView.tsx`, `DiscoverView.tsx`, `jobsData.ts`
  (curated discover groups + Title/ATS generators), `types.ts`.
- **Quick-add URL params** (handled in `App.tsx`): `?add=<url>`, `?applied=<url>`,
  `?status=<Status>&u=<url>`, optional `&t=<label>` — power the iOS shortcut /
  bookmarklet / Gmail-scan one-tap links.
- **Tracker model:** default "Active" filter = not-yet-applied (Saved) + pinned;
  applying drops a job out of the active queue. Follow-up loop: "Follow up in Nd" →
  "Follow up now" → "Log follow-up" resets the clock. Weak titles auto-derive from
  the URL.

## Build / deploy / verify

- `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`.
- `vercel.json` builds this as Vite. **`main` is the live production site** — always
  `npm run build` (and ideally `tsc --noEmit`) before pushing to `main`.
- Branch pushes get Vercel **preview deploys** (use a branch for risky work; the
  live app stays on `main`).
- I can't render visually here, so the **Vercel preview/READY state is the visual
  check** — confirm a deploy reaches `READY` before claiming it's live.

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
