# ADR 0006 — Pivot from a personal trades board to an agnostic, pillar-driven product

- **Status:** Proposed
- **Date:** 2026-07-27
- **Context owner:** Apply Board
- **Plan:** `docs/agnostic-product-redesign.md` (full design)
- **Executes via:** Epic #30 (multi-tenant curation / IA consolidation) + Epic #39 (production
  hardening). This ADR records the *product-direction* decision behind #30 and amends it with the
  white-collar-first stance, the location-as-a-field generalization, and the Board↔Queue interop
  (all new this session); it does not replace #30's phased sub-issue plan.

## Context

Apply Board grew a **Spokane hands-on-trades** identity: the curated board is trades-only,
non-trades content is archived out of the way, the copy is trades-forward, and the Title-search
generator hard-codes `l=Spokane, WA`. But the actual need has moved to **remote white-collar**
work (Implementation Consulting, Design Systems), and the goal is now an **agnostic product other
people could use** — any field, any city — not a personal board. The two facts fight: the app's
best real estate points at the track being de-emphasized, and its search machinery is geography-
locked.

## Decision

Pivot to an **agnostic, pillar-driven job-hunt product**:

1. **Content model = floor + depth.** Every track produces a *floor* of generated live searches
   (its titles + the user's location) + ATS dorks — always relevant, zero curation — and *depth*
   from optional hand-curated "Apply Now" tiles shipped as **starter packs**. This guarantees
   relevance for any track, including custom ones we have never seen.
2. **Merge same-job surfaces, keep different-job surfaces.** The curated board and Discover do the
   same job ("where can I apply?") → **merge into one pillar-driven Board tab.** Board and Queue do
   different jobs (discover vs. track a bounded pipeline) → **stay separate**, with a frictionless
   save→track handoff. Net: **4 tabs → 3** (Board · Queue · Copy Deck).
3. **Location is a user-set field**, not a baked-in city. Strip the Spokane hard-code from the
   Title-search boards; default *Remote / United States*; overridable per track.
4. **First-run onboarding + starter-pack catalog on the curation store.** New users set a location
   and pick (fork-on-pick) or create tracks. Trades content is **preserved as one starter pack**,
   not deleted; Consulting + Design Systems ship as the default example packs.
5. **Neutral framing.** Replace the trades/Spokane cross-cutting groups with one universal Tools
   set; generic copy; teaching empty-states; nothing personal baked in.

## Consequences

- **Positive:** one browse surface instead of two; relevance guaranteed for any field/city;
  existing content (incl. trades) survives as packs; the curation store the codebase was already
  migrating toward (`src/curation/`, `importStarter`) becomes the content backbone.
- **Negative / watchpoints:** the curation-store migration (hardcoded `BUILTIN_PILLARS` →
  per-account packs) is the largest lift and must reconcile `pillarStore` with the curation store;
  the generated-search floor is only as good as the user's titles, so onboarding must capture a
  title or a picked pack; the Title-search boards must treat "Remote" as a first-class location.
- **Reversibility:** steps 1–4 (merge, location field, interop, universal Tools) are incremental
  and low-risk. Steps 4–5 of the plan (onboarding + curation-backed content) are the hard-to-
  reverse product commitment this ADR records.
