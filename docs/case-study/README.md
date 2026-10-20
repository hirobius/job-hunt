# Roleforge screenshots for the HDS case study (#199)

PNGs at 1440 and 390 px wide (`NN-name-1440.png`, `NN-name-390.png`), fictional sample data only.
Taken on `main` at `76da544` (the calm list layout, #234), 2026-10-20. Story and decisions:
[`docs/redesign-2026.md`](../redesign-2026.md).

| Shot | What it shows | HDS features |
| --- | --- | --- |
| 01-companies | Companies (home): the track, tools, dream companies, open roles by company | Combobox, Popover, SegmentedControl, Toggle, Disclosure, flat rows |
| 02-pipeline | Pipeline: To apply, Follow up, Next 7 days, then the jobs (table at 1440, rows at 390) | Table with sortable headers, Badge, Menu, Button tones, Stack rhythm |
| 03-job-page | A job in edit: details form, tabs, rail of other jobs at 1440 | Tabs, Card, Input, Sidebar, Badge, Menu |
| 04-apply-mode | Apply mode: open, mark applied, skip, and every template filled for the job | Button hierarchy, copy rows, Disclosure |
| 05-templates | A template: variable chips, preview filled from a job | Sidebar list, Tabs, Select, token chips |
| 06-account-menu | The Menu: account, data, display | Menu, Button |
| 07-pipeline-dark | The Pipeline in dark mode (pair with 02) | Same components, dark token set via `data-theme` |
| 08-apply-mode-dark | Apply mode in dark mode (pair with 04) | Primary button and copy rows on dark surfaces |

Live company boards read as "Couldn't check" in these shots: the gallery runs offline.

## Re-shoot

```
npm run gallery -- --format=png --out=gallery/cs --pack="Design Systems"
```

Then copy the picked files from `gallery/cs/{light,dark}-{1440,390}/`. `gallery/` stays git-ignored.

## Figma

The main screens are live HDS layers in the Figma file https://www.figma.com/design/zHRUx7tk1jXw3AcSQfczlr
("HDS Apps", page Job Hunt), built 1:1 from the code. Map and frame links:
`docs/figma/README.md`.
