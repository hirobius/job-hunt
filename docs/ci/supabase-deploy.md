# Supabase deploy from CI (#596)

## What it does

After the `ci` workflow passes on main, the `supabase-deploy` workflow runs
`scripts/supabase-deploy.ts`:

1. **plan** (read only): lists the new migrations and says whether `sync-postings` changed.
2. **deploy** runs right after plan, with no approval (Adrian, 2026-11-20: auto-deploy; a merge to
   main already needs green CI and an independent review). It:
   1. applies each new migration, in file-name order. Each migration and its ledger row are one
      transaction, and the first failure stops the run;
   2. deploys `sync-postings` (`--use-api --no-verify-jwt`, Supabase CLI 2.122.0), but only when a file
      it is built from changed since its last CI deploy, or a migration needs the new function;
   3. applies the migrations named in `supabase/deploy-order.json` `afterFunction` (the #583 case: a
      cron that calls the new function).
3. It records the commit in `ops.deploys` and in the run summary (fixes L6: the live function differed
   from main).

**The repo's file names are the source of truth.** The CI keeps its own ledger,
`ops.deployed_migrations` (one row per file). It never reads or writes
`supabase_migrations.schema_migrations`, whose rows have other version numbers. The `ops` schema
grants nothing to `anon` or `authenticated`.

**Order rule for authors:** a migration that must run after the new function is live goes in
`supabase/deploy-order.json` in the same PR. Everything else runs before the deploy.

The script refuses `--deploy` and `--init` outside GitHub Actions. Locally, run it with no flag to
see the plan.

## Setup (done 2026-11-20)

- A Supabase personal access token, `job-hunt supabase-deploy`, 90 days (expires about 2027-02-17).
  Replace it before then: new token, update the secret in both environments, delete the old one.
- GitHub environments `supabase-plan` and `supabase-production`, each limited to `main`, each with
  the `SUPABASE_ACCESS_TOKEN` environment secret. `supabase-production` has no required reviewer:
  a deploy runs as soon as plan passes. To bring the approval back, tick "Required reviewers" on
  it (Settings > Environments).
  **Never add the token as a repository secret:** any workflow on any branch can read a repository
  secret, which would skip the `main`-only rule.
- `.github/workflows/supabase-deploy.yml` (#856). Its header comment still says the deploy waits for
  approval; that comment changes in a PR by Adrian (agents never edit `.github/workflows`).
- The ledger: one `init` run at dbf0746 recorded the 31 live migrations; the first plan said "none".

Every merge to main now runs plan, then deploy.

## When it fails

- **A migration failed:** its transaction rolled back and nothing after it ran. Read the error in the
  run log, fix the migration in a PR (never edit a migration that is already live), and run again.
- **The function deploy failed:** the migrations before it are in. Fix the code, then run the
  workflow again (mode `deploy`).
- **Roll back the function:** Supabase dashboard > Edge Functions > sync-postings shows the version.
  To go back, revert the PR on main: the revert's merge runs the workflow and deploys the old code.
- **Out of order:** when two merges' ci runs finish in the wrong order, the older commit never
  redeploys the function over the newer one (the summary says "function kept").
- **Statements that cannot run in a transaction** (`create index concurrently`, `vacuum`, a top-level
  `commit`) cannot go through this path. Apply such a migration by hand, then add its row to
  `ops.deployed_migrations`.
