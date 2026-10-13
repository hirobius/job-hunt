# 21st.dev pattern reference — Apply Board redesign (#115)

Purpose: a fixed yardstick so redesign passes compare against named patterns instead of circling.
Each row names the 21st.dev reference, the rule we hold ourselves to, where the app stands, and the
gap. Update the "Status" column in the PR that closes a gap; never restyle a row without a rule.

21st.dev installs need a membership key, so we never install from it. We read the pattern and
rebuild it with HDS (`@hirobius/design-system`) + `src/ui` layout primitives.

## Reference set

| # | Pattern | 21st.dev reference | Rule we adopt |
|---|---|---|---|
| P1 | Empty state | [Empty States (77)](https://21st.dev/community/components/s/empty-state) · [blog](https://21st.dev/blog/react-empty-state-components) | Show what the screen holds once full; the filling action is the primary button; ≤ 3 sentences, named in the user's words ("No saved jobs yet", not "No records"); no apologies, no sad face. First-use (create) and no-results (repeat the query, offer a real clear control) are different screens. Loading is a skeleton, never an empty state. |
| P2 | Stat tiles / KPI row | [Stats & KPIs (153)](https://21st.dev/community/components/s/stat) · [blog](https://21st.dev/blog/react-progress-stats-components) | One number per tile, the focal point; label and number in the same element; name the comparison period ("vs last 30d"); tabular figures; colour by meaning, not by sign; sparkline only when the trend matters more than the figure. |
| P3 | Dashboard shell | [Dashboards (400)](https://21st.dev/community/components/s/dashboard) · [blog](https://21st.dev/blog/react-dashboard-components) | Frame = header + sidebar/rail + content; lead with one headline number, then trend, then breakdown; bento (unequal) panels, never an equal-card grid; ≤ ~12 items as cards, beyond that a dense table; reserve skeleton height so panels don't shift. |
| P4 | Tabs vs filter pills | [Tabs (239)](https://21st.dev/community/components/s/tabs) · [blog](https://21st.dev/blog/react-tabs-components) | Tabs switch panels (`tablist`, routed in the URL); filters change one list (`radiogroup` / toggle buttons, state only). >6 items or long labels → vertical/expandable, not a scrolling strip. |
| P5 | List item with avatar | [Lists (349)](https://21st.dev/community/components/s/list) · [Avatars (597)](https://21st.dev/community/components/s/avatar) | Leading identity medallion, title + one metadata line, trailing single overflow action; secondary facts below, never in the header row. |
| P6 | Sidebar / rail | [Sidebars (95)](https://21st.dev/community/components/s/sidebar) | Rail is sticky and scrolls independently from the main region; collapses below md; holds overview content, not primary actions. |
| P7 | Tags / chips | [Tags (74)](https://21st.dev/community/components/s/chip) | Chips carry counts when the count changes the decision; cap a chip row to what fits one line at 390px, hide empties. |
| P8 | Kanban (future) | [Kanban (14)](https://21st.dev/community/components/s/kanban) · [blog](https://21st.dev/blog/react-kanban-drag-drop-components) | Only if a status column view earns its place over the filtered list (needs drag-and-drop; a sortable list first). |

## Where the app stands (2026-10-13, branch `claude/job-hunt-ui-redesign-eltszi`)

| Pattern | Surface | Status | Gap |
|---|---|---|---|
| P1 | `EmptyState.tsx` (all views) | ✅ dashed container, icon medallion, title, ≤2 sentences, primary + secondary action; Tracker distinguishes first-use / no-results / cleared queue | Discover + Templates still pass generic copy; no-results there should repeat the query and offer "Clear". |
| P2 | `PipelineStats.tsx` | ◐ six equal `Stat` tiles | Equal grid: pick one headline (Applied 30d or Response rate), demote the rest; add "vs prior 30d"; tabular figures; "Follow-ups due" is an action, not a stat (move to rail header). |
| P3 | `App.tsx` + `TrackerView.tsx` | ◐ 1200px container, two columns from 900px (queue + sticky rail) | Document still scrolls as a whole (rail is sticky, OK); Discover and Templates are single-column; no "Today" headline panel yet (#115 decision). |
| P4 | `App.tsx` tabs, Tracker filter | ✅ HDS Tabs routed by hash; filter is a `SegmentedControl` radiogroup with counts | Discover's inner Title/ATS/Live switcher should be routed (it is content, `#/discover/live` exists). |
| P5 | Tracker job row (`JobRow.tsx`) | ✅ four fixed grid slots: monogram · title + company/location · status + timing · one next action · ⋮; no status rail; everything else moved to the job page (`#/queue/<url>`, `JobDetailPage.tsx`) | — |
| P6 | Tracker right rail | ✅ sticky from 900px | Rail has no header or grouping dividers; sample banner is a notice, not overview content. |
| P7 | Tracker filter chips | ✅ counts, empties hidden | Toolbar (sort · Back up · Restore… · Export CSV) still wraps at 390px → fold into one overflow menu. |
| P8 | — | ✗ not built | Decide after the Tracker list settles. |

## How to use this

1. Before a redesign pass, pick the rows you are closing and say so in the PR body.
2. Compare screenshots (1280px + 390px) against the rule column, not against taste.
3. New pattern → add a row with a 21st.dev link and a one-line rule first, then build.
