// Starter board lists, one per starter pack (docs/specs/job-sources.md, section 3). A new track
// seeds its pack's list into a "Watched companies" group (src/curation/starterPacks.ts), so Live
// postings reads boards that suit the track and a trades user never sees software boards. Existing
// tracks get the same list through the "Add suggested companies" action. Boards only, never one-off
// postings, so the lists don't go stale. Every entry answered from its public API when it was added;
// a board that later 404s shows as "board not found" in the feed and can be removed in Manage track.

/** A company a track starts with as an outreach target, named, with its board (#198). */
export interface PackCompany {
  company: string;
  url: string;
}

// Design systems: the original 23 (the 2026-10-12 Role Radar research) first, then 94 more that
// answered on 2026-10-15, design-forward companies before the rest. There is no cap on boards read.
// The original 23 are also the track's target companies, seeded as outreach targets (#198).
const DESIGN_SYSTEMS_COMPANIES: readonly PackCompany[] = [
  { company: 'LangChain', url: 'https://jobs.ashbyhq.com/langchain' },
  { company: 'Front', url: 'https://jobs.ashbyhq.com/frontcareers' },
  { company: 'Perplexity', url: 'https://jobs.ashbyhq.com/perplexity' },
  { company: 'Writer', url: 'https://jobs.ashbyhq.com/writer' },
  { company: 'Juniper Square', url: 'https://jobs.ashbyhq.com/junipersquare' },
  { company: 'WorkOS', url: 'https://jobs.ashbyhq.com/workos' },
  { company: 'Ashby', url: 'https://jobs.ashbyhq.com/ashby' },
  { company: 'Vetcove', url: 'https://jobs.ashbyhq.com/vetcove' },
  { company: 'Ramp', url: 'https://jobs.ashbyhq.com/ramp' },
  { company: 'Linear', url: 'https://jobs.ashbyhq.com/linear' },
  { company: 'Baseten', url: 'https://jobs.ashbyhq.com/baseten' },
  { company: 'Deepgram', url: 'https://jobs.ashbyhq.com/deepgram' },
  { company: 'Mixpanel', url: 'https://boards.greenhouse.io/mixpanel' },
  { company: 'Rocket Money', url: 'https://boards.greenhouse.io/truebill' },
  { company: 'Celigo', url: 'https://boards.greenhouse.io/celigo' },
  { company: 'Seed', url: 'https://boards.greenhouse.io/seed' },
  { company: 'Reddit', url: 'https://boards.greenhouse.io/reddit' },
  { company: 'Vercel', url: 'https://boards.greenhouse.io/vercel' },
  { company: 'DoorDash', url: 'https://boards.greenhouse.io/doordashusa' },
  { company: 'Gametime', url: 'https://boards.greenhouse.io/gametimeunited' },
  { company: 'Databricks', url: 'https://boards.greenhouse.io/databricks' },
  { company: 'Stripe', url: 'https://boards.greenhouse.io/stripe' },
  { company: 'Virtualitics', url: 'https://jobs.lever.co/virtualitics' },
];

