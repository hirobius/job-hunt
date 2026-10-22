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

**Today**:
The home view (`#/today`): Follow-ups due now, the next 7 days of interviews and calls, one quick-add field.
_Avoid_: dashboard, home page, inbox

**First run**:
A visit with no tracks and no Jobs. The shell shows onboarding instead of Today; Discover shows it whenever there are no tracks.
_Avoid_: new user, empty state

**Active queue**:
The default Pipeline view: Jobs not yet applied to (Saved) plus any pinned as Priority, with Retired Jobs excluded.
_Avoid_: inbox, backlog, todo

**Priority**:
A Job the user has pinned so it stays in the Active queue and sorts to the top regardless of Status.
_Avoid_: starred, favourite, flagged

**Retired**:
A Job set aside and hidden from the Active queue but kept in the list (stored as `archived`).
_Avoid_: deleted, removed, closed

**Posting**:
An opening pulled live from a job source (Hacker News, Remotive, a company board) into Discover's Live postings. Never stored — saving one creates a Job.
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
