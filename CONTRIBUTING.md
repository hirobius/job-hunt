# Contributing

## Setup

```bash
npm ci
npm run dev
```

`npm ci` needs an `HDS_PACKAGES_TOKEN` environment variable: a classic GitHub token with
`read:packages`. It installs the private HDS ESLint plugin. The design system itself comes from
public npm. The Supabase URL and publishable key in `src/config.ts` are public by design.

## Check your change

```bash
npm run verify       # typecheck, lint, HDS check, unit tests, build
npm run test:e2e     # Playwright browser tests
npm run check:docs   # README.md and CLAUDE.md length caps and sections
```

`npm run verify` must pass before each push. The pre-push hook scans for secrets with gitleaks
8.25 or newer (CI uses 8.30.1); with an older one, the push stops and says how to install it. `npm run test:visual` runs only in the pinned
Playwright Docker image (`e2e/visual-env.json`). `npm run gallery` shoots every screen into
`gallery/`.

## Branches and pull requests

- Branch from `main`. Keep each pull request small and on one subject.
- Commit subject: `type: what changed`, in plain English. Types: `feat`, `fix`, `docs`,
  `refactor`, `test`, `chore`.
- A `fix:` or `revert:` commit needs a `Learned: <one line>` trailer (a commit hook checks it).
- Pull request body: what changed, why, how you checked it. For a visual change, add screenshots
  at 390x844 in light and dark, and a desktop one if the screen is used on desktop.
- A pull request merges after CI is green and an independent review passes.
- Do not edit `.github/workflows` in an agent session.

## Issues

Track work as GitHub Issues in this repo. Use the bug or task template. One issue is one piece of
work.

## Docs

- Rules for agents: [`CLAUDE.md`](CLAUDE.md), with detail in [`docs/agent/`](docs/agent/README.md).
- Decisions: [`docs/adr/`](docs/adr/). Domain words: [`CONTEXT.md`](CONTEXT.md).