const DESIGN_SYSTEMS_BOARDS: readonly string[] = [
  ...DESIGN_SYSTEMS_COMPANIES.map((c) => c.url),
  // Added 2026-10-15, design-forward companies first.
  'https://boards.greenhouse.io/figma',
  'https://jobs.ashbyhq.com/notion',
  'https://boards.greenhouse.io/webflow',
  'https://boards.greenhouse.io/netlify',
  'https://boards.greenhouse.io/airtable',
  'https://jobs.ashbyhq.com/airtable',
  'https://boards.greenhouse.io/squarespace',
  'https://jobs.ashbyhq.com/clerk',
  'https://jobs.ashbyhq.com/supabase',
  'https://jobs.ashbyhq.com/posthog',
  'https://jobs.ashbyhq.com/raycast',
  'https://jobs.ashbyhq.com/resend',
  'https://jobs.ashbyhq.com/cursor',
  'https://jobs.ashbyhq.com/replit',
  'https://jobs.ashbyhq.com/runway',
  'https://jobs.ashbyhq.com/openai',
  'https://boards.greenhouse.io/anthropic',
  'https://jobs.ashbyhq.com/elevenlabs',
  'https://boards.greenhouse.io/mercury',
  'https://jobs.ashbyhq.com/mercury',
  'https://boards.greenhouse.io/brex',
  'https://boards.greenhouse.io/gusto',
  'https://boards.greenhouse.io/duolingo',
  'https://boards.greenhouse.io/discord',
  'https://boards.greenhouse.io/pinterest',
  'https://boards.greenhouse.io/instacart',
  'https://boards.greenhouse.io/intercom',
  'https://boards.greenhouse.io/lattice',
  'https://boards.greenhouse.io/launchdarkly',
  'https://boards.greenhouse.io/mozilla',
  'https://boards.greenhouse.io/contentful',
  'https://boards.greenhouse.io/calendly',
  'https://boards.greenhouse.io/asana',
  'https://boards.greenhouse.io/dropbox',
  'https://boards.greenhouse.io/airbnb',
  'https://boards.greenhouse.io/lyft',
  'https://boards.greenhouse.io/twilio',
  'https://boards.greenhouse.io/datadog',
  'https://boards.greenhouse.io/honeycomb',
  'https://boards.greenhouse.io/grafanalabs',
  'https://boards.greenhouse.io/gitlab',
  'https://boards.greenhouse.io/tailscale',
  'https://jobs.ashbyhq.com/hex',
  'https://jobs.ashbyhq.com/hightouch',
  'https://jobs.ashbyhq.com/modal',
  'https://jobs.ashbyhq.com/neon',
  'https://jobs.ashbyhq.com/render',
  'https://jobs.ashbyhq.com/temporal',
  'https://jobs.ashbyhq.com/prefect',
  'https://jobs.ashbyhq.com/plain',
  'https://jobs.ashbyhq.com/stytch',
  'https://jobs.ashbyhq.com/zed',
  'https://jobs.ashbyhq.com/cohere',
  'https://jobs.ashbyhq.com/deel',
  'https://jobs.ashbyhq.com/character',
  'https://boards.greenhouse.io/faire',
  'https://boards.greenhouse.io/fivetran',
  'https://boards.greenhouse.io/flexport',
  'https://boards.greenhouse.io/affirm',
  'https://boards.greenhouse.io/carta',
  'https://boards.greenhouse.io/checkr',
  'https://boards.greenhouse.io/chime',
  'https://boards.greenhouse.io/circleci',
  'https://boards.greenhouse.io/cloudflare',
  'https://boards.greenhouse.io/cockroachlabs',
  'https://boards.greenhouse.io/coinbase',
  'https://boards.greenhouse.io/elastic',
  'https://boards.greenhouse.io/gemini',
  'https://boards.greenhouse.io/gleanwork',
  'https://boards.greenhouse.io/mongodb',
  'https://boards.greenhouse.io/newrelic',
  'https://boards.greenhouse.io/nextdoor',
  'https://boards.greenhouse.io/okta',
  'https://boards.greenhouse.io/pagerduty',
  'https://boards.greenhouse.io/robinhood',
  'https://boards.greenhouse.io/roblox',
  'https://boards.greenhouse.io/samsara',
  'https://boards.greenhouse.io/scaleai',
  'https://boards.greenhouse.io/smartsheet',
  'https://boards.greenhouse.io/sofi',
  'https://boards.greenhouse.io/sumologic',
  'https://boards.greenhouse.io/toast',
  'https://boards.greenhouse.io/udemy',
  'https://boards.greenhouse.io/upstart',
  'https://boards.greenhouse.io/verkada',
  'https://boards.greenhouse.io/zoominfo',
  'https://boards.greenhouse.io/zscaler',
  'https://jobs.lever.co/kraken',
  'https://jobs.lever.co/palantir',
  'https://jobs.lever.co/ro',
  'https://jobs.lever.co/spotify',
  'https://jobs.lever.co/wealthfront',
  'https://jobs.lever.co/whoop',
  'https://jobs.lever.co/zoox',
];

// Implementation services employers (consulting) that answered live.
const CONSULTING_BOARDS: readonly string[] = [
  'https://boards.greenhouse.io/workato',
  'https://boards.greenhouse.io/appian',
  'https://boards.greenhouse.io/anaplan',
  'https://boards.greenhouse.io/zuora',
  'https://boards.greenhouse.io/smartsheet',
  'https://boards.greenhouse.io/okta',
  'https://boards.greenhouse.io/ensono',
  'https://boards.greenhouse.io/thoughtworks',
];

// ServiceNow partners and ITSM-adjacent employers that answered live. Short on purpose: few
// ServiceNow employers use these ATSs, and a placeholder would only be a dead board.
const SERVICENOW_BOARDS: readonly string[] = [
  'https://boards.greenhouse.io/ensono',
  'https://boards.greenhouse.io/pagerduty',
];

// Hands-on fabrication, machining and manufacturing employers that answered live. Few trades
// employers use these ATSs, so coverage here comes mostly from the curated links and Google lanes.
const TRADES_BOARDS: readonly string[] = [
  'https://boards.greenhouse.io/xometry',
  'https://boards.greenhouse.io/fictiv',
  'https://boards.greenhouse.io/divergent',
  'https://boards.greenhouse.io/ursamajor',
  'https://boards.greenhouse.io/rocketlab',
  'https://boards.greenhouse.io/relativity',
  'https://jobs.lever.co/velo3d',
  'https://boards.greenhouse.io/markforged',
  'https://jobs.lever.co/shieldai',
  'https://jobs.ashbyhq.com/saronic',
];

/** Target companies to seed as outreach rows, keyed by starter pack id; most packs have none. */
export const TARGETS_BY_PACK: Readonly<Record<string, readonly PackCompany[]>> = {
  designsystems: DESIGN_SYSTEMS_COMPANIES,
};

/** Board urls to seed, keyed by starter pack id (src/curation/starterPacks.ts). */
export const DIRECTORY_BY_PACK: Readonly<Record<string, readonly string[]>> = {
  designsystems: DESIGN_SYSTEMS_BOARDS,
  consulting: CONSULTING_BOARDS,
  servicenow: SERVICENOW_BOARDS,
  trades: TRADES_BOARDS,
};
