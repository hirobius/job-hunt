# RoleForge (formerly Apply Board)

The domain language of RoleForge (working name; set in `src/brand.ts`) — a personal job-application tracker and discovery
board. These are the concepts the code models; use them exactly and avoid the listed
synonyms so the code, docs, and architecture reviews share one vocabulary.

## Language

**Job**:
A single saved job posting the user is tracking, identified by its URL.
_Avoid_: listing, posting, entry, application

**Status**:
Where a Job sits in its lifecycle: Saved, Applied, Interviewing, Offer, or Rejected.
_Avoid_: stage, state, phase

**Applied**:
The date a Job first reached the Applied status — set once on first entry and never cleared.
_Avoid_: submitted, sent

**Follow-up**:
A reminder on an Applied or Interviewing Job that comes due a fixed number of days after the last contact; logging one restarts its clock.
_Avoid_: reminder, nudge, ping

**Job lifecycle**:
The model that owns a Job's Status transitions and its Follow-up clock — the read-side derivations (is it due, days until, active) and the write-side transitions (`src/jobState.ts`).
_Avoid_: job state, workflow, state machine

**Pipeline**:
The view of every saved Job, as one list with search, a Status filter and sort (`#/queue`). It was called the Tracker until #128.
_Avoid_: tracker, queue (in copy), board

**Companies**:
The home tab (`#/discover`, the old Discover): the user's tracks, the companies they watch with open roles, Apply now links and the ATS search. Today (`#/today`) is gone; its lists open the Pipeline (To apply, Follow up, Next 7 days).
_Avoid_: dashboard, home page, Discover (in copy)

**Apply mode**:
Working through To apply one Job at a time (`#/apply/<id>`): open the application, then Mark applied or Not a fit, with the Outreach messages filled for the Job and the Application kit to copy from.
_Avoid_: wizard, apply flow

**First run**:
A visit with no tracks and no Jobs. Companies shows onboarding (with a sample-data offer); it shows Choose a track whenever there are no tracks.
_Avoid_: new user, empty state

**Active queue**:
The default Pipeline view: Jobs not yet applied to (Saved) plus any pinned as Priority, with Retired Jobs excluded.
_Avoid_: inbox, backlog, todo

**Priority**:
A Job the user has pinned so it stays in the Active queue and sorts to the top regardless of Status. The UI's word is Star / Starred (stored as `pinned`).
_Avoid_: favourite, flagged

**Retired**:
A Job set aside and hidden from the Active queue but kept in the list (stored as `archived`).
_Avoid_: deleted, removed, closed

**Posting**:
An opening pulled live from a job source (Hacker News, Remotive, a company board) into Live postings (under Companies). Never stored — saving one creates a Job.
_Avoid_: listing, opening (in code), result

**Watched company**:
A company whose Greenhouse, Lever or Ashby job board is on a track (as a tile), so its openings are pulled into Live postings.
_Avoid_: followed company, subscription

**Document**:
A Résumé, Cover letter, Note or Outreach message the user writes, linked to a Job, a Company, or neither (`src/documents.ts`). Every save adds a Version.
_Avoid_: file, attachment, template (in code)

**Version**:
One saved text of a Document. Versions are kept in save order and never edited; a new save adds a new one.
_Avoid_: revision, draft, history entry

**Sent**:
The one Version of a kind (say, Cover letter) that went to a Job. Locked once marked: it can't be un-sent, moved or deleted, and a Job has at most one Sent Version per kind.
_Avoid_: submitted, final

**Company**:
An employer, derived from the company name on the user's Jobs (and on Documents that name one); spellings that differ only in case, punctuation or a suffix like Inc are one Company. Never created by hand. Its page holds its Jobs, Documents and Notes (`src/companies.ts`).
_Avoid_: employer, organization, account

**Base document**:
A Document not tied to a Job, kept to be copied into one. It is never Sent itself.
_Avoid_: master, template, default

