# Roleflame (formerly hiraga, Stoke, RoleForge, Apply Board)

The domain language of Roleflame ( set in `src/brand.ts`) — a personal job-application tracker and discovery
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

**Apply**:
The work tab (`#/apply`, ADR 0010): the list of every saved Job (search, Status, Sort, Follow up, Next 7 days) beside the selected Job's Apply view. At lg it opens on the first Job to apply to; on a phone the list is the tab and a Job is its own view with Back and "‹ 2 of N ›". It replaced the Pipeline (`#/queue`, called the Tracker until #128), the job page and Apply mode.
_Avoid_: Pipeline, Jobs tab, tracker, queue (in copy), board, Apply mode

**Apply view**:
One Job on the Apply tab (`#/apply/<jobId>`): badges, title and company, the next step for its Status (Saved: Open application, then Mark applied | Not a fit), the Templates and Application kit, then Details, Notes, Documents and Decks. Mark applied and Not a fit open the next Job in the list.
_Avoid_: job page, job detail, Apply mode, wizard

**Find**:
The home tab (`#/find`, ADR 0010; was Today): the scan's status, Daily picks, Review new and New companies in the list column, beside the selected Posting (`#/find/<fingerprint>`). Nothing is selected when the tab opens ("Pick a posting").
_Avoid_: Today, dashboard, home page, Discover, Companies (as a page)

**Route dialog**:
Documents and Privacy and terms (ADR 0010): a dialog over the open page, held in that page's URL (`?documents=`, `?legal=`), so a link opens it and Back closes it. Not a page and not a tab.
_Avoid_: Documents page, Legal page, modal page

**Search profile**:
What the user is looking for, one per account (`rjb_profiles`, blob v12): job titles, the broad ATS terms, the design-system inclusion check, leave out, pay floor, level, location and remote only. Set up by onboarding and edited from the Account menu. It replaced tracks (ADR 0009).
_Avoid_: track, pillar, saved search, filter

**Source**:
Somewhere jobs come from, on one synced list (`rjb_sources`): a company's job board, a followed company with no board yet, or a keyless feed. A starred Source is a dream company; a muted one ("Not this company", Ignore) is kept and never shown.
_Avoid_: watched company, tile, subscription

**Feed**:
Every design-system Posting read from the Sources and feeds for the Search profile, newest first, minus what was decided, saved or muted (`src/feed/feed.ts`). Review new shows it.
_Avoid_: results, search results, inbox

**Review new**:
The Feed on Find, as the Browse list (default) or the Deck: Save makes a Job and follows its board, Skip hides that one Posting, Not this company mutes its Source.
_Avoid_: triage, inbox, Live postings

**Auto-scan**:
The one run that finds companies, checks their boards and reads every Source and feed, on app open (every 6 hours) or on Scan now. Its finds show as New companies on Find, with Follow or Ignore.
_Avoid_: crawl, sync, refresh

**First run**:
A visit with no Search profile, no old tracks and no Jobs. There is no setup screen: once sync settles the default design-systems profile and starter Sources are added, and Find opens on Review new; sample data is the Apply tab's empty-state offer.
_Avoid_: new user, empty state

**Active queue**:
The default Apply list view: Jobs not yet applied to (Saved) plus any pinned as Priority, with Retired Jobs excluded.
_Avoid_: inbox, backlog, todo

**Priority**:
A Job the user has pinned so it stays in the Active queue and sorts to the top regardless of Status. The UI's word is Star / Starred (stored as `pinned`).
_Avoid_: favourite, flagged

**Retired**:
A Job set aside and hidden from the Active queue but kept in the list (stored as `archived`).
_Avoid_: deleted, removed, closed

**Posting**:
An opening pulled live from a job source (Hacker News, Remotive, a company board) into the Feed. Never stored as a Job: saving one creates a Job.
_Avoid_: listing, opening (in code), result

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
