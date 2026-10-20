# Figma screens (#197)

Figma file: https://www.figma.com/design/mJgRxGXwbd4j9jj96qpdFI ("Roleforge screens", Hirobius team).

One frame per main screen: the screen at 1440 and 390 px (light, fictional sample data), its route
and the source files that render it. These are plain links, not Figma Code Connect: Code Connect
needs a Figma Organization or Enterprise plan and the team is on Professional (decided 2026-10-19).
The map lives in `src/figmaScreens.ts`; `src/figmaScreens.test.ts` fails if a frame names a file or
component that no longer exists, or if this page drifts from the map.

| Screen                    | Frame                                                            | Route                      | Source                                                                         |
| ------------------------- | ---------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| Pipeline                  | https://www.figma.com/design/mJgRxGXwbd4j9jj96qpdFI?node-id=1-10 | `#/queue`                  | `src/TrackerView.tsx`, `src/JobsTable.tsx` (1440), `src/JobListCard.tsx` (390) |
| Job page                  | https://www.figma.com/design/mJgRxGXwbd4j9jj96qpdFI?node-id=1-18 | `#/queue/<jobId>`          | `src/JobPage.tsx`                                                              |
| Discover (Companies tab)  | https://www.figma.com/design/mJgRxGXwbd4j9jj96qpdFI?node-id=1-26 | `#/discover`               | `src/DiscoverView.tsx`, `src/TileGrid.tsx`                                     |
| Documents (was Templates) | https://www.figma.com/design/mJgRxGXwbd4j9jj96qpdFI?node-id=1-34 | `#/copy-deck/<documentId>` | `src/DocumentsView.tsx`, `src/DocumentsLibrary.tsx`, `src/DocumentEditor.tsx`  |

Shots: `docs/figma/<screen>-1440.png` and `-390.png`, taken on HDS `0.24.1` (the exact pin). Re-take
them after an HDS upgrade or a layout change: seed sample data plus the Design Systems track (as
`npm run gallery -- --format=png --pack="Design Systems"` does), open each route above, then replace
the PNGs here and the image fills in the matching frames.

Today (`#/today`, frame `1-2`) was retired in #236: the route redirects to Companies and its
follow-ups live in the Pipeline. The frame stays in the Figma file as history; it is not mapped.

## References

Start every design thread at the **References** page of the HDS Figma file:
https://www.figma.com/design/2VgBbVpKiDnu0aftJEVyBQ/HDS-Tokens-Components?node-id=2190-2

20 annotated shots of calm list and job tracker apps, grouped by the screen they inform (Pipeline,
Job page, Companies, Templates). Each card says what to take and what to leave. The shots are from
open-source apps (Planify for Things, JobSync for Teal, Twenty, Actual and others); paste shots of
closed apps such as Linear or Teal into the matching section as new cards.
