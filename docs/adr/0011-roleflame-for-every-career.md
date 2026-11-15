# ADR 0011 — roleflame for every career (replaces the design-systems-only rule)

- **Status:** Proposed (draft for Adrian; nothing here is in force until he accepts it)
- **Date:** 2026-11-15
- **Decider:** Adrian
- **Replaces, when accepted:** the "Design-systems only" rule (Adrian 2026-10-29, CLAUDE.md,
  `src/dsOnly.test.ts`) and decision 2 of ADR 0009 (a new user gets the design-systems profile).
  ADR 0009's one Search profile and one Sources list stay.

## Context

roleflame is tuned for one person and one career. Three things are hard-coded to design systems:

1. **The first profile.** `searchDefaults.ts` `ensureProfile` gives every new user the
   design-systems titles, the scorer `design-systems` and about 160 design-system company boards.
2. **The inclusion check.** `feed/profile.ts` `designSystemRule` is applied to every profile, and
   `profileModel.ts` `DEFAULT_SCORER` reads a profile with no scorer as design systems.
3. **The server.** `sync-postings` runs the board rotation (9,937 boards) and the keyed and keyless
   feeds for design-systems plans only, and keeps only postings that pass that scorer.

Adrian's goal (2026-11-15): a job search a person in any career can set up, sold for about $1.
Order: keep the app stable for Adrian now, then open it to a first wave of careers.

The 2026-07 pillar / track model (ADR 0006) tried this before and was cut (ADR 0009) because each
track carried its own screens and stores. This decision must not bring those back.

## Decision

1. **A career is data on the one Search profile, never a screen or a store.** The profile gains
   `categories` (up to 3 ids) and `skills` (additive fields, no blob version change). A category
   (`src/careers/careers.ts`) is a list of titles and skills to offer, plus an optional scorer
   config. There are no per-category pages, tabs or stores.
2. **One generic scorer, with tuned configs as an option.** A profile with no tuned config is
   scored by a generic config compiled from its own fields (`compileProfile` already does this for
   titles): a title match is strong, each skill named in the description is a body signal, leave
   out and level are filters. Design systems keeps its tuned `TrackConfig`. A second tuned config
   is written only when a category's generic results are measurably poor.
3. **The design-systems inclusion check applies only to a profile that asks for it** (scorer
   `design-systems` or the category `design-systems`). `DEFAULT_SCORER` stays until every stored
   profile names its scorer; a one-time move stamps `scorer: 'design-systems'` on existing profiles
   first, so Adrian's results do not change.
4. **The server reads shared postings once, then matches per user.** Board reads are per board,
   not per user. The rotation stores a posting when it passes any active category's title rule;
   each user's Review is a query over shared rows by their profile. No per-user fetch of a board.
5. **Onboarding asks one screen of questions** (kind of work, titles, where), with defaults, and
   can be skipped. This replaces "no setup screen" for new users only; a person with a profile is
   never asked.
6. **First wave = careers the present sources cover well:** software engineering, product design,
   design systems, data, product management, marketing, sales, customer success and support,
   operations and projects, finance and accounting, people and recruiting. Careers that need other
   sources (health care, teaching, trades, retail, government) wait for a licensed aggregator.
7. **`dsOnly.test.ts` is replaced, not deleted.** Its new form pins: the category list, that the
   design-systems category keeps its tuned scorer, and that removed 2026-10 content (the local
   Spokane board and its link rewriting) does not come back.
8. **Money.** Payment is a server fact (`entitlements` table written only by a payment webhook),
   never a client flag. The paid gate is on server work (automatic scan, sync across devices); the
   local tracker stays free.

## Consequences

- Adrian's profile, Sources and results are unchanged at every stage; each stage has a test that
  holds his fixture's Review list equal before and after.
- Shared postings change the cost shape from per user to per category. Stored rows grow by the
  number of active categories, not the number of users.
- The 160 starter boards are no longer followed for every new user; starter companies come from
  the picked categories, or none.
- Commercial use changes the terms position of several sources (see the plan: Remotive, Remote OK,
  Adzuna, designsystems.jobs, HN). Each must be read again before the paid launch.
- Support, refunds, tax and a privacy policy revision become real work at the paid launch.

## Stages

0. **Preview (this PR):** the preferences form behind a device flag; saves a second profile the
   Feed never reads.
1. Stamp scorers on stored profiles; make the inclusion check follow the profile.
2. Generic scorer in the browser Feed for non-design-systems profiles; onboarding screen.
3. Server: shared postings and per-user match; category title rules in the rotation.
4. Entitlements and payment; legal revision; launch of the first wave.

## Not decided here (Adrian)

Price and model, the payment provider, the free tier's limit, the first-wave list, and whether a
person may hold more than one profile.
