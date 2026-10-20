#!/usr/bin/env bash
# SessionStart bootstrap — a fresh clone (Claude Code on the web, a new worktree)
# lands with dependencies installed, so typecheck / lint / test run without a
# manual step. Modeled on ops's .claude/hooks/session-start.sh.
#
# Does only what is missing: `npm ci` when node_modules is absent or older than
# package-lock.json. Idempotent, non-interactive, never blocks the session:
# always exits 0 and prints one line saying what to run when it could not.
# Full output of a failed install goes to ${TMPDIR:-/tmp}/job-hunt-session-start.log.
#
# @hirobius packages come from GitHub Packages (.npmrc), so the install needs
# HDS_PACKAGES_TOKEN in the environment; without it the message below says so.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0

LOG="${TMPDIR:-/tmp}/job-hunt-session-start.log"

if [ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
  exit 0
fi

if [ -z "${HDS_PACKAGES_TOKEN:-}" ]; then
  echo "session-start: HDS_PACKAGES_TOKEN is not set, so @hirobius packages cannot install — add it to the cloud environment's secrets (classic PAT, read:packages), then run: npm ci"
  exit 0
fi

if npm ci --no-audit --no-fund >"$LOG" 2>&1; then
  echo "session-start: ready (ran: npm ci)"
else
  echo "session-start: npm ci failed (offline?) — run: npm ci  (log: $LOG)"
fi
exit 0
