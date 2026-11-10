# Figma sync: roleflame — app states

Figma file: https://www.figma.com/design/9VCvYGN0pz9faveIhSn6Kn ("roleflame — app states"),
pages **Phone 390** and **Desktop 1440**, 130 frames. The code is the source. The frames are built
from it, and a check fails when they differ. The pattern follows hirobius/hds
(`check:figma-drift`, `figma/snapshot.json`, `figma/MCP-LEDGER.md`).

## Files

| File                             | What it is                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/figma/states.mjs`       | The screen fixtures: 65 named states with fixed data, a fixed clock (Tue, Nov 10, 2026, 17:00 UTC) and no network. One state = one frame per width and theme.                                                                                                                                                                                            |
| `scripts/figma/extract.mjs`      | Renders each state in Playwright (Vite dev server) at 390 and 1440, light and dark, and writes `figma/spec.json`.                                                                                                                                                                                                                                        |
| `scripts/figma/walk.js`          | The in-page walker. It reads each visible element's React fiber chain, so HDS components are found by identity (the exports of the HDS module the app runs). The app carries no markers and no extra runtime code.                                                                                                                                       |
| `figma/spec.json`                | Per frame: the tree (HDS component, variant and props, text, auto layout direction, gap and padding, token classes), a `checksum` and a `projection` checksum. No pixel positions. Generated; do not edit. One frame per line; a frame whose copy holds an e-mail address outside example.com carries a reviewed `pii-allow` note for the pre-push scan. |
| `scripts/figma/push.mjs`         | Plans a push, writes the `use_figma` scripts, and records their receipts in `figma/snapshot.json`.                                                                                                                                                                                                                                                       |
| `scripts/figma/figma-runtime.js` | The code each `use_figma` script runs in Figma.                                                                                                                                                                                                                                                                                                          |
| `figma/hds-components.json`      | The HDS library (`2VgBbVpKiDnu0aftJEVyBQ`) component and icon keys the push makes instances of.                                                                                                                                                                                                                                                          |
| `figma/snapshot.json`            | What the last push put in Figma: per frame its node id, `checksum` and `projection`. It carries its own FNV-1a checksum, so a hand edit is refused.                                                                                                                                                                                                      |
| `scripts/check-figma-drift.mjs`  | The drift check.                                                                                                                                                                                                                                                                                                                                         |
| `figma/MCP-LEDGER.md`            | Every Figma MCP call, logged before it is made.                                                                                                                                                                                                                                                                                                          |

## Check (`npm run check:figma-drift`)

Offline, part of `npm run verify`. It renders the 130 frames again and compares each checksum
with `figma/snapshot.json`. It also fails when `figma/spec.json` is not what the code renders now.
A frame that is added, removed or changed in code since the last push is drift.

1. If the check fails because you changed the UI, run `npm run figma:spec`.
2. Push the changed frames (below).
3. Commit `figma/spec.json`, `figma/snapshot.json` and the ledger rows.

Exit codes: 0 no drift, 1 drift or a bad snapshot checksum, 2 no snapshot yet.

It needs Playwright's Chromium (`PW_CHROMIUM_PATH`, else `/opt/pw-browsers/chromium`, else
Playwright's own) and takes about 3 minutes. `FIGMA_SPEC_WORKERS` sets the parallel pages
(default 4).

**CI.** GitHub Actions is off in this repo (owner preference). If it comes back, add this step
after `npm ci` and `npx playwright install --with-deps chromium`:

```yaml
- run: npm run check:figma-drift
```

**Figma mode.** `node scripts/check-figma-drift.mjs --figma <read.json>…` compares Figma itself
with the snapshot:

1. Run `npm run figma:push -- --emit-read <dir>`. It writes one read script per page.
2. Log each call in the ledger, then run each script with `use_figma` (2 reads).
3. Save each result as JSON, then run the check with the files.

A frame that reads back differently was edited in Figma after the push. The read-back sees each
node's name (the HDS component), each leaf's text and each container's direction.

## GAP frames

Two states use parts that HDS does not have yet. Their spec entries carry `gap`:

- `Job / Not found / Unknown route`: hds#1425, SegmentedControl has no "none selected" state.
- `Dialogs / Documents / Template open`: hds#1426, no template editor with inline variable chips.

In Figma mode these frames may differ (a local `GAP: …` frame). The check lists them as expected
and does not count them. Offline, they are checked like every other frame.

Any element that has no HDS library component is drawn as a local frame named after it, with the
`roleflame/leaf` plugin data. This is part of the spec, so it is not drift.

## Push

Caution: the push writes only the Roleflame file. It never publishes or edits the HDS library, and
it never touches the "Archive — screenshots" page.

1. Run `npm run figma:push -- --plan`. It lists the frames to create, update and remove.
2. Run `npm run figma:push -- --emit <dir>`. It writes `push-NN.js` (under 50,000 characters each).
3. Add one ledger row per script, then run each script with `use_figma` on file `9VCvYGN0pz9faveIhSn6Kn`.
4. Save each result as `<dir>/receipt-NN.json`.
5. Run `npm run figma:push -- --record <dir>/receipt-*.json`. It refuses a frame whose Figma read-back differs from the spec.
6. Run `npm run check:figma-drift`, then commit.

The push is idempotent. It owns only frames tagged with shared plugin data `roleflame/owner =
roleflame-figma-sync` (plus `key` and `checksum`). On the first push it adopts the frame with the
same name, so node ids and links stay. It rebuilds a frame in place, and it removes an owned frame
only when its key leaves the spec. Untagged nodes (row labels, notes) stay.

How a frame is built: an auto layout frame per container (direction, gap and padding from the
spec), an HDS library instance per leaf component (variant from the code props, text set on the
instance), an `Icon/<name>` instance per icon. Dark frames take the dark variable mode.

## Frames that are not fully deterministic

- `Find / Loading (scan running)`: the job source never answers, so the scan stays running. Its spinner is
  held by reduced motion.
- `Find / Signed out / 0 jobs (first run)`: same, with the scan that runs on open.
- `Sign-in / Signed in`: the screen hands over after 600 ms. The fixture drops that one timer.
- `Sign-in / Keyboard open`: drawn at 390 x 400 (the keyboard is not simulated).

## Sync preview page (only write target)

The push writes only to the page "Sync preview". The runtime refuses any other page. The hand-checked pages Phone 390 and Desktop 1440 are never written. Each frame is the viewport size (390x844 or 1440x900). Overlays (dialogs, menus, toasts) sit in absolute "layer: …" holders over the page; a dialog gets a scrim.

## Fidelity gate

The drift check proves structure only. The fidelity gate proves the frame looks like the app.

1. Run `npm run check:figma-fidelity -- --capture .fidelity/live [--only <re>]`.
2. Save `get_screenshot` of each Sync preview frame as `.fidelity/figma/<slug>.png`.
3. Run `npm run check:figma-fidelity -- --compare .fidelity/figma .fidelity/live`.

The score is the share of matching pixels (pixelmatch, threshold 0.15, at half size). A frame fails below 0.9. The script exits 1 on any fail or missing render.

Sample result (5 frames, 2026-11-10, after the fidelity rework): min 0.914, median 0.935, 0 of 5 fail.

| Frame                                | Score |
| ------------------------------------ | ----- |
| 1440 Apply / 0 jobs — light          | 0.979 |
| 1440 Apply / Template dialog — light | 0.935 |
| 390 Apply / 0 jobs — light           | 0.925 |
| 390 Job / Not found — light          | 0.945 |
| 390 Sign-in / Email — light          | 0.914 |

The runtime adds what the spec tree does not carry: the brand logo (from `public/favicon.svg`), the selected nav segment, card fills, HDS icon instances in buttons, and md as the default control size. Text fills the width of its column or shares the row. A phone dialog fills the screen. The other 37 frames (batch 04, 390 Find, Job, Menus, Sign-in) are not pushed yet.

## CI steps (not in `npm run verify`)

Add these as separate CI steps. This PR does not edit `.github/workflows`.

```yaml
- run: npm run check:figma-drift
```

The fidelity gate needs Figma MCP access, so run it by hand or in a job with Figma credentials.

## Risk: React internals

`scripts/figma/walk.js` reads React's private DOM keys (`__reactFiber$…`, `__reactProps$…`). These are not a public API. A React upgrade can rename them. Then the walker throws "React fiber keys … not found". The test `src/figmaSync.test.ts` also fails if React stops setting those keys. If this happens, update the walker before you run the sync.

## Scale-out to all 130 frames: resume plan

Status (2026-11-10, later): 93 of 130 frames on Sync preview (5 samples, batch 01, 02 and 03). The runtime in the repo and on the page is `ef53726a`. Batch 04 is not pushed. Batch 03 part 01 (4 frames) is re-pushed with `ef53726a`; parts 02 to 08 still show `390ef963` output.

390 fix status (ledger rows 88 to 97). The walker now records layout data outside `checksum` and `projection` (spec checksums did not change): `ty` (measured font size and line height of a leaf or text run), `ic` (the lucide icon the app draws in a leaf), `rv` (flex `*-reverse`) and `gc` (grid columns). The runtime uses them:

- On a phone, text takes the measured `ty` size and line height.
- A wrap row keeps each child at its own width. A grid with 2 or more columns is a wrap row with equal cells (read back as a column).
- Icon-only buttons take the drawn icon, mapped to HDS names (`ellipsis` to `more-horizontal`, `list-filter` to `filter`, and others in `ICON_ALIAS`). A button shows one icon.
- Badge, Tag, Avatar and IconButton hug their content.
- Toast items get the floating surface, a border and 8 px radius.
- Input, Select and Textarea set their label, helper and value text (no "Placeholder").
- A reversed flex box (the phone dialog footer) is drawn reversed and read back in DOM order.

Re-scores so far: 390 Apply / 1 job — light 0.824, — dark 0.834 (still below 0.9). Causes still open, all in the runtime:

1. The button icon sits on the right. The first unnamed icon boolean on the HDS Button is the trailing one, so swap the order in `setIcon`.
2. The middle button of a row ("Open application") does not grow. The app gives it `flex-1`.
3. Icon-only buttons (pager arrows, Account) show no surface or size.
4. Toast buttons (Open, Undo) stack in a column and fill the width. The Disclosure ("Templates") has no card surface.

Resume: fix these, re-emit with `--emit-lite <dir> --start 3 --skip '^1440/|^390/(Find|Job|Menus|Sign-in) '`, patch or install the runtime, run parts 01 to 08, score, then batch 04 with `--start 4 --skip '^1440/|^390/(Apply|Dialogs|Feedback) '` (6 parts, 36 frames). A runtime change can go up as a hash-checked line patch (old and new hash in the script) instead of the 27 k install script.

**Snapshot decision: no `figma/snapshot.json` until all 130 frames are on the page.** The batch 02 commit recorded only its own 37 receipts into an empty snapshot (the samples and batch 01 receipts were never saved). A partial snapshot makes `check:figma-drift` report every other frame as drift (93 false fails), which hides real drift. With no snapshot the check exits 2 ("no snapshot yet"), which is the true state. Each batch now commits its receipts in `figma/receipts/` (`batch-02.json`, `batch-02-menus.json`, `batch-03.json`; 65 frames). After the last batch, run `--emit-read`, save the read of Sync preview as `figma/receipts/read-all.json` (it carries id, checksum and projection for every owned frame, so it also covers the samples and batch 01), then run `npm run figma:push -- --record figma/receipts/*.json` once and commit the full snapshot.

Light menu fix (runtime `390ef963`, ledger rows 76 and 77): a menu or popover is a plain `div` of rows, so the runtime took it for an alert dialog and added a scrim (ink at 60%, rgb 112,116,125 over white). Now only an overlay that holds an HDS component (Button, Text, …) counts as a dialog. Re-scores: More menu 0.959, Account menu signed in 0.983, signed out 0.979.

Batch 03 (28 frames, section 63:7851, ledger rows 78 to 87): all 28 read back = spec. Scores: min 0.794, median 0.899, 15 of 28 fail. The fails are runtime-level and not fixed yet (next step, before batch 04, which shares the same 390 layouts):

- Phone text is too large: nav segments, buttons and inputs use the desktop text size (Apply list frames: 1 job, Filters open, Many jobs, Templates open, Add job; 0.79 to 0.83).
- A wrap row (`l.wrap`) gives each child `layoutGrow`, so the second item drops off (Mark applied / Not a fit) and the icon-only buttons stretch.
- Icon-only buttons show the default `+` icon (no `icon` prop in the spec: Star, More actions, pager arrows).
- A Badge fills the column width ("Saved"), and Input shows "Placeholder" (no placeholder text set); the Select pair is missing.
- The phone toast (`ol` > `li`) gets no surface and no border (1 job, Toast / Skip with Undo 0.865 and 0.878).
- Merge prompt (0.859, 0.855): the dialog title uses the large title size and the footer order is reversed (the app puts the primary action first on a phone).
- Documents / With starters — dark 0.899: just under the line, same text-size cause.

Batch 01 scores (23 frames): 0 of 23 below 0.9. The 8 old fails were re-pushed with `482b2970` (ledger rows 56 to 59): min 0.910, median 0.963.

| Frame (1440)                           | Before | After |
| -------------------------------------- | ------ | ----- |
| Apply / 1 job — dark                   | <0.9   | 0.933 |
| Apply / 1 job — light                  | <0.9   | 0.910 |
| Apply / Many jobs — dark               | <0.9   | 0.932 |
| Apply / Templates open — dark          | <0.9   | 0.915 |
| Dialogs / Documents / Empty — light    | 0.68+  | 0.990 |
| Dialogs / Documents / Template — light | 0.68+  | 0.967 |
| Dialogs / Documents / Starters — light | 0.68+  | 0.983 |
| Dialogs / Legal / Privacy — light      | 0.86   | 0.963 |

The fixes, all in the runtime:

- The walker records each container's box `sz` = [w, h, x, y] from the app DOM. `sz` is layout data only: it is outside `checksum` and `projection`, so the snapshot does not drift.
- A dialog takes its measured box (Documents 896x868, Legal 672x868), not a 512 px cap.
- The dialog surface binds `color/surface/floating` (the app's `bg-popover`, white in light mode).
- A container in a row takes its measured width (the 349 px sidebar, the 551 px detail pane). Each container takes its measured height (row density). The frame padding comes from the measured page column.

Batch 02 (37 frames, section 55:3875, ledger rows 65 to 73): done in 6 scripts of 15 k chars or less. All 37 read back = spec. Scores: min 0.025, median 0.963, 3 of 37 fail. The 3 fails are the light menu frames (Find / More menu open, Menus / Account menu / Signed in and Signed out). A flat grey layer (rgb 112,116,125) covers each whole frame; the dark twins pass. Fixed in runtime `390ef963` (see the menu fix above).

`MAX_SCRIPT` is now 15,000, and `--emit-lite --start N` writes every part to section "batch NN" (files `batch-NN-part-MM.js`), so no hand edit of `section` is needed. Read each file and pass its text as is; run `node --check` on a copy wrapped in `(async function(){ … })` first.

Old note: batch 02 attempt (ledger row 64) failed: the hand copy of the 45 k script had a syntax error, so nothing ran. Emit it with `--start 2` so the section is "batch 02"; the 12-frame second script comes out as "batch 03", so set its `section` to "batch 02" before the call. Prefer smaller scripts: each hand copy is a risk. Old note: batch 02 (38 frames). With `sz` it is 2 scripts (26 + 12 frames, 45 k + 16 k chars), so 3 calls with the screenshot.

1. Run `node scripts/figma/push.mjs --emit-lite .figma-lite --start <first batch number> --skip '<regex of frames already on the page>'`. For batch 02 the skip is `^390/|^1440/(Apply|Dialogs|Feedback) |^1440/Find / Browse / long title \+ no company — dark$`.
2. If the runtime changed, run `install.js` first (1 `use_figma` call). The batch stub refuses a runtime with another checksum.
3. Run each `batch-NN.js` (1 `use_figma` call each). Each batch writes into its own section "batch NN", 6 frames to a row.
4. Take 1 `get_screenshot` of the section id in the receipt. Crop each frame by its `box` from the receipt, and save it as `<slug>.png`.
5. Run `npm run check:figma-fidelity -- --compare <crops> <captures>`. Fix fails in `figma-runtime.js`, not per frame. Re-install, then re-run the batch.

Batch plan (125 frames, 4 batches, about 9 MCP calls in all):

| Batch    | Frames                                         | Script size                     |
| -------- | ---------------------------------------------- | ------------------------------- |
| install  | runtime + HDS keys                             | 21 k chars (done once; current) |
| batch 01 | 23 (1440 Apply, Dialogs, Feedback, Find start) | 47 k                            |
| batch 02 | 38 (1440 Find, Job, Menus, Sign-in)            | 46 k                            |
| batch 03 | 28 (390 Apply, Dialogs, Feedback)              | 44 k                            |
| batch 04 | 36 (390 Find, Job, Menus, Sign-in)             | 38 k                            |

Theme: `dress()`, `overlay()` and the frame fill bind HDS Semantic variables (`color/surface/page`, `muted`, `inverse`, `raised`, `color/content/inverse`, `secondary`). Each frame sets the Semantic collection to its Light or Dark mode. The dialog scrim stays a literal (ink at 60%): a bound scrim came out opaque in light mode. An alert dialog with no DialogOverlay gets a scrim marked `chrome`, so the read-back ignores it.
