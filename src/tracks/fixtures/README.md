# Recorded live answers (rotation)

Taken 2026-10-30 from the public board APIs the scan rotation reads (`src/tracks/rotation.ts`;
the board set holds Greenhouse, Lever and Ashby only):

| File                      | URL                                                                    |
| ------------------------- | ---------------------------------------------------------------------- |
| `greenhouse-discord.json` | `https://boards-api.greenhouse.io/v1/boards/discord/jobs?content=true` |
| `lever-spotify.json`      | `https://api.lever.co/v0/postings/spotify?mode=json`                   |
| `ashby-linear.json`       | `https://api.ashbyhq.com/posting-api/job-board/linear`                 |

Trimmed: two roles per board (one design role, one other), every string cut at 1,200 characters,
no email addresses kept (none were in these roles). Field names and shapes are untouched. The
same day, `npm run sync:dry-run -- --rotate --read` read a live batch of 25 boards from the set:
all 25 answered `ok`, 678 postings parsed.

Re-take one with `curl -s <URL>` and trim it the same way. Used by `rotationDryRun.test.ts` and
`npm run sync:dry-run -- --rotate --fixtures`.

## Not recorded: the keyless server feeds

Arbeitnow (`www.arbeitnow.com`), Remote OK (`remoteok.com`) and We Work Remotely
(`weworkremotely.com`) were refused by the build container's network policy (proxy 403 on
CONNECT), so their fixtures in `src/tracks/feeds/fixtures/` are still built from the documented
shapes and those sources stay **unverified live**.
