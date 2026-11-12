# Figma agent rules for roleflame

Paste this page into the Figma agent's prompt for any roleflame design task. Source of truth for the
code is `CLAUDE.md`; this page is the visual subset. `src/figmaRules.test.ts` keeps it true.

## Build with

- **HDS components only** (`@hirobius/design-system`): Button, Card, Badge, Tag, Tabs, SegmentedControl,
  Input, Textarea, Menu, Dialog, Disclosure, Alert, EmptyState, Avatar, NavList. No custom controls.
- **HDS tokens only.** Colours are token roles (content, surface, border, feedback, accent). No hex.
  The accent is HDS graphite. No local colour override.
- **Type** is the HDS ramp: display, title, body, ui, caption, mono. Sora. No ALL CAPS.
  No italic. Secondary text is caption + secondary tone.
- **Keys have three ranks.** One filled key (Button primary) per decision. A real second choice is a
  grey key (Button secondary). **An exit is underlined text** (Button link: content.primary, no
  fill, no ledge, 44 px hit area): Cancel, Not a fit, Continue without an account. An exit is never a
  second choice, and never blue.
- **A job leads with its title** (title, 24 px, wraps in full), then the company ("Company not
  stated" in secondary), then one facts line with 16 px icons (place, pay, date; "Pay not stated"
  on a job page). An amber Badge with an icon sits under the facts only for Closing soon or
  Follow-up due. All other status is neutral. No fit chips, no Saved chip, no blue.
- **The filled key follows the state.** To apply: Open application / Mark applied / Not a fit. No
  application link (a fact says so, never a dashed box): Mark applied / Add link / Not a fit.
  Follow-up due: Copy follow-up / Mark followed up / Close out; the last two with Undo. A section shows
  only when it has content: no messages, no message rows; no Templates disclosure.
- **Copy into the form.** Each filled field is a flat Tag chip with a copy icon, never a keycap: a
  press copies and shows "Copied". Empty fields fold into one line: "8 more fields are empty. Add
  them". If the copy fails, a toast shows the text to copy by hand.
- **One saved list.** Apply is the saved list. Save (filled key with a plus icon) on Find adds a
  posting to Apply: "Added to Apply: <title> · Open · Undo". A toast stays across pages until it
  times out. More on a job has "Remove from Apply" (to
  Recently removed, with Undo). Skip shows a toast with Undo, never a confirm. No star, and the
  word "shortlist" never shows.
- **The action dock.** On a phone a job's keys sit in one dock at the bottom: one filled key, one grey
  key, one exit, in that order of rank, clear of the bottom safe area. It hides while a field has
  focus. At 1440 the same keys sit in one row under the title block. Not a fit is the dock's exit,
  never inside More; it acts at once with "Marked not a fit: <title> · Undo". A job with no link
  never shows Open application: its keys are Mark applied (filled), Add link (grey), Not a fit.
