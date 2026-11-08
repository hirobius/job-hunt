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
- Touch targets are at least 40 px on a phone. Text contrast is AA (4.5) in light and dark.

## Show

- Design 390 and 1440, light and dark. Use sample data, never real names.
- Placeholders are the field's own name ("Job title", "Company"). No "e.g.".
- Empty states teach: what this holds, one primary action, one way to see it work.
