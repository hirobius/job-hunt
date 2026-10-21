# Roleforge mock: rev 2 + rev 3 feedback (Adrian, 2026-10-21)

Apply every item to `docs/staging/all-states.html`, the MOBILE (390) layouts only. Keep desktop from breaking, but don't redesign it: the desktop pass comes later. The template editor (N) is the reference look.

## Rev 2 (never landed; do it now)
1. **Pipeline "Jobs" toolbar.**
   - Phone: a full-width search field (search icon, one line), then one row with a Status select and a Sort select, each showing its value with a chevron.
   - Drop the duplicate "Saved ×" chip. Show a quiet "Clear" only when a filter is non-default.
   - All controls 40px with the same radius and border.
2. **Counts become small neutral pill badges** next to headings ("To apply 3", "Follow up 5", "Jobs 3", "Getting started 1 of 3", every count): surface-muted background, content-secondary text, 12/500, about 20px tall, 8px gap from the heading.
3. **One icon system: Lucide only**, as inline SVG with stroke 1.75: 16px in buttons and inputs, 20px for icon buttons. No text glyphs (+, ⇅, ×, ›). Icon buttons are 40×40 and centred. Icon+label gap is 8. Everything in a row shares one centre line.
(A) Variables: the Follow up dialog, Use template, and Apply mode letters show unfilled variables as raw "[Contact]" text plus a "Still to fill in" line. Adrian dislikes this. Mock unfilled variables as highlighted chips inside the message, matching the template editor's chips (N). Tapping one opens a small inline field to fill it, and the value saves to the job. Copy still works but warns "2 blanks left". On phone, keep one primary (Copy) full-width, with Open posting and Snooze as one row of two secondaries. Update every state that shows a filled message.
(B) Job page header: move ALL status badges (status, "Follow-up due", "Closed on the board", fit verdict) into one badge row ABOVE the job title. The meta line under the title is then company · location · applied date only. Use the same badge row on Pipeline cards.
(C) Job page:
- The Link value: truncate it with an ellipsis, or show the domain only.
- Tighten the extra space under the Details panel header.
- The tab row clips its last tab on phone with no cue. Add an overflow fade.
(D) Segmented controls, in EVERY state: the selected segment is nearly invisible. Use the page surface plus a 1px strong border and a subtle shadow (or the inverse fill), with the label at 500. It needs at least 3:1 non-text contrast against the track in both themes. Say in the final reply whether HDS 0.29's SegmentedControl itself has this flaw.
(E) Apply mode:
- One top row: "← Pipeline" on the left, and a pager "‹ 1 of 4 ›" on the right (40px icon buttons).
- Remove both the "Next job" link and the Skip button, and remove "1 of 4 to apply" from the meta line.
- Actions: Open application (primary), then one row with Mark applied and Not a fit.
(F) Job tabs. Adrian hasn't decided yet. Keep 5 tabs, and add ONE extra state showing the proposed 3-tab version for comparison:
- Overview = details + to-dos + notes, with empty to-dos as a quiet "Add a to-do" line and starter tasks as a link.
- Then Screening, then Interviews.
- Documents opens via "Use template".
(G) Companies page:
- Collapse the three stacked nav levels (top tabs, segmented Companies/Apply now/ATS, then tabs Apply now/Watched) into at most two, with no repeated label.
- The "+" becomes a Lucide plus icon button, aria-label "New track".
- Tile actions: Save is a secondary button, Open is a 36px secondary or an icon link, and Set aside is quiet text, all on one centre line.
(H) Card anatomy, the same order on every tile, posting and Pipeline card:
1. Top row: the source label with an icon (LinkedIn/Indeed/company) on the left, and the type badge (Search/Lead/Board/Posting) plus fit badge on the right.
2. Title on its own line, 16/700, 2 lines max.
3. Facts row with icons: location or mode, pay, posted date. Drop "live search".
4. Actions.
(I) ATS search panel:
- One primary "Search all boards" button. It opens ONE Google query ORing every board's site: clause and every ticked title, plus filters. Per-board Search buttons become quiet secondaries.
- Add a caption: results open in Google, because no ATS has a cross-company search API.
- Title chips wrap in a row, with "All selected (10)" first. Both filters sit on one row.
- Show the generated query as a copyable mono line.
(J) Live postings "Refine" panel:
- **Your evidence:** the textarea is scrunched to one line, so its placeholder clips. Make it at least 5 rows and resizable. Put the label "Your evidence" with the count as a small badge (C2 badge style), then a helper caption under the label, e.g. "One skill per line, like Design tokens: token pipeline (link)". Use a short placeholder or none.
- **Labels:** "Watch a company" and "Your evidence" use the same label style (UI 14/500), with the same gap between label, field and helper.
- **Refine header:** "Close" is an oversized boxed button. Make it a 36px quiet button or a chevron icon button (it's a disclosure).
- The "+" next to Manage track is still a text glyph (see G).

(K) Live postings "Openings" rows (Adrian). Apply H's anatomy, using only EXISTING styles (no new type style):
- Top row: the fit badge (Strong fit / Stretch / Reach), then the source as a small secondary label (Ashby, Lever, Greenhouse, HN Oct).
- Title on its own line (UI/body, 500 or 700 per H).
- Company on its own line in UI 14/500 primary colour. It's the same size as the facts but weightier and darker, so it reads as the "who", not the facts.
- Facts line in caption 13 secondary, with icons: location, plus pay or posted date if known.
- Drop the 'Matched "implementation consultant"' text from every row. Show the matched title as a small chip only when a wide sweep covers several titles, and only if it differs from the row title.
- Save stays one 36px secondary, vertically centred on the row.

(L) "Check a list of companies" (Adrian):
- Mock type-ahead autofill. As you type a company name, a dropdown suggests matches with a small logo or initial, the domain, and the source.
- Suggestion sources, all free and keyless:
  - companies already in the user's tracks, watched boards and saved jobs
  - the YC directory (yc-oss.github.io, already in the CSP)
  - Wikidata search (wbsearchentities) for everything else
- Picking a suggestion adds it as one line or chip. Change the input from a bare textarea to a chip input, but keep "Paste a list" as a secondary option.
- The "Star" button on a "No board found" row is unclear. Rename it (e.g. "Keep as a target") or make it a quiet icon with a label.

(M) Documents list: Cover letters and Outreach messages (Adrian). The rows don't look interactive.
- Each row gets a chevron and a hover/press state, so the whole row is clearly tappable.
- Tapping a row expands it inline: the first ~4 lines of the text as a preview, with variables as chips (A), then a row of actions: Copy (secondary), Open (opens the full editor), and a ⋯ menu (Pin, Duplicate, Delete).
- Only one row is expanded at a time. On desktop the expanded row can show the full text.
- The meta line shows the variables as small chips (A's chip style), not "[Company] [Role]" bracket text. Pinned becomes a badge in the top row (B/H pattern).
- The "New cover letter" / "New message" buttons move to the panel header's right side as a 36px secondary with a plus icon, not a full-width row of their own.

(N) Template editor: Adrian loves it. It's the REFERENCE look for variables everywhere (A should match these inline chips). Keep it as is, with only two fixes:
- The variable chips above the editor show brackets ("[Company]") while the inline chips don't ("Company"). Drop the brackets in the top row too, so they match.
- The page header reads "Cover letter / Base document" while the document is "Follow-up after applying". That's a mock data mismatch; make the header match the document.

(O) Error page actions (Adrian likes them). Make them reachable everywhere, but safely:
- Account menu gets a "Troubleshooting" section with "Reload app" and "Reset local data…".
- Reset opens a confirm dialog stating exactly what's lost. If signed in: "Your synced jobs come back after you sign in." If not signed in: "This deletes everything in this browser", with a "Back up first" link.
- Error toasts (sync or save failures) get a "Reload" action.
- Do NOT put Reset as a loose button on regular pages. It's destructive.

(P) Account button (top right): Adrian dislikes it, and it isn't an HDS component. Swap it for the HDS Avatar pattern: initials when signed in, a neutral icon when signed out, and an HDS Badge dot for unsynced. hds child session_01GNmKTf3M1wXHcWRxYrgPmE is defining the API; match its PR if it's ready, otherwise mock that shape.

SCOPE (Adrian, 2026-10-21): rev 3 is a MOBILE pass only. Don't spend effort on the desktop layouts yet (keep them from breaking, but no desktop redesign). The desktop pass comes later.
