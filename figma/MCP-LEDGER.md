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

| #   | Tool             | Mode  | Target                           | Why                                        | Result                                                 |
| --- | ---------------- | ----- | -------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| 43  | `use_figma`      | read  | Sync preview                     | probe: can code run from a string; page id | OK. `new Function` works; page 37:2                    |
| 44  | `get_screenshot` | read  | Sync preview page 37:2           | probe: one screenshot for many frames      | OK. 2040x5132 at scale 1; crops give the same 5 scores |
| 45  | `use_figma`      | write | Sync preview: shared plugin data | install runtime and HDS keys               | OK. runtime be0b1e93 (17 260 chars) stored and checked |

Rows 46 and 47 of the first plan were not run. They are replaced by the rows below.

#### Dark theme fix and batch 01

| #   | Tool              | Mode  | Target                                                 | Why                                                      | Result                                                                                                                |
| --- | ----------------- | ----- | ------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 46  | `create_session`  | read  | 9VCvYGN0pz9faveIhSn6Kn                                 | session for this task                                    | OK                                                                                                                    |
| 47  | `get_figma_skill` | read  | figma-use SKILL.md                                     | required before use_figma                                | OK                                                                                                                    |
| 48  | `use_figma`       | read  | HDS library variable collections                       | names of the Semantic colour variables                   | OK. Collection `Hirobius/Semantic`, 59 colour variables                                                               |
| 49  | `use_figma`       | write | Sync preview: shared plugin data                       | install runtime with Semantic variable fills             | OK. runtime bb13e007 stored and checked                                                                               |
| 50  | `use_figma`       | write | Sync preview: section batch 01 (23 frames)             | scale-out, batch 1 of 4                                  | OK. 23 created in section 47:425; all 23 read back = spec                                                             |
| 51  | `get_screenshot`  | read  | section 47:425                                         | batch 01 scores                                          | min 0.081, median 0.907, 10 of 23 fail. Dark frames pass; light dialogs fail: the bound scrim variable renders opaque |
| 52  | `use_figma`       | write | Sync preview: 11 DialogOverlay rects in section 47:425 | apply the runtime fix (literal scrim) without a re-push  | OK. 11 fills changed                                                                                                  |
| 53  | `get_screenshot`  | read  | section 47:425                                         | rescore                                                  | min 0.081, median 0.945, 9 fail. Merge prompt light: alert dialog has no DialogOverlay, so no scrim                   |
| 54  | `use_figma`       | write | Sync preview: frames 47:9208, 47:9284                  | apply the runtime fix (chrome scrim for an alert dialog) | OK. 2 rects created (chrome, not in read-back)                                                                        |
| 55  | `get_screenshot`  | read  | section 47:425                                         | final batch 01 scores                                    | min 0.679, median 0.948, 8 of 23 fail (wide Documents and Legal dialogs; Apply pane layout). See README               |

Session total: 55 calls today (10 in this part: 1 session, 1 skill load, 1 read, 4 writes to Sync preview, 3 screenshots). The runtime on the page is bb13e007; the repo runtime is 4683a752, so batch 02 needs `install.js` first. No publish. No write to the HDS library. No other page touched.

Earlier total: 45 calls (3 in the scale-out: 2 probes, 1 install). Before: 42 calls (rework: 7 writes to Sync preview, 19 screenshots; limit 150 a day). Before the rework: 16 calls (3 skill and session loads, 4 `use_figma` reads, 9 `use_figma` writes). No publish. No write to the HDS library. The page "Archive — screenshots" was not touched. Nothing was deleted: all 130 frames were adopted in place (node ids kept) and tagged `roleflame/owner = roleflame-figma-sync`.

#### Measured sizes (runtime 482b2970) and batch 01 re-run

