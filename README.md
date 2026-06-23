# Apply Board

[![CI](https://github.com/hirobius/job-hunt/actions/workflows/ci.yml/badge.svg)](https://github.com/hirobius/job-hunt/actions/workflows/ci.yml)

A job-application tracker + discovery board. **Live → https://job-hunt-jade.vercel.app**

Paste a job link and it lands in your queue; mark it applied and it drops out of the active
list with a follow-up countdown. **Add with AI** turns a link (or pasted text) into a
structured, editable entry with match/gap chips, and **Tailor résumé** rewrites your résumé to
a role — grounded strictly in what you actually wrote. A discovery board, a copy deck for
outreach snippets, and cross-device cloud sync round it out.

## Notable (design-engineering)

- **Token-driven theming.** The MUI palette is _generated_ from the
  [`@hirobius/design-system`](https://github.com/hirobius/hirobius-design-system) DTCG tokens
  via **Style Dictionary** — one source of truth, a single jade brand _seed_, **light + dark**.
  No hardcoded brand colors. (`docs/adr/0001`)
- **Applied AI, done carefully.** Two Claude-backed features run on serverless functions (the
  SDK never enters the client bundle): _Add with AI_ extracts a job from a link via a **forced
  tool call** (structured JSON, not prose), and _Tailor résumé_ returns grounded **structure**
  that the app renders to clean Markdown — layout owned by code, facts owned by your résumé.
  No fabrication: requirements your résumé can't support are surfaced, not invented. SSRF-guarded
  link fetch; degrades gracefully with no API key.
- **Accessibility as a gate.** Component tests run **axe-core** WCAG A/AA assertions; controls
  and the theme toggle are keyboard- and screen-reader-friendly.
- **Tests + CI.** Vitest + Testing Library unit/component tests and a **Playwright** happy-path
  E2E, run on every push via GitHub Actions (lint · typecheck · test · build).
- **Lean bundle.** Vendor-split + lazy-loaded views (AI dialogs load on demand); no chunk over
  ~260 kB.

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

The two AI features call Claude from Vercel serverless functions (`api/extract.ts`,
`api/tailor.ts`). They need one secret — **`ANTHROPIC_API_KEY`** (Vercel → Project → Settings →
Environment Variables, Production + Preview; locally via `vercel dev`). Without it the app stays
fully usable and the AI entry points show a "not configured" notice. The functions run on the
**Node.js** runtime, not Edge — the Anthropic SDK pulls in `node:` built-ins the Edge bundler
rejects. Type-check them with `npm run typecheck:api`.

## A hard tradeoff

HDS is a Tailwind/Radix system; Apply Board is MUI. Rather than re-platform, we adopted HDS at
the **token layer** and kept MUI — getting HDS's design language and brand theming without a
rewrite, at the cost of not (yet) using HDS's actual components. Full rationale + the
alternatives we weighed: [`docs/adr/0001`](docs/adr/0001-consume-hds-via-tokens-on-mui.md).
