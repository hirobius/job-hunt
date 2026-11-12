# Post-deploy smoke test and rollback (#595)

## What it checks

`npm run smoke` (`playwright.smoke.config.ts`, `smoke/production.spec.ts`) opens the LIVE site in a
fresh, signed-out browser at 390 and 1440 and checks:

1. The app loads (200) on Find, with its h1, the page title and the flame logo's path data.
2. The Find and Apply tabs, and the Review region.
3. Apply opens with its h1.
4. The sign-in screen opens with the Email field and Send link. No link is sent.
5. Privacy and terms opens.
6. No page error, no console error and no 4xx/5xx on the site's own files at any step.

Analytics and the logo host are answered empty, so a run is not counted as a visit.
Run it by hand: `npm run smoke`, or `SMOKE_URL=<url> npm run smoke` for another deploy.

## Turn it on (Adrian)

1. Run `git mv docs/ci/proposed-smoke.yml .github/workflows/smoke.yml`.
2. Commit the change and push it to main.
3. The workflow uses the `HDS_PACKAGES_TOKEN` Actions secret that CI already has. No new secret.
4. Open Actions > smoke > Run workflow once, to see it pass.
5. Watch the repo (Watch > All activity, or Custom > Issues) so the GitHub app pushes the alert.

## When it fails

The workflow opens one issue labelled `smoke-failure` (later failures comment on it). Then:

1. Open the run link in the issue and read the failed step.
2. If the live site is broken, roll back first, then fix:
   1. Open vercel.com > the roleflame project > Deployments.
   2. Find the last Production deployment before the bad one (status Ready).
   3. Open its ... menu and pick Instant Rollback (or Promote to Production).
   4. Confirm. The alias moves in seconds. Run `npm run smoke` again to check.
3. Fix on a branch, merge, and close the issue when the next smoke passes.
4. After a rollback, Vercel holds production on the old deployment: the next push to main does not
   go live until you undo the rollback (Deployments > the new deployment > Promote to Production).
