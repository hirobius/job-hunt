# HDS ask: SegmentedControl as navigation, and icon-only segments (2026-11-09)

Roleflame wants the HDS SegmentedControl look for two controls. HDS 0.39 cannot give either one
the correct semantics, so Roleflame uses the closest correct pattern for now.

## 1. A navigation form of SegmentedControl

**Need.** The top Find / Apply switch opens a page (`#/find`, `#/apply`). It must be a `nav` of
links, the open one `aria-current="page"`, so Back, deep links, new-tab clicks and screen readers
work as navigation.

**Problem.** `SegmentedControl` is a Radix toggle group with `role="radiogroup"` and `role="radio"`
items. Arrow keys move focus and select on focus. A wrapper cannot change the item role or add
`aria-current`, and a `nav` around radios still announces "radio, 1 of 2".

**Ask.** `SegmentedControl` `as="nav"` (or a `SegmentedNav`): items render as `<a href>` (or
`asChild`), the current one `aria-current="page"`, Tab moves between them, no arrow-key selection.
Same rail, segment and accent styles.

**Now.** `src/App.tsx` renders a `nav` of links; `.rjb-segs` / `.rjb-seg` in `src/theme/base.css`
draw the rail and the selected segment with the same HDS tokens. Remove both when HDS ships this.

## 2. Icon-only segments

**Need.** Review new's Browse / Deck switch is two icon-only segments (list, stack of cards), each
with an accessible name and a tooltip.

**Problem.** `HdsSegmentedOption.label` is a string and is the visible text. There is no icon slot
and no icon-only mode.

**Ask.** `icon?: LucideIcon` on an option, and `iconOnly` on the control: the label becomes the
accessible name and the tooltip.

**Now.** `src/ReviewView.tsx` uses two HDS `Button iconOnly` with `aria-pressed` in a
`role="group"`, each in an HDS `Tooltip`.
