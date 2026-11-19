# Review (Find) screen

The posting list, its window, the full description and Daily picks.

- **Browse is windowed (memory audit 2026-11-13):** `src/useWindowedList.ts` mounts a window of 100 cards
  (`WINDOW_SIZE`, moved in steps of 20) around the viewport; each run of the rest is one `li.rjb-window-spacer`
  (aria-hidden, height through `--rjb-spacer-h`, `FindList.css`) as tall as its cards and gaps. Heights are measured
  by one ResizeObserver (disconnected on unmount; one stable ref per fingerprint, so a re-render observes nothing again; a height change recomputes the window) and cached by fingerprint for the page load, unmeasured ones at
  the measured mean (240px before any), so the page height and scrollMemory's exact restore hold. The focused card
  and the selected / linked card never unmount. Each card's `li` carries `aria-setsize` (every posting in the list) and `aria-posinset`, so a screen reader hears the whole count. **Limits:** cards outside the window are not in the Tab order and
  the browser's find-in-page (Ctrl/Cmd+F) does not find them. Auto-load, Load more and the remembered pages shown
  are unchanged. Pinned in `useWindowedList.test.tsx`, `e2e/browse-window.spec.ts` (320 postings at 390: ≤ 121 cards).

- **Full description in Find's detail (2026-11-13, Adrian on Ramp's Ashby postings):** the detail's Description is
  `src/PostingDescription.tsx` (in Find's chunk, never the entry): the WHOLE text, never cut ("…" stays on list
  cards' excerpts only). `feed/postingBody.ts` `usePostingBody` reads the source's HTML again, because a held text
  may be a cut (the auto-scan's 1500 `TEXT_MAX`, the server's match_text, a light read): Greenhouse's single job,
  Lever's single posting, Ashby's board list (the Feed's 1 h cache); only hosts the Feed already reads (no CSP or
  `legal.ts` change); a Skeleton until it lands, the held text on a failed read. `feed/richText.ts` turns it into a
  tree by an allow-list walk over DOMParser (p, br, ul, ol, li, strong/b, em/i, h1 to h6, and an `a` only with an
  http(s) `httpUrl` href; script, style, iframe, img, svg, forms dropped with their content; no attribute kept),
  rendered as React elements (no innerHTML). Headings sit under the panel's h2: h1/h2 → h3 (`Text body bold`),
  h3 to h6 → h4 (`Text ui bold`); an all-caps line alone (Ashby's `<p><strong>ABOUT RAMP</strong></p>`) is an h4.
  All-caps headings go to sentence case (`sentenceCase`): acronyms in `ACRONYMS` (UX, API, US, EU…) or with a digit
  stay, the company's own words keep their casing ("About Ramp"). Plain text falls back to paragraphs, "-"/"•"/"1."
  bullet lists and caps headings (`textToBlocks`). Unicode "bold" letters (Mathematical Alphanumeric Symbols, LinkedIn-style "𝗖𝗼𝗺𝗽𝗮𝗻𝘆:", which Sora has no glyphs for, so a phone drew a fallback face) read as plain letters in a strong or em run (`textRuns`, `plainLetters`, Adrian 2026-11-17); real `<strong>`/`<b>` keep the body family at the HDS bold weight (`e2e/card-stretched-link.spec.ts`). At lg the list's first card and the detail's h1 share one top (the status line takes no space, 2026-11-17). Pinned in `feed/richText.test.ts`, `postingDescription.test.tsx`,
  `e2e/full-description.spec.ts`.

- **The demo (#835, Adrian 2026-11-19):** the sign-in screen's grey **Try a demo**, the signed-out Review's grey key,
  or a `?demo=1` link (`route.ts` `demo`, dropped from the URL once read) start it. **Its data lives in memory only:**
  `demo/demoStorage.ts` is main.tsx's first import; in a demo tab (`rjb_demo` in sessionStorage, or the link) it swaps
  `window.localStorage` for an in-memory copy before any store loads, so the visitor's own data is hidden and never
  written (the colour mode and paused motion show as set, read only). Starting (`startDemo`) and leaving (`leaveDemo`,
  the underlined **Leave demo** in the demo Alert, back to the sign-in screen) reload the page. Never with a stored
  Supabase session (its sync would run): no demo then. Review shows `DemoReviewList` (`ReviewView.tsx`): an HDS info
  Alert "This is a demo", then fictional postings (`demo/demoPostings.ts`) in the real cards; Save adds the job (in
  memory), Skip and Not this company hide the card with Undo. Apply gets the sample jobs (`seedDemo`). Nothing is read
  from a job board. Pinned in `demo/demoStorage.test.ts`, `todayHome.test.tsx`, `route.test.ts`,
  `SignInDialog.test.tsx`, `e2e/demo.spec.ts` (fits 390x844; a round trip leaves the visitor's data byte for byte; the
  link on the production build), `e2e/review-sign-in.spec.ts`.

- **Daily picks (2026-11-05, `docs/daily-picks.md`):** the scheduled Claude run's hand-picked roles, no longer a
  separate page. It calls `add_daily_picks(p_token, p_picks)` (security definer, public key + a feed token whose sha256
  is in `daily_pick_feeds`; ≤ 10 a call, 50 a day, insert only) into `daily_picks` (RLS read own; migration
  `20261105100000`, also redefines `delete_my_data`). Today shows `DailyPicks.tsx` above Review new, signed in only,
  hidden when empty: link, company, employee/contract, pay, posted day, fit line, draft note (Disclosure row + Copy),
  Save (`addJobDetailed` with `notes` = draft note + fit) and Skip (`decided` by fingerprint, Undo). Read model
  `src/picks.ts`; it imports `fingerprint` from `tracks/score` directly (through `decided.ts` the entry grew 0.8 kB).
  Pinned in `picks.test.ts`, `dailyPicks.test.tsx`, `dailyPicksMigration.test.ts`.
