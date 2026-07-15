# Apply Board

[![CI](https://github.com/hirobius/job-hunt/actions/workflows/ci.yml/badge.svg)](https://github.com/hirobius/job-hunt/actions/workflows/ci.yml)

A job-application tracker + discovery board. **Live → https://job-hunt-jade.vercel.app**

Paste a job link and it lands in your queue; mark it applied and it drops out of the active
list with a follow-up countdown. Sort the queue (recently added, follow-up due, applied date,
status, salary, A–Z) and filter by status. **Add with AI** turns a link (or pasted text) into a
structured, editable entry with match/gap chips.

An **Apprenticeships** board (Spokane-eligible + remote, current by design — with pin / set-aside
triage and paste-your-own links), a pillar-aware **Discover** board, a **Copy Deck** for outreach
snippets, and cross-device cloud sync round it out. Switch **career pillars** to retarget Discover
and the Copy Deck. Every view is URL-addressable — shareable `#/queue` · `#/discover/titles`
deep links that survive refresh and back/forward.

## Notable (design-engineering)

- **Token-driven theming.** The MUI palette is _generated_ from the
  [`@hirobius/design-system`](https://github.com/hirobius/hirobius-design-system) DTCG tokens
  via **Style Dictionary** — one source of truth, a single jade brand _seed_, **light + dark**.
  No hardcoded brand colors. (`docs/adr/0001`)
- **Applied AI, done carefully.** A Claude-backed feature runs on a serverless function (the
  SDK never enters the client bundle): _Add with AI_ extracts a job from a link via a **forced
  tool call** (structured JSON, not prose). SSRF-guarded link fetch; degrades gracefully with
  no API key. (`docs/adr/0002`)
- **URL state without a router.** Top-level tab, Discover's sub-tab, and the active pillar all
  live in the hash via a tiny `useSyncExternalStore` route store — shareable, refresh-safe,
  back/forward-aware — no `react-router`.
- **Accessibility as a gate.** Component tests run **axe-core** WCAG A/AA assertions; tabs expose
  proper `tabpanel`/`aria-controls` wiring, the filter group is labeled, there's one shared
  focus-visible ring, and the theme toggle is keyboard- and screen-reader-friendly.
- **Tests + CI.** Vitest + Testing Library unit/component tests and a **Playwright** happy-path
  E2E, run on every push via GitHub Actions (lint · typecheck · test · build).
- **Lean bundle.** Vendor-split + lazy-loaded views (AI dialogs, Discover, Copy Deck load on
  demand) with layout-matched skeletons; no chunk over ~265 kB.

## Stack

Vite · React 18 · TypeScript · MUI v6 · Supabase (cloud sync) · Anthropic Claude (serverless
functions) · deployed on Vercel.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit/component (Vitest + axe-core)
npm run lint && npm run typecheck && npm run build
npx playwright install chromium   # once
npx playwright test               # e2e happy-path
```

Design tokens are committed (generated). To refresh them after an HDS update:

```bash
npm i --no-save @hirobius/design-system@latest   # needs NODE_AUTH_TOKEN (read:packages)
npm run tokens:build
```

The AI feature calls Claude from a Vercel serverless function (`api/extract.ts`). It needs one
secret — **`ANTHROPIC_API_KEY`** (Vercel → Project → Settings → Environment Variables, Production
+ Preview; locally via `vercel dev`). Without it the app stays fully usable and the AI entry point
shows a "not configured" notice. The function runs on the **Node.js** runtime, not Edge — the
Anthropic SDK pulls in `node:` built-ins the Edge bundler rejects. Type-check it with
`npm run typecheck:api`.

## A hard tradeoff

HDS is a Tailwind/Radix system; Apply Board is MUI. Rather than re-platform, we adopted HDS at
the **token layer** and kept MUI — getting HDS's design language and brand theming without a
rewrite, at the cost of not (yet) using HDS's actual components. Full rationale + the
alternatives we weighed: [`docs/adr/0001`](docs/adr/0001-consume-hds-via-tokens-on-mui.md).

We later assessed going further — Astro and/or real HDS components — and decided to **stay on
Vite, adopt HDS incrementally, and reserve Astro for static content only**; see
[`docs/adr/0003`](docs/adr/0003-stay-on-vite-adopt-hds-incrementally.md) and the MUI→HDS map in
[`docs/hds-adoption.md`](docs/hds-adoption.md).
