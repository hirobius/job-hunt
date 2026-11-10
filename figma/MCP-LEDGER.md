# Figma MCP ledger

Every Figma MCP call an agent session makes for the Roleflame Figma sync (`figma/README.md`) is
logged here **before** the call: add the row, make the call, then fill in its result. A call that
is not in the ledger was not budgeted. Format after hirobius/hds `figma/MCP-LEDGER.md`.

## Budget

- **200 MCP calls a day and 10 a minute** on the Figma Professional plan. Count every `use_figma`
  call, read or write.
- **Never retry a rate-limit error.** Stop and report it.
- **Write target:** "roleflame — app states" `9VCvYGN0pz9faveIhSn6Kn` only, pages Phone 390 and
  Desktop 1440. The HDS library `2VgBbVpKiDnu0aftJEVyBQ` is read, never written or published. The
  page "Archive — screenshots" is never touched.
- A full push of 130 frames costs 13 `use_figma` writes (`npm run figma:push -- --emit`), plus the
  `figma-use` and `figma-generate-design` skill loads when they are not loaded yet. A changed frame
  costs one write for its batch. A Figma read-back (`--emit-read`) costs 2 reads.

## How to log

One section per session: `## <date> · <branch or PR>`, then one row per call, numbered from 1 in
the order made. End the section with the session total.

## 2026-11-10 · claude/figma-sync-drift (deterministic code-to-Figma sync)

Rows 1 to 3 were made before this ledger existed; they are logged here after the fact.

| #   | Tool              | Kind  | Target                                                                                           | Why                                                                   | Result                                                                                                                                                                                                         |
| --- | ----------------- | ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `get_figma_skill` | read  | figma-use SKILL.md                                                                               | required before use_figma                                             | OK                                                                                                                                                                                                             |
| 2   | `create_session`  | read  | 9VCvYGN0pz9faveIhSn6Kn                                                                           | session for the sync                                                  | OK                                                                                                                                                                                                             |
| 3   | `use_figma`       | read  | 9VCvYGN0pz9faveIhSn6Kn page Phone 390                                                            | pages, frames, HDS component keys in use                              | OK. 4 pages, 75 top-level nodes; keys in `figma/hds-components.json`; shared plugin data API present                                                                                                           |
| 4   | `get_figma_skill` | read  | figma-generate-design SKILL.md                                                                   | required before visible writes                                        | OK                                                                                                                                                                                                             |
| 5   | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Phone 390: trial push, `390/Job / Not found / Unknown route` light + dark | test the runtime on one frame pair before the full push               | OK. updated 2 (adopted 16:15255, 16:9375 in place) · created 0 · removed 0; read-back = spec projection `12bd878d` for both. Screenshot: a toned Text kept its placeholder (fixed in the runtime before row 6) |
| 6   | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Phone 390: `push-01.js` (22 frames)                                       | full push, batch 1 of 6                                               | OK, 22 updated in place (ids kept) · 0 created · 0 removed. Read-back = spec for 8; 14 differ (Apply, Add job): diagnosed in row 7, rebuilt later                                                              |
| 7   | `use_figma`       | read  | 9VCvYGN0pz9faveIhSn6Kn node 13:7047 (`390/Apply / 1 job — light`)                                | read the frame's projection tree to find why it differs from the spec | OK. A Textarea with no text in the spec read back as "Message": the no-text marker held a NUL, which plugin data drops. Fixed (`<none>`); fields now take value or placeholder                                 |
| 8   | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Phone 390: `push-01.js`                                                   | full push after the fix, batch 1 of 6                                 | OK. 22 updated in place · 0 created · 0 removed; all 22 read back = spec                                                                                                                                       |
| 9   | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Phone 390: `push-02.js` (24 frames)                                       | full push, batch 2 of 6                                               | OK. 24 updated in place; all read back = spec                                                                                                                                                                  |
| 10  | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Phone 390: `push-03.js` (22 frames)                                       | full push, batch 3 of 6                                               | OK. 22 updated in place; all read back = spec. Phone 390 done: 68 of 68                                                                                                                                        |
| 11  | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Desktop 1440: `push-04.js` (16 frames)                                    | full push, batch 4 of 6                                               | OK. 15 updated in place (one frame of the batch was cut when the script was copied; it went in row 12); all read back = spec                                                                                   |
| 12  | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Desktop 1440: rest of the push (`--emit` after record)                    | full push, remaining Desktop 1440 frames, part 1 of 3                 | OK. 21 updated in place; all read back = spec                                                                                                                                                                  |
| 13  | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Desktop 1440: remaining frames, part 2                                    | full push, remaining Desktop 1440 frames, part 2 of 3                 | OK. 22 updated in place; all read back = spec                                                                                                                                                                  |
| 14  | `use_figma`       | write | 9VCvYGN0pz9faveIhSn6Kn Desktop 1440: remaining frames, part 3                                    | full push, remaining Desktop 1440 frames, part 3 of 3                 | OK. 4 updated in place; all read back = spec; screenshot of 16:10771. Push done: 130 of 130 frames owned and recorded in `figma/snapshot.json`                                                                 |
| 15  | `use_figma`       | read  | 9VCvYGN0pz9faveIhSn6Kn Phone 390: `read-phone-390.js`                                            | `check:figma-drift --figma`, page 1 of 2                              | OK. 68 owned frames read back                                                                                                                                                                                  |
| 16  | `use_figma`       | read  | 9VCvYGN0pz9faveIhSn6Kn Desktop 1440: `read-desktop-1440.js`                                      | `check:figma-drift --figma`, page 2 of 2                              | OK. 62 owned frames read back; `check:figma-drift --figma` 0 drift on all 130                                                                                                                                  |

