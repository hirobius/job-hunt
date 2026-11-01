// The companies the Muse brief verified on their boards (2026-10-24). The sync reads them for a
// design systems user whose blob is older than v12 (src/tracks/plan.ts), beside their own watched
// boards. Notion is not `notion` on Greenhouse, so it is not here.
import type { WatchedCompany } from './sources.ts';

export const VERIFIED_COMPANIES: readonly WatchedCompany[] = [
  { company: 'Figma', ats: 'greenhouse', slug: 'figma' },
  { company: 'Stripe', ats: 'greenhouse', slug: 'stripe' },
  { company: 'Airbnb', ats: 'greenhouse', slug: 'airbnb' },
  { company: 'Datadog', ats: 'greenhouse', slug: 'datadog' },
  { company: 'GitLab', ats: 'greenhouse', slug: 'gitlab' },
  { company: 'Palantir', ats: 'lever', slug: 'palantir' },
  { company: 'OpenAI', ats: 'ashby', slug: 'openai' },
  { company: 'Ramp', ats: 'ashby', slug: 'ramp' },
];
