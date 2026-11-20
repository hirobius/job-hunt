# Proposed CI: how to turn it on

Agents may not edit workflow files. Adrian must do these steps. Issue: hirobius/job-hunt#566.

The workflow runs on each pull request and on each push to main.
It runs the checks and a gitleaks scan of the full git history (all branches). The scan also runs weekly and on manual start.
It auto-merges HDS patch PRs from Dependabot only, until Adrian removes the semver-minor ignore in `.github/dependabot.yml`.

## Steps

1. Open a terminal in the repo on the main branch.
2. Run `git mv docs/ci/proposed-ci.yml .github/workflows/ci.yml`.
3. Commit the change and push it to main.
4. Open Settings > General.
5. Turn on "Allow auto-merge".
6. Open Settings > Branches (or Rules > Rulesets).
7. Add a rule for the branch `main`.
8. Turn on "Require status checks to pass".
9. Add these checks: `verify`, `visual`, `gitleaks`.
10. Save the rule.
11. Wait for the next Dependabot PR for `@hirobius/design-system`.
12. Make sure that the PR merges by itself after the checks pass.

If a check name does not show in step 9, run the workflow once first. Then try again.

## Known gap (M3, hirobius/job-hunt#567)

`.github/dependabot.yml` still names GitHub Packages as a registry for `@hirobius`, and GitHub
Packages stops at design-system 0.26.2. Since 2026-11-20 `@hirobius/hds-toolkit` is on public
npm too, so that registry entry (and its `HDS_PACKAGES_TOKEN`) can go; agents do not edit
`.github`, so Adrian removes it. Until then, upgrade HDS by hand.
