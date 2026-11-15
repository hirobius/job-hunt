# Cards, lists and surfaces

Card rules, list rows, the posting card, page width, outlines and the selected fill.

- **Pipeline panels (rev-3 mobile slice 1, `docs/staging/all-states.html` on `claude/staging-states`):**
  To apply, Follow up, Next 7 days and Jobs are `PipelinePanel` (HDS `Card`, header +
  `Badge count`), 24 apart. The Jobs panel holds the full-width search, the named views (#541) and Sort as select-style
  menus and a quiet **Clear filters** when non-default; phone rows are HDS entity cards (`Card.Header`
  metadata = badge row above the title: status, then Follow-up due, then the closing date (no fit chip, #538); `Card.Facts` with
  location and the job's one date (#419); `Card.Footer` next step + bordered ⋯ menu). Rhythm is HDS Stack gaps, no
  margins. **No cards within cards, ever (Adrian 2026-11-01, #449; replaced 2026-10-23's "lists are cards"):**
  one card level max. A list inside a panel (the Account menu's Companies
  list, the Apply sheet's Templates, the Application kit, Documents, the interview log,
  the job page's links) is `PipelinePanel` `ItemList` (`.rjb-items`, a hairline between rows) of `ItemRow` (a plain
  row, never an HDS `Card`); the Apply list's jobs are `JobRowList` NavList rows on one surface (#543).
  **Review new's panel has no surface of its own** (`Panel flat`): its heading, count and metadata declare the group,
  and its content lines up with the page gutter. So each Browse row is one standalone soft HDS
  `Card` (never `bordered`; the preview dialog shows the same body) in the reference anatomy (#458, Adrian 2026-11-02: `PostingCard`,
  no source or New badge on a card (#557 cuts; the detail's title block keeps the source, neutral), the title on the `title` step (the detail; a Browse card is compact, below), company, then **one fact per line** (#616, Adrian
  2026-11-12; a list card and the detail): MapPin place ("Location not stated" when none, or when it is only a mode
  word), Briefcase work mode (Remote / Hybrid / On-site, "Remote not stated", else "Work mode not stated"; on its own
  line, **left out when the place already says remote** (Adrian 2026-11-12, reversing #616's "also when the place says
  Remote": `feed/placeRemote.ts` `placeSaysRemote`, `classifyRemote` on the place text, so "Remote (US)" is never
  followed by "Remote")), Calendar posted day; **the place is a place, on one line** (Adrian 2026-11-15: Surfshark's designsystems.jobs page ran its summary into the location): `feed/placeText.ts` `placeText` cuts a run-in sentence, used by `cleanPlace` and the server's `dsjobsCatalog.ts`; a card's place line ends in an ellipsis (`.rjb-facts-place-line`, `FindList.css`), the detail keeps it whole; pinned in `feed/placeText.test.ts`, `e2e/place-line.spec.ts`; the pay line, then **one left-aligned action row (Adrian 2026-11-08,
  `PostingActions`): Save primary, Skip secondary, Open posting as an icon link, More (…) holding Not this company**,
  all `md`; no match-reason line). **A Browse card is compact (#544, redesign §5.1):** the title (bold `titleSm`, one HDS step above body since Adrian 2026-11-15; Apply's `JobRowList` titles went ui → body with it; **no underline at rest**, only on hover (`hover: hover`) and keyboard focus, `.rjb-posting-title` in `FindList.css`, Adrian 2026-11-15: a standalone heading link with its icon, so WCAG 1.4.1 holds; Apply rows were never underlined; HDS
  `lineClamp={3}`; it opens the posting: at lg it selects it, below lg it is the HDS `InlineLink` out, with the
  external icon), the company, the facts, the pay, then Save (filled, plus), Skip (grey) and More (Not this company;
  below lg only: at lg a list card carries no keys, the detail column has them, #546);
  no source or New badge, no Show description row, no Open posting key, padding `sm`. Card radius stays 12 until HDS G5
  (hds#1436). `.rjb-posting-rows` and `.rjb-preview-title` are deleted; `.rjb-card-title` stays only for the Apply
  card, the agenda and Daily picks (their quiet title link);
  `calmLayout.test.tsx` fails on any Card inside a Card.
  Pinned in `src/calmLayout.test.tsx`.

- **Shell width (Adrian 2026-10-22, the portfolio's):** `src/hds-gaps/PageShell` = HDS `Container`
  at 1048 in all (Adrian 2026-10-24, was 1180) with a `clamp(1.25rem, 5vw, 4rem)` gutter (20 on a phone, 64 from 1280), so content
  is at most 920; header, tabs and every page share it. **No outlines on surfaces (HDS 0.31 soft
  surfaces):** Cards and panels are borderless (raised fill + spacing); never pass `bordered`.
  Inputs, focus, overlays, row dividers and feedback tones keep theirs. **Selected is a fill, never an
  edge (#603, #546):** a selected / current item (the Apply rail's open job, Find's `.rjb-selected`
  card) takes `--rjb-selected-fill` (base.css: HDS **surface-accentSubtle** since Adrian 2026-11-15, the light graphite
  accent tint, graphite-50 light / graphite-800 dark; it was surface-selected, which read dark and muddy; the open
  row's title is bold, `JobRowList.css`; the selected item stays in its place, never moved to the top), distinct from hover and raised; kept on hover;
  content-secondary stays AA), no edge marker or ring. `e2e/no-outlines.spec.ts` fails on a Card or
  container box that draws an edge, and on a rail open job that is not fill only (`e2e/selectedFill.ts`,
  also in `e2e/review.spec.ts` for Find).
- **Pipeline rows (#129):** the Pipeline uses the shell width; the job page and Documents sit at
