# ADR 0010 — Two screens, Find and Apply; Documents and Legal are dialogs in the URL

- **Status:** Accepted
- **Date:** 2026-11-07
- **Decider:** Adrian (issue #471, 2026-11-05: "use as few screens as possible"; slices #493, #494, #495, #500)

## Context

By November 2026 the app had 8 screens: Today, the Pipeline list, a job page, Apply mode, a Company
page, Documents, the document editor and Legal. A job lived on two of them (the job page and Apply
mode) and a posting in a preview dialog. The two jobs the app does are finding postings and applying
to saved ones.

## Decision

1. **Exactly two top tabs: Find (`#/find`) and Apply (`#/apply`).** Each is a list beside a detail
   at lg (HDS `Sidebar`) and the list alone on a phone, where a row opens the detail as its own view
   with Back and a "‹ 2 of N ›" pager. No other full page exists (sign-in, 404 and errors aside).
2. **The selection is the route**, not component state: `#/find/<postingFingerprint>`,
   `#/apply/<jobId>`, `#/apply/company/<slug>`. A pick in the list column replaces the history entry
   at lg (Back leaves the tab in one step) and pushes on a phone (Back returns to the list). Find
   opens with nothing selected; Apply at lg opens on the first job to apply to.
3. **The job page and Apply mode are one Apply view.** There is no Apply mode, To apply panel or
   Start applying: the tab is the walk. Mark applied / Not a fit open the next job in the list.
4. **Documents and Privacy and terms are dialogs held in the open page's URL** (`?documents=`,
   `?legal=`), not pages and not component state. A link opens one over any page, a reload keeps it,
   the browser's Back closes it, and `pageKey` ignores the query, so scroll, tab memory and return
   paths treat the page under it as the same page.
5. **Old hashes redirect in `route.ts` `redirectOf` only, in place, with no history step:**
   `#/today` → `#/find`, `#/queue[/<id>]` → `#/apply[/<id>]`, `#/company/<slug>` →
   `#/apply/company/<slug>`, `#/copy-deck[/<id>]` and `#/legal/<doc>` → their `?from=` page (else
   Find) with the dialog open. No data changed: no blob version bump.

## Considered options

- **Keep the job page and Apply mode as two pages.** Rejected: the same job had two views with
  different actions, and "Apply mode" clashed with the Apply tab's name.
- **Selection in component state (no route).** Rejected: a picked posting or job must be shareable
  and survive a reload, and the browser's Back must never bounce.
- **Documents and Legal as tab-less pages (as before) or as dialogs in component state.** Rejected:
  pages count as screens; a dialog in state can't be linked to, and Back would leave the page instead
  of closing it.

## Consequences

- Links saved before #471 keep working only through `redirectOf`; remove a redirect only when no
  stored or shared link can still carry it.
- Every new detail must be a route under its tab, and every new full-page idea is a dialog in the
  URL or a detail column first.
- Pinned in `route.test.ts`, `returnPaths.test.tsx`, `shell.test.tsx`, `review.test.tsx`,
  `jobRoute.test.tsx`, `documentsRoute.test.tsx` and `e2e/return-paths.spec.ts`.
