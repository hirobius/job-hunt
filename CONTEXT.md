# Apply Board

The domain language of Apply Board — a personal job-application tracker and discovery
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

**Active queue**:
The default Tracker view: Jobs not yet applied to (Saved) plus any pinned as Priority, with Retired Jobs excluded.
_Avoid_: inbox, backlog, todo

**Priority**:
A Job the user has pinned so it stays in the Active queue and sorts to the top regardless of Status.
_Avoid_: starred, favourite, flagged

**Retired**:
A Job set aside and hidden from the Active queue but kept in the list (stored as `archived`).
_Avoid_: deleted, removed, closed
