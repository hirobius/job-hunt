# Figma agent rules for roleflame

Paste this page into the Figma agent's prompt for any roleflame design task. Source of truth for the
code is `CLAUDE.md`; this page is the visual subset. `src/figmaRules.test.ts` keeps it true.

## Build with

- **HDS components only** (`@hirobius/design-system`): Button, Card, Badge, Tag, Tabs, SegmentedControl,
  Input, Textarea, Menu, Dialog, Disclosure, Alert, EmptyState, Avatar, NavList. No custom controls.
- **HDS tokens only.** Colours are token roles (content, surface, border, feedback, accent). No hex.
  The accent is HDS graphite. No local colour override.
- **Type** is the HDS ramp: display, title, body, ui, caption, mono. Plus Jakarta Sans. No ALL CAPS.
  No italic. Secondary text is caption + secondary tone.
- **Keys have three ranks.** One filled key (Button primary) per decision. A real second choice is a
  grey key (Button secondary). **An exit is underlined text** (Button link: content.primary, no
  fill, no ledge, 44 px hit area): Cancel, Not a fit, Continue without an account. An exit is never a
  second choice, and never blue.
- **A job leads with its title** (title, 24 px, wraps in full), then the company ("Company not
  stated" in secondary), then one facts line with 16 px icons (place, pay, date; "Pay not stated"
  on a job page). An amber Badge with an icon sits under the facts only for Closing soon or
  Follow-up due. All other status is neutral. No fit chips, no Saved chip, no blue.
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
  never inside More; it acts at once with "Marked not a fit: <title> · Undo".
- **Spacing** is HDS steps (compact density: 4, 8, 12, 16, 24, 32). Space comes from parent gaps,
  not child margins.

## Surfaces

- **One card level, ever.** No card inside a card. A list inside a panel is hairline rows, not cards.
- **No outlines on surfaces.** Cards and panels are borderless (raised fill + spacing). Inputs, focus
  rings, selected rows, overlays and row dividers keep theirs.
- Every action answers within 300 ms: a toast, a state change, or the item flashing in place.
  Remove is soft: it collapses, then offers Undo.

## Layout

- **Two screens: Find and Apply** (the two top tabs). **Find** is home: Review new postings, Apply, Follow up
  and New companies. **Apply** is the saved jobs. From 1024 px Apply is two columns: the job
  list on the left, the selected job on the right. Below that, one job at a time: a filter bar
  (Filters, Add job), a sticky "‹ 3 of 55 ›" pager with All jobs (a bottom sheet with the list), then the
  job. Templates are a closed row list (name, one-line preview, blanks left, Copy). A job's view holds Open application, Mark applied | Not a fit, Templates, the Application kit,
  then Details, Notes, Documents and Decks. Pages with no tab: Documents, a Company, Legal.
- **Planned (#471):** Find as two columns too (postings left, the selected posting right).
- Page gutter 20 on a phone (`clamp(1.25rem, 5vw, 4rem)`, 64 from 1280). Shell max width 1048, content at most 920.
- Each page has one `h1`, its own name. The wordmark is never a heading.
- Touch targets are at least 44 px on a phone. Text contrast is AA (4.5) in light and dark.

## Show

- Design 390 and 1440, light and dark. Use sample data, never real names.
- Placeholders are the field's own name ("Job title", "Company"). No "e.g.".
- Empty states teach: what this holds, one primary action, one way to see it work.
