# Proposed CI: how to turn it on

Agents may not edit workflow files. Adrian must do these steps. Issue: hirobius/job-hunt#566.

The workflow runs on each pull request and on each push to main.
It runs the checks, runs gitleaks over the full history, and auto-merges HDS minor and patch PRs from Dependabot.

## Steps

1. Open a terminal in the repo on the main branch.
2. Run `git mv docs/ci/proposed-ci.yml .github/workflows/ci.yml`.
3. Commit the change and push it to main.
4. Open Settings > Secrets and variables > Actions. Add the secret `HDS_PACKAGES_TOKEN`. Use a classic PAT with `read:packages`.
5. Open Settings > Secrets and variables > Dependabot. Add the same secret `HDS_PACKAGES_TOKEN`.
6. Open Settings > General.
7. Turn on "Allow auto-merge".
8. Open Settings > Branches (or Rules > Rulesets).
9. Add a rule for the branch `main`.
10. Turn on "Require status checks to pass".
11. Add these checks: `verify`, `visual`, `gitleaks`.
12. Save the rule.
13. Wait for the next Dependabot PR for `@hirobius/design-system`.
14. Make sure that the PR merges by itself after the checks pass.

If a check name does not show in step 11, run the workflow once first. Then try again.
