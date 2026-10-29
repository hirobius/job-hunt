# Secrets and env vars

This repo follows the Hirobius Secrets Management Standard (`hirobius/ops` →
`standards/secrets-management.md`; adoption tracked in #22). Names only here, never values.
Real values live in Bitwarden (**Hirobius — Internal** collection, field label = the var name)
and in the host that needs them. Agents never read or write `.env*` files.

## The app ships no secrets

The browser app is keyless. `src/config.ts` holds the Supabase URL and **publishable** key,
which are public by design (data is behind row-level security + email sign-in). Job sources
are keyless public APIs in the browser. The key-backed searches (TheirStack, Adzuna, Jooble) run
only in the `sync-postings` edge function, are off in `SOURCE_ENABLED`, and read their keys from
Supabase secrets (table below). The one browser-side keyed
source, SAM.gov (the Contracts track, #275), was removed with the old screens (#389); its
`SAM_GOV_API_KEY` can be deleted from Vercel.

## Names

| Name                              | Secret?                                 | Where it is set                    | Used by                                                    | If missing                                                                                         |
| --------------------------------- | --------------------------------------- | ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `HDS_PACKAGES_TOKEN`              | yes (classic PAT, `read:packages` only) | Vercel env, cloud session env      | `.npmrc` (private `@hirobius/hds-toolkit`)                 | `npm install` fails with a 401 from npm.pkg.github.com                                             |
| `SYNC_SECRET`                     | yes                                     | `supabase secrets set`             | `supabase/functions/sync-postings` (`x-sync-secret` check) | every call gets 403 (no committed fallback); a wrong header gets 403 too                           |
| `sync_postings_secret`            | yes (same value as `SYNC_SECRET`)       | Supabase Vault                     | the sync cron migration                                    | the cron call gets 403                                                                             |
| `THEIRSTACK_API_KEY`              | yes (paid API, free tier)               | `supabase secrets set`             | `src/tracks/feeds/theirstack.ts` (sync-postings)           | setting it turns TheirStack on (`serverFeeds.ts`); unset, it is off and listed in `serverFeedsOff` |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | yes                                     | `supabase secrets set`             | `src/tracks/feeds/adzuna.ts` (sync-postings)               | setting either turns Adzuna on; with one unset its read fails naming it                            |
| `JOOBLE_API_KEY`                  | yes (rides in the URL: never logged)    | `supabase secrets set`             | `src/tracks/feeds/jooble.ts` (sync-postings)               | setting it turns Jooble on; unset, it is off                                                       |
| `project_url`                     | no                                      | Supabase Vault                     | the sync cron migration                                    | the cron has no URL to call                                                                        |
| `SUPABASE_URL`                    | no                                      | set by Supabase for every function | `sync-postings`                                            | 500 `missing env: SUPABASE_URL`                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`       | yes (bypasses RLS: server only)         | set by Supabase for every function | `sync-postings`                                            | 500 `missing env: SUPABASE_SERVICE_ROLE_KEY`                                                       |
| `PW_CHROMIUM_PATH`                | no                                      | shell, cloud sessions              | Playwright, `npm run icons` / `screenshots` / `gallery`    | Playwright's own browser is used                                                                   |

## Retired

- The Anthropic key (AI removed, #54) was revoked on 2026-10-15. Nothing reads it; delete it from
  Vercel env if it is still listed.
- There is no `.env.example`: no local var is needed to run the app (`npm run dev`).

## Rules

- `.gitignore` ignores `.env*` (except `.env.example`), so no local env file is committed.
- Least privilege: the PAT is `read:packages` only; the service-role key never leaves Supabase.
- A new secret: add its name to this table, store it in Bitwarden, and make the code that reads it
  fail with the var's name (never its value) when it is unset.
