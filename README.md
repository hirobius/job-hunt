# roleflame

A job-application tracker and discovery board for design-systems roles. Live at
https://roleflame.vercel.app

## Background

roleflame collects design-system openings from public job boards and feeds into one list, and
tracks every job you save through applying and following up. It has two tabs: **Find** (new
postings: Save, Skip or Not this company) and **Apply** (saved jobs, Follow up, Next 7 days;
search, Status and seven sorts). Documents holds your messages, letters and résumés.

Everything works signed out, in the browser. An optional magic-link sign-in syncs your data to
Supabase (one row per user, row-level security). The product name lives only in `src/brand.ts`.

Built with Vite, React 19, TypeScript and `@hirobius/design-system`, deployed on Vercel.

## Install

```bash
npm ci
```

The HDS ESLint plugin, `@hirobius/hds-toolkit`, comes from GitHub Packages, so installs need an
`HDS_PACKAGES_TOKEN` environment variable: a classic GitHub token with `read:packages`. The
design system itself installs from public npm. The Supabase URL and publishable key in
`src/config.ts` are public by design.

## Usage

```bash
npm run dev       # local dev server, http://localhost:5173
npm run verify    # typecheck, lint, HDS check, unit tests, build
npm run test:e2e  # Playwright browser tests
npm run test:visual  # screenshot baselines
```

`npm run verify` must pass locally before every push to `main`. `npm run test:visual` runs
only inside the pinned Playwright Docker image (`e2e/visual-env.json`); elsewhere the spec skips.
`npm run gallery` shoots every screen into `gallery/`.

## Docs

- [`CLAUDE.md`](CLAUDE.md): project memory and conventions.
- [`CONTEXT.md`](CONTEXT.md): domain glossary.
- [`FEATURES.md`](FEATURES.md), [`SECURITY.md`](SECURITY.md), [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).
- [`docs/guardrails.md`](docs/guardrails.md), [`docs/hds-upstream-asks-0.9.md`](docs/hds-upstream-asks-0.9.md).

Architecture decision records (`docs/adr/`):

- [`0001`](docs/adr/0001-consume-hds-via-tokens-on-mui.md): first HDS use, as tokens. Superseded by 0005.
- [`0002`](docs/adr/0002-ai-features-grounded-structured-output.md): the AI features. Removed in #54.
- [`0003`](docs/adr/0003-stay-on-vite-adopt-hds-incrementally.md): stay on Vite, adopt HDS step by step.
- [`0005`](docs/adr/0005-consume-hds-directly-from-public-npm.md): use HDS straight from public npm.
- [`0006`](docs/adr/0006-pivot-to-agnostic-pillar-driven-product.md): a track-driven product.
- [`0007`](docs/adr/0007-track-hds-latest-with-the-upgrade-tool.md): track HDS with its upgrade tool.
- [`0008`](docs/adr/0008-sync-user-edited-stores-in-blob-v5.md): user-edited stores sync in the blob.
- [`0009`](docs/adr/0009-one-search-profile-and-sources-replace-tracks.md): one Search profile and Sources list.
- [`0010`](docs/adr/0010-two-screens-find-and-apply.md): two screens, Find and Apply.

## Contributing

Track work as GitHub Issues in this repo. Pull requests must pass CI and an independent review
before merge. Agents do not edit GitHub workflow files. A `fix:` or `revert:` commit needs a
`Learned: <one line>` trailer (checked by a husky `commit-msg` hook).

## License

No license file is included and `package.json` declares none, so all rights are reserved by
default.