## Rework (after review of PR #530)

The full push above (rows 6 to 14) overwrote the hand-checked frames on Phone 390 and Desktop 1440. That was wrong. Adrian restores those pages from version history. From here, the sync writes only to the page "Sync preview".

| #   | Tool             | Mode  | Target                                                                        | Why                   | Result                                                                                                                       |
| --- | ---------------- | ----- | ----------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 17  | `use_figma`      | write | 9VCvYGN0pz9faveIhSn6Kn Sync preview: `push-01.js` (5 frames)                  | fidelity sample push  | OK. Page created; 5 frames created (37:3, 37:3075, 37:4477, 37:4538, 37:4582); all 5 read back = spec. No other page touched |
| 18  | `get_screenshot` | read  | 9VCvYGN0pz9faveIhSn6Kn Sync preview: 5 sample frames (5 calls, rows 18 to 22) | fidelity gate renders | OK. 5 PNGs. Scores: min 0.600, median 0.921, 2 of 5 below 0.9                                                                |

### Fidelity iterations (same 5 frames, stop at 150 calls a day)

| #     | Tool             | Mode  | Target                               | Why                                                                                                  | Result                                                                     |
| ----- | ---------------- | ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 23    | `use_figma`      | write | Sync preview: 5 sample frames        | iteration 2: fill-width text, logo, nav segment, card fills, button icons, phone dialog fills screen | OK. 5 updated in place; all read back = spec                               |
| 24-28 | `get_screenshot` | read  | Sync preview: 5 sample frames        | iteration 2 scores                                                                                   | OK. min 0.891, median 0.935, 1 of 5 fail (390 Sign-in Email)               |
| 29    | `use_figma`      | write | Sync preview: 390 Sign-in Email only | iteration 3: wordmark not clipped, play button top-right                                             | OK, but read-back differs from spec (b5293655)                             |
| 30    | `get_screenshot` | read  | Sync preview: 37:4582                | iteration 3 score                                                                                    | 0.891 (wordmark still clipped)                                             |
| 31    | `use_figma`      | write | Sync preview: 390 Sign-in Email only | iteration 4: wordmark height, space below it; return read-back tree                                  | OK. Read-back = spec once the hand copy is fixed (S[141] is div)           |
| 32    | `get_screenshot` | read  | Sync preview: 37:4582                | iteration 4 score                                                                                    | 0.892                                                                      |
| 33    | `use_figma`      | write | Sync preview: 37:4582 only           | iteration 5: Input and Button at size md                                                             | No change: the patch searched only the first layer (the empty toast layer) |
| 34    | `get_screenshot` | read  | Sync preview: 37:4582                | iteration 5 score                                                                                    | 0.892 (unchanged)                                                          |
| 35    | `use_figma`      | write | Sync preview: 37:4582 only           | iteration 5b: same, all layers                                                                       | OK. Input sm to md, 2 Buttons sm to md                                     |
| 36    | `get_screenshot` | read  | Sync preview: 37:4582                | iteration 5b score                                                                                   | 0.914. All 5 pass: min 0.914, median 0.935                                 |
| 37    | `use_figma`      | write | Sync preview: 5 sample frames        | final: full push of the committed runtime                                                            | OK. 5 updated in place; all 5 read back = spec                             |
| 38-42 | `get_screenshot` | read  | Sync preview: 5 sample frames        | final scores                                                                                         | OK. min 0.914, median 0.935, 0 of 5 fail                                   |

### Scale-out to all 130 frames (Sync preview only)

Plan (`push.mjs --emit-lite`): 1 install call (runtime and HDS keys stored as shared plugin data on Sync preview), then 4 batch calls (23, 38, 28 and 36 frames), each in its own section "batch NN". One screenshot of each section scores the whole batch (`fidelity.mjs --crop`).

| #   | Tool             | Mode  | Target                                     | Why                                        | Result                                                         |
| --- | ---------------- | ----- | ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| 43  | `use_figma`      | read  | Sync preview                               | probe: can code run from a string; page id | OK. `new Function` works; page 37:2                            |
| 44  | `get_screenshot` | read  | Sync preview page 37:2                     | probe: one screenshot for many frames      | OK. 2040x5132 at scale 1; crops give the same 5 scores         |
| 45  | `use_figma`      | write | Sync preview: shared plugin data           | install runtime and HDS keys               | OK. runtime be0b1e93 (17 260 chars) stored and checked         |
| 46  | `use_figma`      | write | Sync preview: section batch 01 (23 frames) | scale-out                                  | NOT RUN: stopped here (agent context limit, not the MCP limit) |
| 47  | `get_screenshot` | read  | section batch 01                           | batch 01 scores                            | NOT RUN                                                        |

Session total: 45 calls (3 in the scale-out: 2 probes, 1 install). Before: 42 calls (rework: 7 writes to Sync preview, 19 screenshots; limit 150 a day). Before the rework: 16 calls (3 skill and session loads, 4 `use_figma` reads, 9 `use_figma` writes). No publish. No write to the HDS library. The page "Archive — screenshots" was not touched. Nothing was deleted: all 130 frames were adopted in place (node ids kept) and tagged `roleflame/owner = roleflame-figma-sync`.
