# ADR 0007 — Track the latest HDS with its upgrade tool

- **Status:** Accepted
- **Date:** 2026-10-12
- **Supersedes:** the version pin in ADR-0005 (`^0.13.0`, "HDS's final, frozen release").
  ADR-0005's consumption model — public npm, `styles.css` scoped to `[data-hds]`, `brand-jade.css`
  remapping only the accent — carries forward unchanged.

## Context

ADR-0005 pinned `^0.13.0` because HDS had declared 0.13 its final release. That stopped being true:
HDS kept shipping and reached 0.24.1. A caret range on a 0.x version never crosses a minor, so the
app sat on 0.13.0 while HDS gained the layout primitives this app had been carrying locally (`Box`
with a token-only `sx`, `Stack`, `Text`, `Reveal`). HDS now also ships an upgrade command with a
machine-readable ledger per release.

## Decision

1. **Stay on the latest HDS release.** Bump the range when HDS ships a minor, using
   `npx @hirobius/design-system@latest upgrade`: it runs the codemods, bumps the range, installs,
   typechecks and lists what is left to do by hand. `--check` must exit 0 before a PR merges.
2. The tool's floor is 0.16.0, so the first step (#90) bumped 0.13.0 → 0.16.0 by hand — zero type
   errors, no use of the tokens 0.14–0.16 removed — then let the tool take it to 0.24.1.
3. **Brand stays one override file.** On-accent text is pinned white in `brand-jade.css`: 0.24 made
   HDS's default near-white (`#fafafa`), which is 4.42:1 on jade — under AA, caught by
   `theme.contrast.test.ts`. Adrian's call (2026-10-12) is "pure HDS with only jade overrides"; the
   rest of that move is epic #89.

## Consequences

- An HDS minor is routine maintenance, not a migration project, as long as it happens release by
  release.
- `src/ui` had no reason to exist any more and is deleted (#92); `src/hdsOnly.test.ts` keeps it gone.
