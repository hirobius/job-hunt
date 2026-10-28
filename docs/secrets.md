# Secrets and env vars

This repo follows the Hirobius Secrets Management Standard (`hirobius/ops` →
`standards/secrets-management.md`; adoption tracked in #22). Names only here, never values.
Real values live in Bitwarden (**Hirobius — Internal** collection, field label = the var name)
and in the host that needs them. Agents never read or write `.env*` files.

## The app ships no secrets

The browser app is keyless. `src/config.ts` holds the Supabase URL and **publishable** key,
which are public by design (data is behind row-level security + email sign-in). Job sources
are keyless public APIs; key-backed aggregators were declined (#87, 2026-10-27). The one keyed
source, SAM.gov (Contracts track, #275), is read server-side through `/api/sam`, so its key never
reaches the browser.

## Names

| Name                        | Secret?                                 | Where it is set                    | Used by                                                    | If missing                                                                                                                  |
| --------------------------- | --------------------------------------- | ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `HDS_PACKAGES_TOKEN`        | yes (classic PAT, `read:packages` only) | Vercel env, cloud session env      | `.npmrc` (private `@hirobius/hds-toolkit`)                 | `npm install` fails with a 401 from npm.pkg.github.com                                                                      |
| `SAM_GOV_API_KEY`           | yes (SAM.gov public API key, read-only) | Vercel env (Production)            | `api/sam.ts` → `src/contracts/samHandler.ts`               | `/api/sam` answers 503 naming the var; the Contracts source row shows it                                                    |
| `SYNC_SECRET`               | yes                                     | `supabase secrets set`             | `supabase/functions/sync-postings` (`x-sync-secret` check) | unset: falls back to the pinned hash; set: only this value is taken (rotating revokes the old one); a wrong header gets 403 |
| `sync_postings_secret`      | yes (same value as `SYNC_SECRET`)       | Supabase Vault                     | the sync cron migration                                    | the cron call gets 403                                                                                                      |
| `project_url`               | no                                      | Supabase Vault                     | the sync cron migration                                    | the cron has no URL to call                                                                                                 |
| `SUPABASE_URL`              | no                                      | set by Supabase for every function | `sync-postings`                                            | 500 `missing env: SUPABASE_URL`                                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (bypasses RLS: server only)         | set by Supabase for every function | `sync-postings`                                            | 500 `missing env: SUPABASE_SERVICE_ROLE_KEY`                                                                                |
| `PW_CHROMIUM_PATH`          | no                                      | shell, cloud sessions              | Playwright, `npm run icons` / `screenshots` / `gallery`    | Playwright's own browser is used                                                                                            |

## Retired

- The Anthropic key (AI removed, #54) was revoked on 2026-10-15. Nothing reads it; delete it from
  Vercel env if it is still listed.
- There is no `.env.example`: no local var is needed to run the app (`npm run dev`).

## Rules

- `.gitignore` ignores `.env*` (except `.env.example`), so no local env file is committed.
- Least privilege: the PAT is `read:packages` only; the service-role key never leaves Supabase.
- A new secret: add its name to this table, store it in Bitwarden, and make the code that reads it
  fail with the var's name (never its value) when it is unset.
