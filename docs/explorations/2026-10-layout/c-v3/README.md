# C v3: all features placed (2026-10-17)

Direction C (search first, two tabs: Companies · Pipeline), with every one of the 86 functions in
`../feature-inventory.md` given a home. Built from the real `@hirobius/design-system` 0.24.1
package the app ships with: HDS components, HDS tokens, the app's `base.css`. No hand-rolled
controls and no hex colours (the HDS ESLint rules pass on `src/`).

- `placement.json` lists the screens and where each function lives. The gallery and Figma read it.
- `placement-map.md` is the same list as a table.
- `screen.html?s=<id>` renders one screen (`&theme=dark`, `&full=1` lets a sheet grow to full height).
- `index.html` is the gallery: every screen in an iframe at its real width, then the map.

Run it from the repo root:

```sh
npx vite --config docs/explorations/2026-10-layout/c-v3/vite.config.ts
```

The Figma copy is the page "C · v3 — all features placed (Claude, 2026-10-17)" in file
4JPsEbmz6gG0KES0pTuUzE. It holds static captures of these screens; there is no HDS Figma library to
build from yet.

**HDS gaps found while building:**
- There's no bottom sheet, so sheets are HDS Dialogs.
- Toast has no action slot, so Remove's Undo is an inline row instead.
- There's no chart, so the weekly trend is Progress rows.
- Lucide icons ignore the `weight` prop, so a starred star shows the pressed state, not a fill.