| #   | Tool             | Mode  | Target                                  | Why                                                | Result                                                   |
| --- | ---------------- | ----- | --------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| 56  | `create_session` | read  | 9VCvYGN0pz9faveIhSn6Kn                  | session for this task                              | OK                                                       |
| 57  | `use_figma`      | write | Sync preview: shared plugin data        | install runtime 482b2970 (measured `sz`, floating) | OK. runtime 482b2970 stored                              |
| 58  | `use_figma`      | write | Sync preview: 8 failing batch 01 frames | re-push in place                                   | OK. 8 updated in section 47:425; all 8 read back = spec  |
| 59  | `get_screenshot` | read  | section batch 01                        | re-score                                           | 8 of 8 pass: min 0.910, median 0.963                     |
| 60  | `use_figma`      | write | Sync preview: shared plugin data        | runtime text after prettier (one line rewrapped)   | OK. runtime e46861c4 stored and checked; no node changed |

Session total: 60 calls today (5 in this part: 1 session, 2 runtime writes, 1 frame write to Sync preview, 1 screenshot). Frames were built with 482b2970; the page and the repo now hold e46861c4 (same code, prettier line wrap). Batch 02 was not run (context budget): it now splits into 2 scripts (26 + 12 frames, 45 k + 16 k chars). No publish. No write to the HDS library. No other page touched.

#### Batch 02 attempt

| #   | Tool              | Mode  | Target                                    | Why                                   | Result                                                                                                                                        |
| --- | ----------------- | ----- | ----------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 61  | `create_session`  | read  | 9VCvYGN0pz9faveIhSn6Kn                    | session for this task                 | OK                                                                                                                                            |
| 62  | `get_figma_skill` | read  | figma-use SKILL.md                        | required before use_figma             | OK                                                                                                                                            |
| 63  | `use_figma`       | read  | Sync preview                              | owned frame keys and runtime checksum | OK. Runtime e46861c4. 28 owned frames: 5 samples + 23 in batch 01. Batch 02 is 37 frames (not 38)                                             |
| 64  | `use_figma`       | write | Sync preview: batch 02 part 1 (25 frames) | scale-out, batch 2 of 4               | Refused before run: `SyntaxError: expecting ':'`. The 45 k script was copied into the call by hand and the copy had an error. No node changed |

Session total: 64 calls today (4 in this part). Batch 02 is not on the page. No publish. No write to the HDS library. No other page touched.

#### Batch 02 in 15 k scripts

| #   | Tool              | Mode  | Target                                    | Why                       | Result                                                                                                                                                                                                  |
| --- | ----------------- | ----- | ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 65  | `create_session`  | read  | 9VCvYGN0pz9faveIhSn6Kn                    | session for this task     | OK                                                                                                                                                                                                      |
| 66  | `get_figma_skill` | read  | figma-use SKILL.md                        | required before use_figma | OK                                                                                                                                                                                                      |
| 67  | `use_figma`       | write | Sync preview: batch 02 part 01 (7 frames) | scale-out, batch 2        | OK. 7 created in section 55:3875; 7 read back = spec                                                                                                                                                    |
| 68  | `use_figma`       | write | Sync preview: batch 02 part 02 (8 frames) | scale-out, batch 2        | OK. 8 created in section 55:3875; 8 read back = spec                                                                                                                                                    |
| 69  | `use_figma`       | write | Sync preview: batch 02 part 03 (2 frames) | scale-out, batch 2        | OK. 2 created in section 55:3875; 2 read back = spec                                                                                                                                                    |
| 70  | `use_figma`       | write | Sync preview: batch 02 part 04 (5 frames) | scale-out, batch 2        | OK. 5 created in section 55:3875; 5 read back = spec                                                                                                                                                    |
| 71  | `use_figma`       | write | Sync preview: batch 02 part 05 (6 frames) | scale-out, batch 2        | OK. 6 created in section 55:3875; 6 read back = spec                                                                                                                                                    |
| 72  | `use_figma`       | write | Sync preview: batch 02 part 06 (9 frames) | scale-out, batch 2        | OK. 9 created in section 55:3875; 9 read back = spec                                                                                                                                                    |
| 73  | `get_screenshot`  | read  | section 55:3875 (batch 02)                | batch 02 scores           | 37 frames: min 0.025, median 0.963, 3 of 37 fail. All 3 are light menus (More menu, Account menu signed in and signed out): a flat grey layer (rgb 112,116,125) covers the whole frame. Dark menus pass |

