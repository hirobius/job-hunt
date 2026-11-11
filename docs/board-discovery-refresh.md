# Weekly board-discovery refresh (#576 item 2)

`src/feed/data/boards.json` is a snapshot. New company boards are missed until discovery runs
again. `npm run discover:boards` runs discovery and checks the result. A workflow or a scheduled
task then opens a PR with the new board list.

## What the script does

1. It runs `npm run boards:discover` (harvest and probe, with the probe's politeness limits).
2. It compares the new `boards.json` with the old one (`src/feed/bulk/boardsDiff.ts`).
3. If the result is safe, it writes the PR body to `node_modules/.cache/boards-refresh.md` and
   exits 0.
4. If over 10% of the boards are removed, the set is empty, or nothing changed, it puts the old
   files back and exits 2. Open no PR then.

The script never commits, pushes or opens a PR. A run takes 20 to 60 minutes.

## Option A (suggested): a GitHub Actions workflow

Agents may not edit `.github/workflows`, so Adrian adds this file.

Before you add it, do these steps:

1. In the repository settings, open Actions, then General.
2. Turn on "Allow GitHub Actions to create and approve pull requests".
3. Add the file below as `.github/workflows/board-discovery.yml`.

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
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Run discovery
        id: discover
        run: |
          set +e
          npm run discover:boards
          code=$?
          echo "code=$code" >> "$GITHUB_OUTPUT"
          if [ "$code" = 2 ]; then exit 0; fi
          exit $code
      - name: Open the PR
        if: steps.discover.outputs.code == '0'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          branch="boards/refresh-$(date -u +%Y-%m-%d)"
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
under /dev/shm. Run npm ci, then npm run discover:boards. If it exits 2, stop and report the
reason. If it exits 0, create the branch boards/refresh-<YYYY-MM-DD>, commit
src/feed/data/boards.json and src/feed/data/board-keys.json, push, and open a PR with
node_modules/.cache/boards-refresh.md as the body. Do not merge. Delete the clone after.
```

Caution: the agent container's proxy blocks some hosts (SmartRecruiters, Workable and others in
the 2026-11-11 audit). Those boards then read as unknown, and the run finds fewer boards.

## Suggestion

Use option A. A GitHub runner has open network access, so every source and ATS host answers.
The run is the same each week and costs no agent time. Use option B only if you do not want a
workflow with write access.

## Review checklist for each refresh PR

1. Read the "Removed" list. A large drop from one kind means that host failed, not that boards
   closed.
2. Read "Sources not read this run". If a main source failed, close the PR and run again.
3. Check that `npm run verify` passes, including the bundle budgets.
