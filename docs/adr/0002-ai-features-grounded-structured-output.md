# ADR 0002 — AI features: grounded, structured output on Node serverless functions

- **Status:** Accepted
- **Date:** 2026-06-23
- **Context owner:** Apply Board

## Context

Apply Board added two LLM features as the portfolio's "one tasteful AI feature":

1. **Add with AI** — paste a job link (or its text); get a structured, editable
   entry (title, company, location, seniority, salary, requirements) plus a
   match/gap analysis against the user's skills.
2. **Tailor résumé** — turn the user's own résumé + a target role into a
   role-tailored draft they can preview, copy as Markdown, or download.

Two failure modes define the problem. AI résumé/JD features routinely (a) **make
things up** — inventing employers, metrics, or skills — and (b) **come out
poorly formatted** when the model is asked to emit prose or a whole document.
The brief was explicit that both had to be designed against.

Constraints: the live app must stay shippable and **fully usable with no API
key**; no secret may ship to the browser; keep dependencies lean; the work runs
on Vercel (Hobby) behind the existing Vite build.

## Decision

**Run each feature as a Node serverless function that forces a single structured
tool call; ground every fact in the source; let code own the layout.**

1. **Node.js runtime, not Edge.** The functions (`api/extract.ts`,
   `api/tailor.ts`) use the official `@anthropic-ai/sdk`. The SDK transitively
   references `node:fs` / `node:path` (credential-chain + agent-toolset helpers
   we never call), which the **Edge** bundler rejects. They run on Vercel's
   **Node** runtime via the web-standard `export default { fetch }` handler, with
   `maxDuration: 60` (vercel.json) to cover the fetch + model round-trip. (Edge's
   ~25 s wall would also have been too tight for the tailoring call.)
2. **Forced structured output.** Both calls set
   `tool_choice: { type: 'tool', name }` and **omit `thinking`**, so the response
   is _always_ the structured tool input — never prose that has to be parsed, and
   no stray reasoning leaking into text.
3. **Layout is owned by code (tailorer).** The model returns grounded
   _structure_; `src/ai/tailor-core.ts` renders it to Markdown
   **deterministically**. This is what keeps the exported résumé clean and
   predictable — the model never decides formatting.
4. **Grounding / anti-fabrication.** Strict tool schemas + system prompts confine
   every fact to the source (the posting, or the user's résumé). Role
   requirements the résumé can't support are surfaced under a **"Not claimed"**
   field instead of being invented.
5. **Secret stays server-side; graceful degradation.** `ANTHROPIC_API_KEY` is
   read only inside the functions; with no key they return `not_configured` (503)
   and the UI shows a friendly notice — the rest of the app is unaffected. The
   SDK is verified **absent from the client bundle** (a build-time grep gate). The
   link fetch is **SSRF-guarded** (`isAllowedUrl`: public http(s) only).
6. **Model per workload.** Extraction (high-frequency, simple) uses
   **`claude-haiku-4-5`**; tailoring (quality-critical, low-frequency) uses
   **`claude-opus-4-8`** for instruction-following — the lever that most defends
   against fabrication and weak bullets.
7. **Lean + testable.** Pure, DOM-free core modules (`extract-core`,
   `tailor-core`, `intake`) hold the schemas, prompts, SSRF guard, and the
   Markdown renderer, and are unit-tested without the SDK or a network. The two
   dialogs are `React.lazy` so their chunks (~2.6 kB gzip each) load on demand.

## Alternatives considered

| Decision                 | Option                                      | Why not (chosen in **bold**)                                                  |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------- |
| **Where the model runs** | Edge function                               | Edge can't bundle the SDK's `node:` built-ins; also a tighter wall-clock.     |
|                          | Client → Anthropic directly                 | Would expose the API key in the browser and invite cost abuse. Non-starter.   |
|                          | **Node serverless function**                | Keeps the official SDK, hides the key, fits `maxDuration`. **Chosen.**        |
| **How output is shaped** | Free-text generation, then parse            | Fragile parsing; this is exactly where formatting/fabrication go wrong.       |
|                          | Full formatted résumé from the model        | Looks "done," but hands layout _and_ facts to the model — the failure modes.  |
|                          | **Forced tool call → code-rendered layout** | Structure from the model, formatting from code: clean every time. **Chosen.** |
| **Model**                | All Opus                                    | Best quality, but ~5× cost on a high-frequency extraction path.               |
|                          | All Haiku                                   | Cheap, but weaker instruction-following on the quality-critical rewrite.      |
|                          | **Haiku for extract, Opus for tailor**      | Pay for quality only where it matters. **Chosen.**                            |

## Consequences

**Positive**

- Output is **render-safe by construction** — a forced tool call can't return
  malformed prose, and the tailorer's layout is deterministic.
- **No fabrication path:** facts are schema-bound to the source; gaps are shown,
  not invented — and the user sees _what changed_ and _what wasn't claimed_.
- The app stays shippable and usable **with or without** the key; the secret
  never reaches the client (verified in CI-adjacent build checks).
- Pure cores make the risky logic (SSRF guard, Markdown layout, prompt assembly)
  unit-testable; the AI code is fully **code-split** out of the initial bundle.

**Negative / tradeoffs foregone**

- **No streamed reasoning.** Forcing `tool_choice` (and omitting `thinking`)
  rules out streaming a chain-of-thought to the UI; we trade that for a
  guaranteed structured result.
- **Latency vs. the Hobby ceiling.** The tailorer (Opus) can take 20–40 s;
  `maxRetries: 0` + a 50 s request timeout keep it under the 60 s `maxDuration`,
  but a pathologically slow call fails and asks the user to retry rather than
  silently extending.
- **In-app editing is light.** Intake fields are editable; the résumé draft is
  read-only preview + export (you refine in your own template). A richer editor
  was deferred.
- **No evals yet.** Quality is guarded by schema + prompt design and manual
  review; a graded set to catch extraction/tailoring regressions is a follow-up.
- **Cost is unmetered.** Opus tailoring is the user's call; the model is a
  one-line swap to Haiku/Sonnet if cost outweighs quality.

## Follow-ups

- A small **eval set** for extraction accuracy and tailoring regressions
  (fabrication, dropped facts) as prompts evolve.
- Broaden the AI surface: de-dupe/rank saved roles; detect status updates from an
  email scan to auto-advance the tracker.
- Optional: persist the structured extraction (not just a notes blob) so the
  tailorer can consume it directly.

## References

- `api/extract.ts`, `api/tailor.ts` (Node functions, forced tool call)
- `src/ai/extract-core.ts`, `src/ai/tailor-core.ts`, `src/ai/intake.ts` (pure, tested cores)
- `src/ai/AiIntakeDialog.tsx`, `src/ai/TailorDialog.tsx` (lazy-loaded UIs)
- `vercel.json` (`maxDuration`), `.env.example` (`ANTHROPIC_API_KEY`)