Session total: 73 calls today (9 in this part: 1 session, 1 skill load, 6 writes to Sync preview, 1 screenshot). MAX_SCRIPT is now 15 k, so batch 02 is 6 scripts (7 + 8 + 2 + 5 + 6 + 9 frames, 9 k to 15 k chars). Each script was read from the file, passed as is, and passed `node --check` first. All 37 frames read back = spec. Runtime e46861c4. No publish. No write to the HDS library. No other page touched.

#### Menu scrim fix and batch 03

| #   | Tool              | Mode  | Target                                     | Why                              | Result                                                                              |
| --- | ----------------- | ----- | ------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| 74  | `create_session`  | read  | 9VCvYGN0pz9faveIhSn6Kn                     | session for this task            | OK                                                                                  |
| 75  | `get_figma_skill` | read  | figma-use SKILL.md                         | required before use_figma        | OK                                                                                  |
| 76  | `use_figma`       | write | Sync preview: install runtime              | menu scrim fix                   | OK. Runtime 390ef963                                                                |
| 77  | `use_figma`       | write | Sync preview: 3 light 1440 menu frames     | re-push without scrim            | OK. 3 updated in place in section 55:3875; 3 read back = spec                       |
| 78  | `use_figma`       | write | Sync preview: batch 03 part 01 (4 frames)  | scale-out, batch 3               | OK. 3 created in section 63:7851, 1 sample updated in place; 4 read back = spec     |
| 79  | `use_figma`       | write | Sync preview: batch 03 part 02 (2 frames)  | scale-out, batch 3               | OK. 2 created; 2 read back = spec                                                   |
| 80  | `use_figma`       | write | Sync preview: batch 03 part 03 (6 frames)  | scale-out, batch 3               | OK. 6 created; 6 read back = spec                                                   |
| 81  | `use_figma`       | write | Sync preview: batch 03 part 04 (6 frames)  | scale-out, batch 3               | OK. 6 created; 6 read back = spec                                                   |
| 82  | `use_figma`       | write | Sync preview: batch 03 part 05 (4 frames)  | scale-out, batch 3               | OK. 4 created; 4 read back = spec                                                   |
| 83  | `use_figma`       | write | Sync preview: batch 03 part 06 (4 frames)  | scale-out, batch 3               | OK. 4 created; 4 read back = spec                                                   |
| 84  | `use_figma`       | write | Sync preview: batch 03 part 07 (2 frames)  | scale-out, batch 3               | OK. 2 created; 2 read back = spec                                                   |
| 85  | `get_screenshot`  | read  | section 63:7851 (batch 03)                 | batch 03 scores                  | 27 frames cropped (40 px margin)                                                    |
| 86  | `get_screenshot`  | read  | section 55:3875 (batch 02)                 | menu re-scores                   | More menu 0.959, Account signed in 0.983, signed out 0.979                          |
| 87  | `get_screenshot`  | read  | frame 37:4477 (390 Apply / 0 jobs — light) | sample frame outside the section | 0.966. Batch 03: min 0.794, median 0.899, 15 of 28 fail (runtime-level, see README) |

Session total: 87 calls today (14 in this part: 1 session, 1 skill load, 1 runtime install, 8 writes to Sync preview, 3 screenshots). Each script was read from the file, passed as is, and passed `node --check` first. figma/snapshot.json removed until all 130 frames are pushed; receipts are in figma/receipts/. No publish. No write to the HDS library. No other page touched.

#### 390 runtime fixes (partial)

