# ADR 0012 — Scans run on the server only

- **Status:** Proposed (phase 1 of #756; Accepted when the flag is off and the browser scan code is gone, phase 8)
- **Date:** 2026-11-16
- **Decider:** Adrian (2026-11-15: "The browser never scans, even when signed in. Scans run on the server only.")

## Context

Review's postings come from two places. The `sync-postings` edge function reads each user's followed
boards every 15 minutes, and twice a day the keyless feeds, and stores scored rows in `postings`.
The browser also reads job sources itself: the full read when the server has no rows, a company or
title added since the last read, and the discovery scan on app open (YC "hiring now", GitHub
design-system orgs, probes, every followed board and feed). Since #755 a signed-out visitor reads
nothing. The browser reads cost a phone most of a minute of main thread and about 700 MB at the peak
(#657), they send the user's IP address to every job source, they need 23 feed hosts in the CSP, and
they hid server faults (no sync run finished from 2026-11-12 to 2026-11-15, #726).

## Decision

The browser does not read job sources. Review lists only the rows the server stored for the account
(`feed_rows`). New sources reach the server (phase 2), a newly followed company is read through a
request to the server (phase 3), and the browser scan code and its CSP hosts are deleted (phase 6).

The move is behind one switch, `src/feed/browserScans.ts` (`browserScans()`, on until phase 5).
Off: the scan on open does not mount, `serverFirstReader` has no browser fallback (`noReader`), an
added company or title is not read in the browser, and there is no Scan now. A fetch spy test pins
that with the switch off no request leaves the browser on Review load, on app open or after a Follow
(`browserScansOff.test.tsx`). The switch flips only when the parity bar is met (#756 question 6).

The parity count is local: Scan details shows how many of Review's rows came from the server and how
many only this browser found ("12 from the server, 3 only from this browser"). Nothing is sent.

## Considered options

- **Keep the browser read as a fallback.** Rejected: it hides each server fault behind a full read,
  and it is the cost (CPU, memory, IP exposure, CSP width) the decision removes.
- **Turn browser scans off at once.** Rejected: today the server gives fewer rows for some accounts
  (the 3-title cap, no Mastodon, no found companies, a 15-minute wait for a new Source). The flag
  and the parity count let the gap be measured and closed first.

## Consequences

- One source of truth for Review: a server fault shows as an empty or stale Review, with its time.
- A newly followed company's jobs wait for the next server read until phase 3 ships.
- The CSP loses 9 hosts in phase 6; the job sources no longer see the user's IP address. The legal
  copy changes then, with Adrian's approval.
