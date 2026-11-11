# Weekly board-discovery refresh (#576 item 2)

`src/feed/data/boards.json` is a snapshot. New company boards are missed until discovery runs
again. `npm run discover:boards` runs discovery and checks the result. A workflow or a scheduled
task then opens a PR with the new board list.

`npm run discover:boards -- --help` prints the options and exit codes and reads no network. An
unknown option exits 1.

## What the script does

1. It runs `npm run boards:discover` (harvest and probe, with the probe's politeness limits).
   Every board already in `boards.json` is asked again, as well as every board the sources list.
2. It lays the answers over the committed set (`src/feed/bulk/refresh.ts`):
   - A board that answers live stays. Its line changes only when its open roles move a step
     (`jobs` is rounded up to 1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, …), and `lastChecked`
     moves with it. So a quiet week changes few lines.
   - A board that answers unknown (a timeout, a 5xx, three 429s, a blocked host), that no source
     lists any more, or that was not asked (a failed source, `--limit`, `--cached-only`) stays
     as it is.
   - A board that answers 404 gets `"misses": 1` on its line. It is removed only at the third
     weekly 404 in a row. A live answer clears the count. A run within 6 days of the set's
     `generated` day counts no new miss, so a re-run does not age a board twice. The count lives
     in `boards.json` because a GitHub runner starts with no probe cache.
3. It compares the new `boards.json` with the old one (`src/feed/bulk/boardsDiff.ts`).
4. Exit 0: the change is safe. The PR body is in `node_modules/.cache/boards-refresh.md`.
5. Exit 2: nothing changed. The old files are put back. Open no PR.
6. Exit 3: the run is blocked as unsafe. The old files are put back. Open no PR. This happens when:
   - a source that read last time failed (one that failed last time too, such as Common Crawl
     from a blocked network, is only reported),
   - one board kind lost over 25% of its boards,
   - over 10% of all boards were removed, or
   - the set is empty.
7. Exit 1: discovery failed, or an option was wrong. The old files are put back.

The script never commits, pushes or opens a PR. A full run takes 20 to 60 minutes.

Offline check (no network, about a second): `npm run discover:boards -- --only=seed --cached-only`
asks nothing, keeps every board and exits 2 with "No PR: no change".

## Option A (suggested): a GitHub Actions workflow

Agents may not edit `.github/workflows`, so Adrian adds this file.

Before you add it, do these steps:

1. In the repository settings, open Actions, then General.
2. Turn on "Allow GitHub Actions to create and approve pull requests".
3. Check that the `HDS_PACKAGES_TOKEN` repository secret exists (`ci.yml` uses it already).
   `npm ci` needs it for the private `@hirobius/hds-toolkit` tarball, or it fails with a 401.
4. Add the file below as `.github/workflows/board-discovery.yml`.

What the workflow does to stay safe:

- It runs only in `hirobius/job-hunt`, not in a fork.
- The checkout keeps no token (`persist-credentials: false`), because discovery runs repo code
  against outside hosts. Only the last step gets `GH_TOKEN`, and `gh auth setup-git` uses it
  for the push.
- The push step sets `HUSKY=0`. `npm ci` installs husky's hooks, and the pre-push secret scan
  fails without gitleaks, which the runner does not have. The commit is generated data only.
- Before the PR opens, it runs the feed and tracks tests and `npm run build`, which checks the
  bundle budgets (`board-keys.json` ships in a lazy chunk capped at 70 kB gzip).
- The branch name has the run id, so a re-run on the same day does not collide.

```yaml
name: Weekly board discovery
on:
  schedule:
    - cron: '17 3 * * 1' # Mondays 03:17 UTC
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
concurrency:
  group: board-discovery
  cancel-in-progress: false
jobs:
  refresh:
    if: github.repository == 'hirobius/job-hunt'
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          # Discovery runs repo code against outside hosts: keep the write token out of .git/config.
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22
          cache: npm
      # @hirobius/hds-toolkit is a private GitHub Packages tarball (.npmrc): npm ci 401s without it.
      - run: npm ci
        env:
          HDS_PACKAGES_TOKEN: ${{ secrets.HDS_PACKAGES_TOKEN }}
      # Exit 0: a safe change (PR body in node_modules/.cache/boards-refresh.md). Exit 2: no change,
      # a green run with no PR. Exit 3: blocked as unsafe (a source failed, a kind lost over 25%,
      # over 10% removed): a red run, so the failure is seen. Exit 1: discovery failed.
      - name: Run discovery
        id: discover
        run: |
          set +e
          npm run discover:boards
          code=$?
          echo "code=$code" >> "$GITHUB_OUTPUT"
          if [ "$code" = 2 ]; then exit 0; fi
          exit $code
      # The data must still pass its own tests and the bundle budget (board-keys.json ships in a
      # lazy chunk capped at 70 kB gzip by the size-budget plugin) before a PR is proposed.
      - name: Check the new set
        if: steps.discover.outputs.code == '0'
        run: |
          npx vitest run src/feed src/tracks
          npm run build
      - name: Open the PR
        if: steps.discover.outputs.code == '0'
        env:
          GH_TOKEN: ${{ github.token }}
          # npm ci installed husky's hooks; the pre-push secret scan needs gitleaks, which the
          # runner does not have. This commit is generated data only.
          HUSKY: '0'
        run: |
          branch="boards/refresh-$(date -u +%Y-%m-%d)-${GITHUB_RUN_ID}"
          gh auth setup-git
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git switch -c "$branch"
          git add src/feed/data/boards.json src/feed/data/board-keys.json
          git commit -m "data: weekly board discovery refresh"
          git push origin "$branch"
          gh pr create --title "data: weekly board discovery refresh" \
            --body-file node_modules/.cache/boards-refresh.md --base main --head "$branch"
```

Caution: a PR opened with `github.token` does not start the CI workflow. Close and reopen the
PR, or push an empty commit, to run CI before you merge.

## Option B: a weekly scheduled agent task

Use this prompt in a fresh-session scheduled task on the job-hunt repository:

```text
In hirobius/job-hunt, check free disk space first. Clone the repo into a uniquely named folder
under /dev/shm. Run npm ci with HDS_PACKAGES_TOKEN set, then npm run discover:boards. If it exits
2, stop and report "no change". If it exits 1 or 3, stop and report the reason it printed. If it
exits 0, run npx vitest run src/feed src/tracks and npm run build; if either fails, stop and
report it. Then create the branch boards/refresh-<YYYY-MM-DD>-<short random id>, commit
src/feed/data/boards.json and src/feed/data/board-keys.json, push, and open a PR with
node_modules/.cache/boards-refresh.md as the body. Do not merge. Delete the clone after.
```

Caution: the agent container's proxy blocks some hosts (SmartRecruiters, Workable and others in
the 2026-11-11 audit). Those boards then read as unknown. They are kept, but the run finds fewer
new boards.

## Suggestion

Use option A. A GitHub runner has open network access, so every source and ATS host answers.
The run is the same each week and costs no agent time. Use option B only if you do not want a
workflow with write access.

## Review checklist for each refresh PR

1. Read the "Removed" list. Each one answered 404 three weeks in a row.
2. Read "Kept after a 404". A long list from one kind means that host may be failing.
3. Read "Sources not read this run". A source that read last time blocks the run, so this lists
   only sources that also failed before.
4. Check that CI passes, including the bundle budgets.