- **Find Deck (#545, #617).** The same posting card as Browse, one at a time. No pager row: "1 of 4"
  sits in the caption under Find, and a sideways swipe steps it. Skip (grey, left) and Save (filled,
  right) sit in the action dock, in one row; both show a toast with Undo. The card shows the
  posting's text at once, cut at 7 lines, then "Read the full posting"; no disclosure. More on the
  card keeps Not this company. The Sort menu shows in the Deck too: the deck's order and its
  "1 of N" follow the sort, and the card on screen stays when the sort changes.
- **Spacing** is HDS steps (compact density: 4, 8, 12, 16, 24, 32). Space comes from parent gaps,
  not child margins.

## Surfaces

- **One card level, ever.** No card inside a card. A list inside a panel is hairline rows, not cards.
- **No outlines on surfaces.** Cards and panels are borderless (raised fill + spacing). Inputs, focus
  rings, overlays and row dividers keep theirs.
- **Selected is a fill, never an edge (#603).** A selected or current item (the Apply list's open job,
  Find's selected posting) takes the HDS surface-selected fill (distinct from hover and the card fill in
  both themes); no left edge, ring or outline.
- Every action answers within 300 ms: a toast, a state change, or the item flashing in place.
  Remove is soft: it collapses, then offers Undo. Undo never navigates: it puts the item back and
  leaves the person on the page they are on.

## Layout

- **Two screens: Find and Apply** (the two top tabs). **Find** is home: Review new postings. The companies a
  scan finds are the Account menu's Companies dialog, under **Found** (Follow / Ignore), never on Find
  (#618). **Apply** is the saved jobs. From 1024 px Apply is two columns: the job
  list on the left, the selected job on the right. Below that, one job at a time: a filter bar
  (Filters, Add job), the sticky walk control, then the job.
- **The walk control (#542).** One row of three named controls, no box and no outline: left the view
  picker (the view's name, bold, with a caret; a Menu, a sheet on a phone, with the five views and
  "All jobs and filters"), beside it a "N filters" chip only while a filter is on (it opens the All
  jobs bottom sheet), and right the pager "7 of 12" with previous and next, which only steps (a
  sideways swipe steps too). At 390 the view name truncates, never the pager. No pager at 1440. Templates are a closed row list (name, one-line preview, blanks left, Copy). A job's view holds Open application, Mark applied | Not a fit, Templates, the Application kit,
  then Details, Notes, Documents and Decks. Pages with no tab: Documents, a Company, Legal.
- **Named views, no Status select (#541).** The Apply list is walked by view: To apply, Follow up,
  Interviewing, Applied, Recently closed, then All jobs. Each is a Tag chip with a count Badge, one
  picked at a time, and the open view's one-line description sits under the chips in caption. Follow
  up's count is amber while a follow-up is due; every other count is neutral. To apply sorts by
  closing date first, then newest. At 1440 the chips sit at the top of the list column. Closed jobs
  collect in Recently closed, where each is removed or kept.
- **Apply list column header at 1440 (#614).** Top to bottom: "Jobs" + Add job, the view chips, the
  view's one-line description, then one row: the **Remote only** toggle (the one visible control),
  with Search and Sort as quiet tertiary icon buttons at its end (Search opens the field under the
  row; Sort is a menu, never a filled select there), then one status line in caption
  ("To apply · 21 jobs · 1 closed on the board"). No "Check which are still open": the liveness check
  runs by itself on open (#602). Every count (chips, status line, closed, pager) follows Remote only.
  Focus rings and the selected fill are never clipped at the column's edges.
- **The Account menu (#549): 9 items in 4 groups.** Who you are: signed out "On this device only" and
  "Sign in to see your jobs on any device", then Sign in as a grey key (signed in: the email, the sync
  line, Sign out). Then Documents, Search profile, Companies, Data. Then Dark theme and Pause
  animations as toggles with a switch on the right that shows the state. Then Send feedback, Privacy and
  terms. Every row has a 16 px icon; rows are 44 px on a phone (a bottom sheet), 38 px at 1440. Scan
  details lives in the Search profile, as a closed row at its end.
- **The Data dialog (#550).** The Account menu has one Data item. It opens one dialog (a bottom sheet
  on a phone, centred at 1440) with two hairline lists, no cards: **Your data** (Back up, Restore,
  Export CSV, Export links, Recently removed) and **This device** (Try with sample data, Reload app,
  Reset local data, Delete my data). Each row is a quiet key with a 16 px icon and one caption line on
  what it does. Reset and Delete are the danger tone and ask first.
- **Add job (#551): one field and one filled key.** The Job link field with the helper "The title
  fills in from the link. You can edit it after.", then Add job (filled) and "Type a company or title
  instead" (grey). No Cancel key: Close (the X) and the scrim cancel. At 390 a bottom sheet with a
  grab handle, Add job at full width over the grey key. At 1440 a centred dialog, Add job at the
  right.
- **One detail template at 1440 (#546).** Find is two columns too: postings left, the selected
  posting right. A posting and a job use one detail template: the title block (title, company,
  one facts line, then the badges; a posting's source is a neutral badge there), More beside it,
  one action row (Save filled, Skip grey, Open posting as an icon), then the content (a posting's
  Description panel). List cards carry no keys at 1440: the detail column has them. Below 1024
  each Find card keeps its own keys.
- Page gutter 20 on a phone (`clamp(1.25rem, 5vw, 4rem)`, 64 from 1280). Shell max width 1048, content at most 920.
- Each page has one `h1`, its own name. The wordmark is never a heading.
- Touch targets are at least 44 px on a phone. Text contrast is AA (4.5) in light and dark.

## Show

- Design 390 and 1440, light and dark. Use sample data, never real names.
- Placeholders are the field's own name ("Job title", "Company"). No "e.g.".
- Empty states teach: what this holds, one primary action, one way to see it work.
