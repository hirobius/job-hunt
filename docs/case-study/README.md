# Roleforge screenshots for the HDS case study (#199)

PNGs at 1440 and 390 px wide (`NN-name-1440.png`, `NN-name-390.png`), fictional sample data only.
Taken on `main` at `9e3f857` (plus the gallery script changes in this PR).

> **Provisional.** Re-take after the design-feedback PRs (#191–#193) land, then update the SHA here.

| Shot | What it shows | HDS features |
| --- | --- | --- |
| 01-today | Today: follow-ups due, next 7 days, quick add, Insights | StatusListItem rows, Input, Button, metric tiles, Progress, Disclosure, Callout |
| 02-pipeline | Pipeline: table at 1440, cards at 390 | Table with sortable headers, Badge/Tag status, Menu, SegmentedControl-style filters, Button tones |
| 03-job-page | A job: facts, tabs, rail of other jobs at 1440 | Tabs, MetadataList, Sidebar, Button, Badge, Menu |
| 04-discover | Discover with the Design Systems track | Combobox, Popover, SegmentedControl, Tabs, Card grid, Tag |
| 05-templates | Templates list and editor | Sidebar list, Tabs, Textarea, token chips |
| 06-account-menu | Account menu (sync, backup, theme) | Menu, Button, Toast host |
| 07-today-dark | Today in dark mode (pair with 01) | Same components, dark token set via `data-theme` |
| 08-job-screening-dark | Job Screening tab in dark mode | Tabs, Card, Badge, form controls on dark surfaces |

## Re-shoot

```
npm run gallery -- --format=png --out=gallery/cs --pack="Design Systems"
```

Then copy the picked files from `gallery/cs/{light,dark}-{1440,390}/`. `gallery/` stays git-ignored.

## Figma

The five main screens sit in the Figma file https://www.figma.com/design/mJgRxGXwbd4j9jj96qpdFI,
one frame each, labelled with the source files that render them. Map and frame links:
`docs/figma/README.md`.
