# Supabase deploy from CI (#596)

## What it does

After the `ci` workflow passes on main, the `supabase-deploy` workflow runs
`scripts/supabase-deploy.ts`:

1. **plan** (read only): lists the new migrations and says whether `sync-postings` changed.
2. **deploy** waits for your approval, then:
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

## Turn it on (Adrian)

1. Supabase dashboard > your avatar > Account preferences > Access Tokens > Generate new token.
   Name it `job-hunt CI`. Keep it in Bitwarden (Hirobius - Internal, field `SUPABASE_ACCESS_TOKEN`).
2. GitHub > hirobius/job-hunt > Settings > Environments > New environment > name `supabase-plan`.
   Deployment branches and tags > Selected branches and tags > add `main`. Environment secrets >
   Add environment secret: name `SUPABASE_ACCESS_TOKEN`, value: the token. Save. (No reviewer: the
   plan job only reads.)
3. New environment > name `supabase-production`. Tick "Required reviewers" and add yourself.
   Deployment branches: `main` only, as in step 2. Add the same `SUPABASE_ACCESS_TOKEN` environment
   secret. Save. Each deploy now waits for your approval.
   **Never add the token as a repository secret:** any workflow on any branch can read a repository
   secret, which would skip your approval.
4. Check that every migration in `supabase/migrations` is live (the Roleflame lane can check).
   Known gap on 2026-11-12: `20261105100000_daily_picks.sql` was not applied. Apply it by hand
   first, or the init in step 6 records it as applied.
5. Run `git mv docs/ci/proposed-supabase-deploy.yml .github/workflows/supabase-deploy.yml`. Open a
   PR with the change and merge it.
6. Actions > supabase-deploy > Run workflow > mode `init` > Run. Approve the deploy job. This
   creates the ledger and records every current migration as applied. It changes no table of the
   app.
7. Actions > supabase-deploy > Run workflow > mode `plan`. The summary should say "none" for
   migrations.

From then on, every merge to main runs plan, then waits for your approval to deploy.

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
