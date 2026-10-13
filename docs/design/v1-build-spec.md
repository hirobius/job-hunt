# v1 build spec — rebuild the app to match `prototype-v1.html` on HDS

**Decision (Adrian, 2026-10-13):** Variation 1 of the redesign prototype is the target; cut back as
needed. The prototype (`docs/design/prototype-v1.html`, open it in a browser — `#/` lists all 26
states) is the **layout and behaviour** reference. Its hand-written CSS is **not** — every screen is
built from HDS 0.24.1 components and tokens (see CLAUDE.md "Stack & conventions" and the
standing HDS brief: no colour literals, no literal font sizes, no ALL CAPS, HDS component where
one exists, `hds/recommended` lint clean).

## What carries over from v1 (per screen)

**Shell.** Name · Account menu (`src/account/AccountMenu.tsx` already holds sign-in, data, theme,
feedback — keep it; v1's separate sync chip + theme icon are folded into it). Tabs: Discover ·
Tracker · Templates (Tracker is the landing tab). Single column at every width.

**Tracker** (`TrackerView.tsx`, `JobRow.tsx`) — v1 states 01, 04–11.
- Add bar (URL field + Add), sample-data note, then **filter chips with counts** (Active, All,
  Saved, Applied, Interviewing, Offer, Rejected — HDS `Tag`/`SegmentedControl`), then toolbar:
  search field + sort icon + data icon. First-use hides filters and toolbar (state 01).
- **Next up** disclosure (Active filter, no query): due actions only, up to 3, each opens the job.
  No pipeline stats, no funnel on the Tracker (Adrian: no vanity metrics).
- **Job card:** avatar · title · ⋮ · "company — location" · status chip + next pill + pin ·
  one primary button from `nextAction()` (`src/nextAction.ts`). Whole card opens the job page.
- Sort, data and row menus are **Sheets** (`src/Sheet.tsx`, `SheetMenu`); the row sheet names the
  job and offers Open job page, Open posting, Pin/Unpin, Find more like this, Archive, Remove.

**Job page** (`JobDetailPage.tsx`) — states 12–16.
- Back bar · avatar + title + "company — location" + "View posting — host" link.
- **Next card:** status chip (tap → status Sheet), "Next: …", full-width primary from
  `nextAction()`, "Use a template" secondary.
- Rows that open Sheets: **To-dos** (checklist + the one notes field), **Interviews** (add event:
  date, time, kind, note), **Details** (grouped edit form with Cancel / Save — nothing changes
  until Save). Research chips at the bottom.
- **Log follow-up** Sheet (date, outcome, optional note) behind the primary when it is a follow-up.
- **Use a template** dialog: template chips, filled preview, **missing tokens editable in place**,
  Copy primary (`UseTemplate.tsx`).
- Missing job: empty state with Back to Tracker + Sign in to sync.

**Templates** (`CopyDeckView.tsx`) — states 17–19.
- Title + New template. Pinned section first. Each row: name, 2-line preview, token chips
  (`[Contact]` …), Preview + Copy. ⋮ → Sheet: Copy, Use with a job…, Edit, Pin, Duplicate, Delete.
- Edit is a Sheet: name, insert-token chips, body, Cancel / Save.

**Discover** (`DiscoverView.tsx`, `Onboarding.tsx`, `LiveFeedPanel.tsx`) — states 20–26.
- Track button (tap → track Sheet: tracks, Manage this track, New track), then a 3-way
  SegmentedControl: **Links · Search · Postings**.
- **Search** merges Title search and ATS search: a second control "By title / By company board";
  work mode + location are one shared block.
- Postings: shared controls, search term, All / Contract-friendly chips, cards with 2-line snippets.
- First run: checkbox cards + **sticky** Start button (state 20/21). Manage track is a Sheet.

## Data rules
- Use the existing data model; add a field only if a v1 control has nowhere to save, make it
  additive and normalised on read (like `screening.ts`). v1 "Closed" = `archived` (Retire).
- Everything must persist and survive reload (`rjb_shortlist` + cloud sync); check it in Chromium.

## HDS gaps hit (file upstream, build the closest compliant version)
1. **No Sheet / Drawer.** `src/Sheet.tsx` = HDS Dialog docked to the bottom edge on phones,
   styled from tokens in `src/theme/base.css` (`.app-sheet`).
2. Open triggers and tertiary hover use the accent fill, which can hide text (worked around per
   control in `base.css`).
3. Earlier: no base breakpoint in `sx` (hds#652), EmptyState action slot (hds#654), Text tone (hds#655).

## Slices (one owner each; tests first; verify at 390 then 1280, light + dark)
| Slice | Files owned |
|---|---|
| Foundation (done) | `Sheet.tsx`, `nextAction.ts`, shell tab labels |
| Tracker | `TrackerView.tsx`, `JobRow.tsx`, `NextUp.tsx`, Tracker tests |
| Job page | `JobDetailPage.tsx`, `UseTemplate.tsx`, `InterviewLog.tsx`, `TodosNotes.tsx` (all built, #144) |
| Templates | `CopyDeckView.tsx` + its tests |
| Discover | `DiscoverView.tsx`, `Onboarding.tsx`, `LiveFeedPanel.tsx`, `ManageTrackDialog.tsx` |
