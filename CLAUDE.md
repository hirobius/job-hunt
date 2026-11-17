# CLAUDE.md

Rules for agents that work in this repo. Keep this file under 150 lines: rules and pointers only.
Detail is in [`docs/agent/`](docs/agent/README.md), one subject per file. Read the file for the area
you change before you change it.

## What this is

**roleflame** is a job-application tracker and discovery board for design-systems roles, live at
https://roleflame.vercel.app (repo `hirobius/job-hunt`). Two screens: **Review** (new postings) and
**Apply** (saved jobs). Vite, React 19, TypeScript, HDS (`@hirobius/design-system`), Supabase, Vercel.

## Commands

- `npm run dev`, `npm run build`, `npm run typecheck`.
- `npm run verify`: typecheck, lint, HDS check, unit tests, build. Run it before each push.
- `npm run test:e2e`: Playwright. `npm run verify:ui`: layout rules and screenshot baselines.
- `npm run check:docs`: length caps for README.md, CONTRIBUTING.md and this file; required sections for README.md.
- Installs need `HDS_PACKAGES_TOKEN` (the HDS ESLint plugin is a private package).

## Rules

Each rule is one line. The linked file has the detail and the tests that pin it.

**UI ([hds](docs/agent/hds.md), [surfaces](docs/agent/surfaces.md), [brand](docs/agent/brand.md))**

- Use HDS components, tokens and `sx` only. No local UI primitive layer, no colour override, no inline font size or weight.
- HDS is pinned to an exact version from public npm. Upgrade with its upgrade tool.
- Compact density is the only density. No ALL CAPS. No italic text.
- One card level at most: no cards within cards. No outlines on surfaces. Selected is a fill, never an edge.
- One filled key per decision, a grey key for a real second choice. An exit is underlined text.
- The product name comes from `src/brand.ts` only. The flame comes from `src/brand/flame.svg` and `flameEngine.ts` only.
- Every local HDS workaround is listed in `docs/hds-upstream-asks-0.9.md`. Delete it in the upgrade that ships the fix.

**Behaviour ([shell](docs/agent/shell.md), [review](docs/agent/review.md), [apply](docs/agent/apply.md), [job view](docs/agent/job-view.md), [documents](docs/agent/documents.md))**

- Two top tabs, Review and Apply. Documents and Privacy and terms are dialogs in the page's URL.
- Change the URL only through `src/route.ts`. Every dialog, menu and popover is wired to Back (`useBackCloses`).
- Each page has one `h1`, inside `main`. Focus never drops to `body`.
- Every action answers within 300 ms. Every Remove is soft, with Undo. Undo never navigates.
- A way back always exists after a key action (return paths).
- A new user sees nothing they did not create. Placeholders are the field's own name.

**Data ([data](docs/agent/data.md), [feed](docs/agent/feed.md), [account](docs/agent/account.md))**

- Whatever the user edits is persistent and synced. Each store has `getAll*/replace*/merge*/use*`. Deletes stay deleted on all devices.
- Additive Job fields need no blob version bump. A new synced store does.
- Content is design systems only.
- Never import `@supabase/supabase-js` statically. Every dynamic import goes through `importFresh`.
- The entry chunk has a size budget (`entryChunk.test.ts`). Put new screens and dialogs in lazy chunks.
- A new fetch host goes in `vercel.json` `connect-src`, `src/csp.test.ts` and `legal.ts` `THIRD_PARTIES`, or it is blocked.
- Never fetch Workday, SuccessFactors, Taleo or Oracle career sites. An outside link becomes an `href` only when it is http(s).
- Nothing pulls or pushes for a user before the sign-in guard has run for that user.
- Keep personal contact data out of this public repo.

**Build and ship ([build](docs/agent/build.md))**

- Default to no cloud builds. Do not add `[preview]` to a commit unless Adrian asks.
- `main` is production. Merge only after green CI and an independent "Reviewed: PASS" on the head commit.
- Agents never edit `.github/workflows`. Write the change for Adrian.
- Tests do not catch visual faults. Check the render in headless Chromium at 1440 and 390, and click things.
- Lint runs with `--max-warnings=0`. Only lower the inline-style ceiling, never raise it.
- A `fix:` or `revert:` commit needs a `Learned: <one line>` trailer.
- Track work as GitHub Issues in this repo, not in local TODO files.

**History** ([history](docs/agent/history.md)): notes on replaced screens and models. Do not treat them as rules.

## Figma agent rules

`docs/figma/FIGMA-RULES.md` is the visual subset of this file and `docs/agent/`, pasted into the Figma agent's prompt
(and mirrored on a Rules page in the HDS Figma file). When a visual rule changes (HDS version or
density, cards, outlines, type, the screens and their names), change that page in the same PR;
`src/figmaRules.test.ts` fails when the rules it pins leave this file or `docs/agent/`.

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

## PR previews: screenshots, not Vercel (Adrian 2026-10-24, all repos)

Vercel preview builds are OFF (production only). Every PR carries its own preview:

1. Run the production build locally (`pnpm build` / `npm run build`) and serve the built app (`pnpm preview` / `npm run preview`, or the repo's screenshot tooling).
2. Attach screenshots of the affected routes only: 390x844, light AND dark, plus a desktop shot if the route is used on desktop. At most ~6 images, inline in the PR body or a PR comment. Adrian reviews on his phone: no zips, nothing he has to build.
3. Backend/infra PRs with no visual change: write "no visual change" instead.
4. Never re-enable Vercel preview builds (or add `[preview]`) to get screenshots.
