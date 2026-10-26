# ADR 0009 — AI drafting returns, through one capped server function

- **Status:** Accepted
- **Date:** 2026-10-17
- **Decider:** Adrian (grill round 1 on per-job Documents: "all yes", incl. Q5 option a)

## Context

AI was fully removed in 2026-07: the résumé tailor first, then "Add with AI" (#54). There has been no
Anthropic key, no server AI endpoint and no `@anthropic-ai/sdk` since. Per-job Documents (Résumé, Cover
letter, Note, Outreach message, each with Versions and one Sent Version per kind) need "draft, give
feedback, rewrite" inside the app, at each Job and Company. The alternatives were the Writer page on
Adrian's own plan (copy/paste between two tools) or the Writer saving into the app (two systems to
keep in step).

## Decision

1. Drafting and rewriting run in the app through **one Vercel serverless function**, the only place
   the Anthropic key lives (a Vercel env var set by Adrian; never in the client, never in the repo).
2. A **monthly spend cap** is enforced server-side; over the cap the function refuses with a message
   that names the cap and how to raise it. A missing or expired key fails loud and names the env var.
3. Every AI draft or rewrite saves as a new **Version**; it never overwrites one, and never touches a
   **Sent** Version.
4. The function needs a signed-in user (Supabase session), so the endpoint is not open to the web.
5. The starting cap is **$10 a month** (grill round 2); raising it is Adrian's call.

Related product calls from grill round 2 (not part of this decision, recorded so they are not
re-asked): the Templates tab becomes **Documents** (the library) and each job page gets a Documents
tab; export is PDF and Word downloads only, no share links; a Company is created automatically from
a Job's company name.

## Consequences

- Reverses the July "AI fully removed" note: CLAUDE.md and README must say AI is back for Documents
  only; the JD screener stays rules-based.
- New money and key dependency: the key and the cap value are Adrian's to set; until then drafting
  shows a clear "not set up" state and manual writing still works.
- `connect-src` in the CSP is unchanged (the browser only calls our own origin).