**Outreach message**:
A Base document of the Outreach-message kind: the text Use template, the follow-up dialog and the Apply sheet fill for a Job, with `[Variable]`s and its own variable values. It replaced the Copy Deck snippet (`src/outreachTemplates.ts`); each snippet became one, once.
_Avoid_: snippet, template (in code)

**Final copy**:
A PDF or Word file uploaded to a Job as a Document of a kind: its one Version holds the file, not text, and it takes no new Versions. It can be marked Sent like any Version, and can be downloaded back.
_Avoid_: attachment, upload (as a noun in code)

## Proposed (simplify spec, `docs/specs/simplify.html`)

Adrian picked design C with no loss of breadth (2026-10-28). These terms are not built yet; until their slices land, the terms above stand.

**Today**:
The home page: three counts in a fixed order (Review new, Apply, Follow up) under "N new today from M sources". Replaces Companies as home. The only top tabs are Today and Jobs (the Pipeline).
_Avoid_: dashboard, home, inbox

**Find**:
The one paste box on Today. A job link saves a Job, a board or company link or name adds a Source, words change the Search profile's titles.
_Avoid_: add, quick-add, watch, search (as a feature name)

**Source**:
Anything the user follows for new Postings: a company board of any kind, a company with no board yet, or a feed (HN, Remotive, Jobicy, designsystems.jobs). Can be starred or muted. One synced list; a star marks a favourite. Replaces Watched company, dream company and outreach target.
_Avoid_: watched company, dream, target, subscription

**Search profile**:
What the user is looking for: titles (the wide sweep covers all of them), related titles, must-include and leave-out terms, pay floor, level, location, work mode; the scorer's config comes from it. One per account (stored as a list of one). Replaces the track as the frame for discovery.
_Avoid_: track, pillar, filter, calibration

**Feed**:
The one module that turns Sources and the Search profile into ranked Postings, read in the browser when signed out and from the server sync when signed in.
_Avoid_: live postings, sweep, scored queue

**Browse**:
The default view of Review new: every undecided Posting that passes the Inclusion check as one list you can sort and filter. Tapping a row opens a short preview (details, why it matched, Save / Skip / Not this company), with Open posting one tap away.
_Avoid_: live postings, results, inbox

**Deck**:
The optional view of Review new: the same undecided Postings one card at a time. Save makes a Job and follows its company. Skip hides that Posting only. Not this company mutes its Source.
_Avoid_: inbox, queue, swipe list

**Scan**:
The one discovery run, twice a day on the server and once when the app opens. It finds companies (YC, GitHub design-system orgs, Adele), probes their boards, reads every board and feed, runs the Inclusion check on every Posting, and re-checks saved Jobs' boards. Its only controls are Scan now and the last-scanned time.
_Avoid_: sweep, fetch, check, refresh

**New company**:
A company the Scan found that the user has not yet Followed or Ignored. It is listed on Today with Follow / Ignore, and its matching Postings show at once in Review new. Ignore mutes it for good. Followed and Ignored companies are kept in the Companies list under the Account menu (the Sources list); there is no Companies tab.
_Avoid_: suggestion, found team, target

**Inclusion check**:
The one gate on a Posting: its title or description names a design-system role (design system(s), design technologist, design system engineer…) under the phrase rules in `feed/mustInclude.ts`, plus the user's profile filters. A Posting that fails is only counted ("N not design-system roles"). Fit and the scorer never hide a Posting.
_Avoid_: gate, match, fit filter

**Breadth guard**:
The fixture test that counts distinct Postings that pass the Inclusion check from the same recorded inputs through the old pipeline and the Feed, and fails if the Feed returns fewer.
_Avoid_: coverage test

**Decided**:
The remembered verdicts on Postings (saved or skipped), kept by Posting so it never comes back to Review new. Never a company: muting a company is a flag on its Source.
_Avoid_: dismissed, set aside, skips
