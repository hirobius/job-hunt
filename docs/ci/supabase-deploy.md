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
2. GitHub > hirobius/job-hunt > Settings > Secrets and variables > Actions > New repository secret.
   Name `SUPABASE_ACCESS_TOKEN`, value: the token.
3. GitHub > Settings > Environments > New environment > name `supabase-production`.
   Tick "Required reviewers", add yourself, and save. Each deploy now waits for your approval.
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
  Deploy the last good commit: Actions > supabase-deploy > Run workflow from that commit's branch,
  or revert the PR on main.
