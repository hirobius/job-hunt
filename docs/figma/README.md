# Figma screens (#197)

Figma file: https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr ("HDS Apps", page Job Hunt).

One frame per main screen, built 1:1 from the code with HDS library instances (live layers, not
images), linked here to its route and the source files that render it. These are plain links, not Figma Code Connect: Code Connect
needs a Figma Organization or Enterprise plan and the team is on Professional (decided 2026-10-19).
The map lives in `src/figmaScreens.ts`; `src/figmaScreens.test.ts` fails if a frame names a file or
component that no longer exists, or if this page drifts from the map.

| Screen                    | Frame (1440)                                                        | Phone frame (390)                                                   | Route                      | Source                                                                        |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Pipeline                  | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=23-4039 | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=23-4122 | `#/queue`                  | `src/TrackerView.tsx`, `src/JobListCard.tsx` (every width)                    |
| Job page                  | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=26-4057 | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=20-3868 | `#/queue/<jobId>`          | `src/JobPage.tsx`                                                             |
| Discover (Companies tab)  | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=26-5210 | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=26-5353 | `#/discover`               | `src/DiscoverView.tsx`, `src/TileGrid.tsx`                                    |
| Documents (was Templates) | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=23-6494 | https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr?node-id=23-6267 | `#/copy-deck/<documentId>` | `src/DocumentsView.tsx`, `src/DocumentsLibrary.tsx`, `src/DocumentEditor.tsx` |

Shots: `docs/figma/<screen>-1440.png` and `-390.png`, taken on HDS `0.24.1` (the pin is now `0.26.2`). Re-take
them after an HDS upgrade or a layout change: seed sample data plus the Design Systems track (as
`npm run gallery -- --format=png --pack="Design Systems"` does), open each route above, then replace
the PNGs here. They are the code-side reference for checking the Figma frames.

The Documents frames are the editor (a cover letter at `#/copy-deck/<documentId>`); the library list
at `#/copy-deck` is frame 24:3976 (1440) and 24:4132 (390).

Today (`#/today`) was retired in #236: the route redirects to Companies and its follow-ups live in
the Pipeline, so it has no frame. The first screenshot-only file ("RoleForge screens",
mJgRxGXwbd4j9jj96qpdFI) is superseded by HDS Apps.

## References

Start every design thread at the **References** page of the HDS Figma file:
https://www.figma.com/design/2VgBbVpKiDnu0aftJEVyBQ/HDS-Tokens-Components?node-id=2190-2

20 annotated shots of calm list and job tracker apps, grouped by the screen they inform (Pipeline,
Job page, Companies, Templates). Each card says what to take and what to leave. The shots are from
open-source apps (Planify for Things, JobSync for Teal, Twenty, Actual and others); paste shots of
closed apps such as Linear or Teal into the matching section as new cards.
