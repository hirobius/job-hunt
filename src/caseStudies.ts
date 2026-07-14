// Portfolio case studies, rendered full-screen via ?case=<slug> (see CaseStudyView).
// Every piece follows the same template: Problem → Approach → Decisions → Outcome → Next.

export interface Decision {
  title: string;
  body: string;
}
export interface CaseStudy {
  slug: string;
  eyebrow: string;
  title: string;
  tagline: string;
  liveUrl?: string;
  meta: [string, string][]; // [label, value]
  proves: string;
  problem: string[];
  approach: string[];
  decisions: Decision[];
  outcome: string[];
  next: string[];
}

export const CASES: Record<string, CaseStudy> = {
  'apply-board': {
    slug: 'apply-board',
    eyebrow: 'Design Technologist portfolio · Piece 1',
    title: 'Apply Board',
    tagline: 'A job-application tracker + discovery board — designed and shipped to production.',
    liveUrl: 'https://job-hunt-jade.vercel.app',
    meta: [
      ['Stack', 'Vite · React 18 · TypeScript · HDS (design system) · Supabase · Vercel'],
      ['Role', 'Sole designer + engineer — design system, architecture, build'],
      ['Workflow', 'Directed an AI agentic coding workflow end to end'],
    ],
    proves:
      'Design-engineering depth (a shipped React/TS app with a real design system) and applied-AI literacy — not just an AI-assisted build, but two production LLM features I designed for grounding and clean output, owning the architecture calls.',
    problem: [
      'Job hunting is fragmented. Openings live across a dozen boards — Indeed, LinkedIn, ZipRecruiter, union hall boards, company career pages — and the actual tracking (what did I save, what did I apply to, when do I follow up, which résumé did I send) scatters across a spreadsheet, browser tabs, and memory.',
      'I wanted one tool that did three jobs well, on mobile, with as little friction as possible: discover good places to look, track saved roles with status and a follow-up loop, and reuse outreach copy in one tap.',
      'The hard constraint: it had to be usable in the moment — saving a role from my phone while reading an email or a job post should take one tap, not a form.',
    ],
    approach: [
      'I rebuilt an earlier single-file static HTML tool into a proper React app with a three-tab shell — Queue (tracker), Copy Deck (snippets), and Discover (curated boards + search generators) — and made it local-first with optional cloud sync.',
      'The design language is a jade dark theme with a deliberately restrained type ramp (Clash Display for headlines, Satoshi for body), with every value centralized as a token so the whole app re-themes from one file.',
      'The guiding principle was low-friction capture: any channel — an iOS shortcut, a bookmarklet, a one-tap link in an email — can feed the tracker through URL parameters, so the app meets me wherever I find a job.',
    ],
    decisions: [
      {
        title: 'A tiny shared external store, no Redux',
        body: "State lives in a ~150-line module exposed via React's useSyncExternalStore. Jobs are a single source of truth shared across all three tabs, so Discover can save straight into the Queue. Tradeoff: hand-rolled (no devtools/middleware), but zero dependencies and trivial to reason about at this size.",
      },
      {
        title: 'Local-first, with optional cloud sync',
        body: 'Data persists instantly to localStorage; signing in with a Supabase magic link syncs one JSON blob per user (RLS-protected) so the tracker follows me across devices. Fully usable signed-out and offline. Tradeoff: single-blob sync is simple and cheap, but its merge is naive (cloud-wins) — fine for one user, revisited below.',
      },
      {
        title: 'URL-driven capture',
        body: 'Quick-add params (?add, ?applied, ?status) ingest a job — adding it if new, de-duplicating against existing saves (tracking params ignored), then scrubbing the URL. This one decision is what powers the iOS shortcut, the bookmarklet, and one-tap "mark applied" links from an email scan.',
      },
      {
        title: 'Durable discovery over fragile links',
        body: 'Individual job postings expire, so Discover leans on evergreen board-search URLs plus two generators: a Title search that bakes entry-level filters into each board query, and an ATS search that builds Google dorks against Greenhouse / Lever / Ashby / Workday to surface roles with less competition. Tradeoff: one extra click vs. a direct link, but the links never rot.',
      },
      {
        title: 'The follow-up loop as modeled state',
        body: 'Applying drops a role out of the active queue so the list stays focused on what is left to do. Applied/interviewing roles show a "Follow up in N days" countdown that flips to "Follow up now," and logging a follow-up restarts the clock — turning a vague intention into a visible, repeatable nudge.',
      },
      {
        title: 'Resilient data handling',
        body: 'URLs are sanitized on every path — cleaned, de-duped, weak titles auto-derived from the URL — including data arriving from the cloud, so a malformed save can never produce a broken, unclickable link.',
      },
      {
        title: 'Applied AI, engineered against the failure modes',
        body: 'Two Claude-backed features — turn a job link into a structured entry, and tailor a résumé to a role — run on serverless functions so the SDK never ships to the browser. The design fights the usual LLM-feature failure modes: I force a single structured tool call (JSON, never prose) and let code own the layout, so the output is always clean; and I constrain every fact to the source (the posting, or your own résumé), surfacing unsupported requirements honestly rather than fabricating them. The link fetch is SSRF-guarded, and with no API key the features degrade to a friendly notice instead of breaking the app. Tradeoff: forcing the tool call rules out streaming the reasoning, but guarantees a structured, render-safe result.',
      },
    ],
    outcome: [
      'Shipped to production on Vercel; it is my daily-driver job-search tool.',
      'A curated Spokane-area trades discovery board (sheet-metal & fab shops, foundries & casting, precast concrete, union apprenticeship JATCs, veteran pathways, quick-income) plus the two search generators.',
      'A tracker with status, priority pinning, a follow-up loop, per-role notes / contact / résumé-version fields, and CSV export.',
      'Two production AI features: "Add with AI" (a link or pasted text becomes a structured, editable job with skill match/gap chips) and "Tailor résumé" (your résumé becomes a role-tailored draft you can copy or download as Markdown) — both grounded to avoid fabrication.',
      'Cross-device cloud sync via passwordless sign-in.',
      'Built and iterated rapidly with an AI agentic coding workflow — my role was directing architecture, making the design-system and data-model calls, and reviewing and curating the output.',
    ],
    next: [
      'Smarter sync: move from last-write-wins blob to per-record merge (or CRDT) for safe concurrent multi-device edits.',
      'Evals for the AI features: a small graded set to measure extraction accuracy and catch résumé-tailoring regressions (fabrication, dropped facts) as the prompts evolve.',
      'More AI surface: de-dupe and rank saved roles, and detect status updates from an email scan to auto-advance the tracker.',
      'Broaden the accessibility gate from one component to the Discover and Copy Deck views.',
    ],
  },
};
