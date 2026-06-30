# Consuming the real @hirobius/design-system — setup

`@hirobius/*` is published to **GitHub Packages (private)**. The app installs it via the
committed `.npmrc`:

```
@hirobius:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

No secret is committed — the token is read from the `NODE_AUTH_TOKEN` env var. You must provide
it in three places.

## 1. Create the token
GitHub → Settings → Developer settings → **Personal access token** with **`read:packages`**
(classic PAT, or a fine-grained token with Packages: read for the `hirobius` org). Copy it.

## 2. GitHub Actions (CI)
Repo → Settings → Secrets and variables → Actions → **New repository secret**
- Name: `NODE_AUTH_TOKEN`
- Value: the token

`.github/workflows/ci.yml` already exposes it on the `npm ci` steps (both jobs), so CI installs
authenticate automatically. Safe when absent (public deps still install); required once an
`@hirobius` dependency is present.

## 3. Vercel (preview + production)
Vercel → Project (`job-hunt`) → Settings → Environment Variables → **Add**
- Key: `NODE_AUTH_TOKEN`
- Value: the token
- Environments: **Production + Preview + Development** (all)

Vercel reads the committed `.npmrc` during install; with the token present, preview/prod builds
of HDS branches succeed. Without it they fail at `npm install` **by design** (see `docs/adr/0001`,
which kept the deploy off the private registry — `adr/0004` revisits that tradeoff).

## 4. Local
Already works in this environment (`NODE_AUTH_TOKEN` is set). For a fresh machine: export the
token (`export NODE_AUTH_TOKEN=…`) before `npm install`.

## Verifying
- CI: push an HDS branch → the "Lint · Typecheck · Test · Build" + "E2E" jobs install cleanly.
- Vercel: the branch's preview reaches READY; open it to eyeball the migrated surfaces.
- The build/typecheck/test gate does **not** catch visual/runtime CSS issues — render the app
  (preview or local `vite preview`) and look at each migrated surface. (Two real bugs — unstyled
  components and a blank-screen chunk crash — passed the gate and were only caught by rendering.)

## Notes
- The token is a **secret** — only ever in CI/Vercel secret stores and your shell env, never in a
  committed file. The `.npmrc` references it indirectly and is safe to commit.
- HDS pulls `react-router@7` as an **optional** peer; the app keeps its own hash router
  (`src/route.ts`) and does not use it.
