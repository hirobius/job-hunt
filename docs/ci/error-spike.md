# Client error spike alert (#598)

## What it does

Every hour, `scripts/error-spike.ts` (run by the `error-spike` workflow) finds each Vercel
production deploy whose first hour has ended. For each one it counts crash reports in
`client_errors` (#47):

- the hour after the deploy went live, and
- the 7 days before it, as reports per hour (the baseline).

A jump is **at least 5 reports in the hour after, and at least 3 times the baseline rate**
(`src/ops/errorSpike.ts`). On a jump it opens one GitHub issue, labelled `error-spike`, titled
"Client errors jumped after deploy <sha7>". The GitHub app pushes it to the repo's watchers. One
deploy gets one issue at most.

The script gets a count only, never a report's text: it calls `client_error_count` (migration
`20261112100000_client_error_alert.sql`), which needs a token whose sha256 is in
`ops_alert_tokens`. Nobody else can read that table.

## Turn it on (Adrian)

1. Apply the migration `20261112100000_client_error_alert.sql` (with the other migrations, or
   Supabase dashboard > SQL editor > paste the file > Run).
2. Make a random token on your computer: `openssl rand -hex 32`. Keep it in Bitwarden
   (Hirobius - Internal, field `ERROR_ALERT_TOKEN`).
3. Supabase dashboard > SQL editor. Run this, with your token in place of `<TOKEN>`:
   `insert into public.ops_alert_tokens (token_hash, purpose) values (encode(sha256(convert_to('<TOKEN>', 'UTF8')), 'hex'), 'client-errors');`
4. GitHub > hirobius/job-hunt > Settings > Secrets and variables > Actions > New repository
   secret. Name `ERROR_ALERT_TOKEN`, value: the same token.
5. Run `git mv docs/ci/proposed-error-spike.yml .github/workflows/error-spike.yml`, commit and push
   to main.
6. Actions > error-spike > Run workflow, with "Print only" on. The log says "no deploy whose first
   hour just ended" or a "No spike" line. A `bad alert token` error means steps 3 and 4 differ.
7. Watch the repo (Watch > Custom > Issues) so the alert reaches your phone.

## When it fires

1. Open the issue. Read the new reports: Supabase dashboard > Table editor > client_errors, sorted
   by created_at.
2. If users are hurt, roll back first (docs/ci/smoke-and-rollback.md), then fix on a branch.
3. Close the issue when the cause is fixed.
