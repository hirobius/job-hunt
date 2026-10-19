# Agnostic job-hunt product — redesign plan

> **Historical.** Written in 2026-07 for the agnostic-product pivot. For how the app works now, read the [README](../README.md) and the ADRs.

**Status:** planned (grilled 2026-07-27) · **Owner:** Apply Board · **ADR:** `docs/adr/0006`

This is the design that came out of an end-to-end grilling session. It pivots Apply Board
from a **personal Spokane-trades board** into an **agnostic, pillar-driven job-hunt product**
that anyone can use for any field in any location — shipped white-collar-first because that's
the live need, but with nothing trade- or geography-locked in the machinery.

## North star

> **Agnostic job-hunt product for anyone.** User-set **location** field. Fully configurable
> **tracks** (pillars). First-run **onboarding** (pick a track + set location). Neutral
> built-in content, teaching empty-states, nothing personal baked in. **3 tabs**
> (Board · Queue · Copy Deck). Implementation Consulting + Design Systems ship as *example
> starter packs*, not as *the* content.

## Relationship to existing epics #30 and #39

**This plan does not start from zero — it extends [Epic #30](https://github.com/hirobius/job-hunt/issues/30) ("Multi-tenant
curation — normalized DB, generic product, consolidated IA").** #30 already locked and filed the
backbone: normalized per-account `categories`/`groups`/`tiles` tables + RLS (#31), a
Supabase-backed curation data layer replacing the `pillarStore` localStorage projection (#32), a
one-time importer to preserve the owner's content (#33), stripping personal content → neutral
starter (#34), consolidating **Trades + Discover → one browse tab** and renaming Queue→Tracker /
Copy Deck→Templates (#36), in-app curation controls (#37), and onboarding empty-states (#38).
[Epic #39](https://github.com/hirobius/job-hunt/issues/39) covers the production-hardening/compliance
baseline for going multi-tenant.

What **this grilling session adds on top of #30** — the genuinely new decisions:

1. **White-collar-first product direction.** #30 is content-neutral ("ship generic/near-empty").
   We commit to **Implementation Consulting + Design Systems as the default example tracks**, trades
   preserved as one starter pack — because that's the live need driving the pivot.
2. **Location as a user-set field.** Strip the Spokane hard-code from the Title-search *generator*
   (`BOARDS`), not just the Spokane *content* (#34). A real location control, default Remote.
3. **The floor + depth relevance contract** (below) — the explicit reason the merge works and
   relevance holds for any track.
4. **Board ↔ Queue interop** (saved→remove + dedup, enriched save, save→toast, find-more-like-this)
   — untouched by #30.
5. **Cross-cutting groups → one universal Tools set** — a concrete refinement of #34's "strip".
6. **Starter-pack *catalog* with fork-on-pick** — richer than #33's owner-only importer / #34's
   "one neutral example."

> **Naming note:** #36 renamed the surfaces **Discover · Tracker · Templates**; this session used
> **Board · Queue · Copy Deck**. That is an unresolved conflict — pick one vocabulary before build.

## The core content model: floor + depth

The guarantee is **"relevant info no matter what a user selects or onboards with."** It's met
by leaning on the one thing that is already field-agnostic — the **generator** — and layering
hand-curated depth on top where we have it.

- **Floor (always present, zero curation):** live searches generated from a track's own titles
  + the user's location (Indeed / LinkedIn / Google Jobs) plus ATS Google-dorks. Works for a
  track we have never seen — "Marine Biologist in Tampa" still gets a relevant floor from its
  own titles + location.
- **Depth (where we have it):** hand-curated "Apply Now" tiles — consulting portals,
  design-systems remote boards, the Spokane trades employers — shipped as **starter packs**.

A user who picks a curated pack gets floor + depth. A user who onboards a custom track gets the
floor. **Nothing gets deleted** — the trades depth is preserved as one optional starter pack.

This is *why* the merge below is correct: every track produces both layers uniformly.

## Tab architecture: merge same-job surfaces, keep different-job surfaces

The guiding principle: **merge surfaces that do the same job; keep surfaces that do different
jobs.**

- **Board + Discover = the same job** ("where can I apply?") → **merge.** Today the curated
  board (`ApprenticeshipsView`) and Discover (`DiscoverView`) are two browse surfaces. They
  collapse into **one pillar-driven Board tab**: pick a track → curated "Apply Now" tiles (depth)
  + generated Title/ATS searches (floor), all scoped to the user's location. The board's better
  extras — pin / set-aside, paste-your-own-links, one board-wide search — fold in.
- **Board + Queue = different jobs.** Board = *discover* (unbounded, ephemeral, external links).
  Queue = *track* (bounded pipeline of saved `Job`s with status, follow-ups, notes, to-dos).
  Collapsing them would drown the high-value pipeline in the discovery firehose. **Keep them
  separate; make the handoff frictionless** (see interop).

Result: **4 tabs → 3** — **Board · Queue · Copy Deck.**

## Geography: location is a field

Today the Title-search generator (`BOARDS` in `jobsData.ts`) hard-codes `l=Spokane, WA` on every
board, which returns near-empty pages for remote/other-city searches. The pivot makes **location
a user-set field** (default *Remote / United States*), consumed by the generators. The ATS panel
already has a Remote/Spokane/Both toggle; that generalizes to a real location control. A global
default location set at onboarding, overridable per track.

## Onboarding + starter packs (built on the curation store)

First-run puts something useful in front of a stranger:

1. **Set your location.**
2. **Pick one or more starter tracks** from a catalog — *Implementation Consulting, Design
   Systems, Skilled Trades, …* — each pre-fills titles + a few curated tiles. Or **create your
   own** track (titles only → still gets the floor).

This rides rails that already exist: `src/curation/` (per-account `categories`/`groups`/`tiles`
tables) + the `importStarter` tool that seeds hardcoded content into a user's own DB rows. A
starter catalog is "let the user choose which packs to import." **Fork-on-pick**: choosing a pack
copies it into the user's editable content (they can then edit/delete freely).

The trades content (Sheet Metal / Welding / Construction pillars + the Spokane apprenticeship
board) becomes **starter packs**, not built-in defaults.

## Board ↔ Queue interoperability (all four in scope)

1. **Saved leaves the Board.** Flip *saved* from **float → remove** (today `partitionTiles`
   floats saved tiles to the top; only *set-aside* removes). Applied uniformly across the merged
   Board, including the generated/curated Discover tiles that ignore saved-state entirely today.
   Show a quiet "N saved → in your Queue" line so tiles don't vanish mysteriously. Because
   `savedSet` is global by URL, this also gives **cross-track dedup** for free — a job saved under
   one track won't resurface under another.
   *Scope honesty:* this applies to **curated tiles** (specific postings). **Generated search
   links can't be "saved"** — they're searches, not postings — so they always show.
2. **Enriched save.** Saving a curated tile carries its name + meta (company / location / pay)
   into the new `Job`, so the Queue card isn't a bare URL to re-type.
3. **Save → toast** with a "View in Queue" jump — makes two tabs feel like one flow.
4. **Reverse interop: "Find more like this"** from a Queue job seeds the Board generator with
   that job's title + the user's location. Pipeline feeds discovery; the two tabs become a cycle.

Keep **set-aside** (dismiss) distinct from **save**: save = "I'm pursuing this" (→ Queue),
set-aside = "not interested" (→ hidden). Two gestures, both remove the tile, different meaning.

## Cross-cutting groups → one universal Tools set

The four groups shown on every pillar today — *Quick Income* (Instawork/DoorDash), *Hire Now*
(Spokane warehouses), *Veteran*, *Tools* (WA apprenticeship finder) — are Spokane/trades/survival
coded and wrong for an agnostic product. **Replace** them with a single lean, field-agnostic
**Tools** set (résumé / ATS-match like Jobscan, a Google-Jobs aggregator, a remote-boards dork).
Universal helpers stay; personal/trades-coded ones go.

## Sequencing (existing #30 sub-issues + net-new from this session)

**Backbone — already filed under #30** (do not re-file): `#31` schema → `#32` curation data layer
→ `#33` importer → `#34` strip personal content → `#36` merge Trades+Discover / rename tabs →
`#37` in-app curation controls → `#38` onboarding empty-states.

**Net-new — filed this session, as sub-issues of #30:**

- **Location as a user field** — strip the Spokane hard-code from the Title-search generator;
  location control, default Remote. *(Slots alongside #34/#36; the generator change is independent
  of the content strip.)*
- **Board↔Queue interop bundle** — saved→remove + cross-track dedup, enriched save, save→toast,
  "find more like this". *(Independent of the curation-store work; can ship on the current
  hardcoded pillars behind the live app.)*
- **Starter-pack catalog + white-collar-first defaults** — fork-on-pick catalog (Consulting /
  Design Systems / Skilled Trades packs) + Consulting as the lead default. *(Extends #33/#34/#38;
  makes onboarding a pick-list, not a single neutral example.)*
- **Universal Tools set** — folded into #34 as a comment (replace, don't just strip, the
  cross-cutting groups).

The interop bundle and the location field are the two pieces that can land **now**, incrementally,
without waiting on the #30 curation-store migration.

## Risks / open questions

- **Curation-store migration weight.** Moving from hardcoded `BUILTIN_PILLARS` to
  curation-store-backed starter packs is the biggest lift; `importStarter` is the seam but the
  Board currently reads `pillarStore`, not the curation store. Step 5 must reconcile them.
- **Generated-search relevance without curation.** The floor is only as good as the user's
  titles. Onboarding must capture at least a title or a picked pack, or a custom track is empty
  of even a floor.
- **Location coverage of the Title-search boards.** Some boards encode location differently
  (path vs query); the generalization must handle "Remote" as a first-class value, not just a
  city string.
- **Multi-user surface area** (auth, RLS, empty accounts) grows once content is per-account by
  default rather than hardcoded — the curation tables already have RLS, but the default-empty
  path needs the teaching empty-states to carry it.