| #   | Tool              | Mode  | Target                                    | Why                              | Result                                                                                      |
| --- | ----------------- | ----- | ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| 88  | `create_session`  | read  | 9VCvYGN0pz9faveIhSn6Kn                    | session for this task            | OK                                                                                          |
| 89  | `get_figma_skill` | read  | figma-use SKILL.md                        | required before use_figma        | OK                                                                                          |
| 90  | `use_figma`       | write | Sync preview: install runtime             | 390 fixes                        | OK. Runtime 7b65356e                                                                        |
| 91  | `use_figma`       | write | Sync preview: runtime patch               | icon alias map (lucide to HDS)   | OK. 7b65356e to 1e500e8b; the patch checks both hashes and writes nothing on a mismatch     |
| 92  | `use_figma`       | write | Sync preview: batch 03 part 01 (4 frames) | test push                        | OK. 4 updated in place; 4 read back = spec                                                  |
| 93  | `get_screenshot`  | read  | frame 63:8332 (390 Apply / 1 job — light) | check the fixes                  | Text size, icons, Badge, toast surface fixed. Icon on both sides; "Not a fit" still missing |
| 94  | `use_figma`       | write | Sync preview: runtime patch               | grid as row, one icon per button | OK. 1e500e8b to ef53726a (hash-checked line patch)                                          |
| 95  | `use_figma`       | write | Sync preview: batch 03 part 01 (4 frames) | re-push with ef53726a            | OK. 4 updated in place in section 63:7851; 4 read back = spec                               |
| 96  | `get_screenshot`  | read  | frame 63:8332 (390 Apply / 1 job — light) | re-score                         | 0.824 (was below 0.83). "Not a fit" now shows                                               |
| 97  | `get_screenshot`  | read  | frame 63:8006 (390 Apply / 1 job — dark)  | re-score                         | 0.834                                                                                       |

Session total: 97 calls today (10 in this part: 1 session, 1 skill load, 1 runtime install, 2 runtime patches, 2 frame writes to Sync preview, 3 screenshots). Stopped early: the context ran low after part 01. Batch 03 parts 02 to 08 and batch 04 are not pushed. The page runtime is ef53726a, the same as the repo. No publish. No write to the HDS library. No other page touched.

#### 390 runtime fixes (setIcon order, grow, icon-only, toast, Disclosure)

| #   | Tool              | Mode  | Target                                    | Why                       | Result                                                                  |
| --- | ----------------- | ----- | ----------------------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| 98  | `create_session`  | read  | 9VCvYGN0pz9faveIhSn6Kn                    | session for this task     | OK                                                                      |
| 99  | `get_figma_skill` | read  | figma-use SKILL.md                        | required before use_figma | OK                                                                      |
| 100 | `use_figma`       | write | Sync preview: install runtime (full)      | 4 runtime fixes           | OK. ef53726a to 80f29145; hash read back on the page = 80f29145         |
| 101 | `use_figma`       | write | Sync preview: install runtime (full)      | Disclosure > Surface card | OK. 80f29145 to 830c80df; hash read back on the page = 830c80df         |
| 102 | `use_figma`       | write | Sync preview: batch 03 part 01 (4 frames) | re-push with 830c80df     | OK. 4 updated in place; 4 read back = spec                              |
| 103 | `use_figma`       | write | Sync preview: batch 03 part 02 (1 frame)  | re-push with 830c80df     | OK. 1 updated; read back = spec                                         |
| 104 | `use_figma`       | write | Sync preview: batch 03 part 03 (1 frame)  | re-push with 830c80df     | OK. 1 updated; read back = spec                                         |
| 105 | `use_figma`       | write | Sync preview: batch 03 part 04 (6 frames) | re-push with 830c80df     | OK. 6 updated; 6 read back = spec                                       |
| 106 | `get_screenshot`  | read  | section 63:7851 (batch 03)                | score parts 01 to 04      | 11 frames cropped (40 px margin): min 0.820, median 0.854, 6 of 11 fail |

Session total: 106 calls today (9 in this part: 1 session, 1 skill load, 2 full runtime installs, 4 frame writes to Sync preview, 1 screenshot). Each script was emitted by `push.mjs --emit-lite`, passed as is, and passed a syntax check first. Stopped after part 04: the context ran low. Batch 03 parts 05 to 08 still show `390ef963` output; batch 04 is not pushed. The page runtime is 830c80df, the same as the repo. Receipts: figma/receipts/batch-03-rerun.json. No publish. No write to the HDS library. No other page touched.
