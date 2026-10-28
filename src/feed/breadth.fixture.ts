// The breadth guard's recorded inputs (simplify 5/9, #386): one fixed set of source answers, shaped
// as each API returns them (HN Algolia, Remotive, Jobicy, Greenhouse, Lever, Ashby), served by a
// fake FetchJson that searches the way the real APIs do (every query word present). Both
// pipelines read through the same fake, so they differ only in what they ask for and keep.
import type { FetchJson } from './sources/http';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 864e5).toISOString();
export const FIXTURE_NOW = NOW;

interface Hn {
  story: 'hire' | 'free';
  text: string;
  days: number;
}
const HN: Hn[] = [
  {
    story: 'hire',
    text: 'Orbit | Design Systems Engineer | Remote (US)<p>Own our design system and tokens.',
    days: 3,
  },
  {
    story: 'hire',
    text: 'Kite | Senior Product Designer, Design Systems | NYC<p>Figma library, component library.',
    days: 5,
  },
  {
    story: 'hire',
    text: 'Lumen | Design Technologist | Remote<p>Prototype in code with our design system and Storybook.',
    days: 2,
  },
  {
    story: 'hire',
    text: 'Quill | Product Designer | Remote<p>Ship product features end to end.',
    days: 4,
  },
  { story: 'hire', text: 'Ferro | UX Designer | Austin, TX<p>Research and flows.', days: 6 },
  { story: 'hire', text: 'Nimbus | Backend Engineer | Remote<p>Go and Postgres.', days: 1 },
  {
    story: 'free',
    text: 'SEEKING FREELANCER | Design systems consultant | Remote<p>Audit our component library and design tokens.',
    days: 7,
  },
  {
    story: 'free',
    text: 'SEEKING FREELANCER | UX designer for a 3 month contract | Remote<p>Product flows.',
    days: 8,
  },
  { story: 'free', text: 'SEEKING WORK | Product designer, available now', days: 2 },
];

interface Remote {
  title: string;
  company: string;
  body: string;
  days: number;
  type?: string;
}
const REMOTIVE: Remote[] = [
  {
    title: 'Design Systems Lead',
    company: 'Parcel',
    body: 'Lead the design system, design tokens and Storybook.',
    days: 2,
  },
  {
    title: 'Design Technologist',
    company: 'Glyph',
    body: 'Bridge design and code: component library in React.',
    days: 9,
  },
  { title: 'Product Designer', company: 'Tandem', body: 'Own onboarding flows.', days: 3 },
  {
    title: 'UX Designer (Contract)',
    company: 'Mosaic',
    body: 'Contract role, research and flows.',
    days: 5,
    type: 'contract',
  },
  { title: 'Customer Success Manager', company: 'Tandem', body: 'Help customers.', days: 1 },
];
const JOBICY: Remote[] = [
  {
    title: 'Design Systems Designer',
    company: 'Halo',
    body: 'Design tokens, Figma variables, component library.',
    days: 4,
  },
  { title: 'Product Designer', company: 'Brightline', body: 'Design for our mobile app.', days: 2 },
  { title: 'UX Designer', company: 'Corvid', body: 'UX research and design.', days: 10 },
];

interface BoardJob {
  title: string;
  location: string;
  body: string;
  days: number;
}
/** Boards by `kind:slug`. acme, beta and gamma are watched tiles; delta is a dream company's board
 *  and epsilon an outreach target's, which Live postings never read. */
export const BOARDS: Record<string, BoardJob[]> = {
  'greenhouse:acme': [
    {
      title: 'Staff Design Systems Engineer',
      location: 'Remote',
      body: 'Design system, design tokens, Storybook.',
      days: 2,
    },
    { title: 'Product Designer', location: 'Remote', body: 'Checkout flows.', days: 6 },
    { title: 'Account Executive', location: 'NYC', body: 'Sales.', days: 1 },
  ],
  'lever:beta': [
    {
      title: 'UI Engineer, Design Systems',
      location: 'Remote',
      body: 'Component library, Storybook.',
      days: 3,
    },
    { title: 'UX Designer', location: 'Remote', body: 'Flows and research.', days: 12 },
    { title: 'Frontend Engineer', location: 'Remote', body: 'React app.', days: 4 },
  ],
  'ashby:gamma': [
    {
      title: 'Design Technologist',
      location: 'Remote',
      body: 'Prototype with our design system and design tokens.',
      days: 1,
    },
    { title: 'Senior Product Designer', location: 'Remote', body: 'Growth.', days: 2 },
  ],
  'ashby:delta': [
    {
      title: 'Design Systems Designer',
      location: 'Remote',
      body: 'Figma library and design tokens.',
      days: 1,
    },
    { title: 'Product Designer, Platform', location: 'Remote', body: 'Platform UI.', days: 3 },
  ],
  'greenhouse:epsilon': [
    {
      title: 'Design Platform Engineer',
      location: 'Remote',
      body: 'Design system and component library.',
      days: 2,
    },
    { title: 'UX Designer', location: 'Remote', body: 'Research.', days: 5 },
  ],
};

export const TILE_URLS = [
  'https://boards.greenhouse.io/acme',
  'https://jobs.lever.co/beta',
  'https://jobs.ashbyhq.com/gamma',
  // A search link on the track, not a board: never read.
  'https://www.google.com/search?q=design+systems+jobs',
];

const words = (q: string) =>
  decodeURIComponent(q.replace(/\+/g, ' '))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const hasAll = (text: string, q: string) => {
  const t = text.toLowerCase();
  return words(q).every((w) => t.includes(w));
};

function boardBody(key: string): unknown {
  const [kind, slug] = key.split(':');
  const jobs = BOARDS[key] ?? [];
  if (kind === 'greenhouse')
    return {
      jobs: jobs.map((j, i) => ({
        id: i + 1,
        title: j.title,
        absolute_url: `https://boards.greenhouse.io/${slug}/jobs/${i + 1}`,
        location: { name: j.location },
        updated_at: daysAgo(j.days),
        content: j.body,
        company_name: slug[0].toUpperCase() + slug.slice(1),
      })),
    };
  if (kind === 'lever')
    return jobs.map((j, i) => ({
      id: `${slug}-${i}`,
      text: j.title,
      hostedUrl: `https://jobs.lever.co/${slug}/${slug}-${i}`,
      categories: { location: j.location },
      workplaceType: 'remote',
      createdAt: NOW - j.days * 864e5,
      descriptionPlain: j.body,
    }));
  return {
    jobs: jobs.map((j, i) => ({
      id: `${slug}-${i}`,
      title: j.title,
      jobUrl: `https://jobs.ashbyhq.com/${slug}/${slug}-${i}`,
      location: j.location,
      workplaceType: 'Remote',
      publishedAt: daysAgo(j.days),
      descriptionPlain: j.body,
    })),
  };
}

/** The recorded sources, searched like the real APIs. Counts every request it answers. */
export function fixtureFetch(): FetchJson & { calls: string[] } {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (u.host === 'hn.algolia.com') {
      if (u.pathname.endsWith('/search_by_date'))
        return {
          hits: [
            {
              objectID: 'hire',
              title: 'Ask HN: Who is hiring? (October 2026)',
              created_at: daysAgo(27),
            },
            {
              objectID: 'free',
              title: 'Ask HN: Freelancer? Seeking freelancer? (October 2026)',
              created_at: daysAgo(27),
            },
          ],
        };
      const story = /story_(\w+)/.exec(u.searchParams.get('tags') ?? '')?.[1];
      const q = u.searchParams.get('query') ?? '';
      return {
        hits: HN.map((h, i) => ({ ...h, i }))
          .filter((h) => h.story === story && hasAll(h.text, q))
          .map((h) => ({
            objectID: `c${h.i}`,
            comment_text: h.text,
            parent_id: h.story,
            story_id: h.story,
            created_at: daysAgo(h.days),
          })),
      };
    }
    if (u.host === 'remotive.com') {
      const q = u.searchParams.get('search') ?? '';
      return {
        jobs: REMOTIVE.map((j, i) => ({ ...j, i }))
          .filter((j) => hasAll(`${j.title} ${j.body}`, q))
          .map((j) => ({
            id: 100 + j.i,
            url: `https://remotive.com/remote-jobs/x/${100 + j.i}`,
            title: j.title,
            company_name: j.company,
            candidate_required_location: 'Worldwide',
            publication_date: daysAgo(j.days),
            job_type: j.type ?? 'full_time',
            description: j.body,
          })),
      };
    }
    if (u.host === 'jobicy.com') {
      const q = u.searchParams.get('tag') ?? '';
      return {
        jobs: JOBICY.map((j, i) => ({ ...j, i }))
          .filter((j) => hasAll(`${j.title} ${j.body}`, q))
          .map((j) => ({
            id: 200 + j.i,
            url: `https://jobicy.com/jobs/${200 + j.i}`,
            jobTitle: j.title,
            companyName: j.company,
            jobGeo: 'Anywhere',
            pubDate: daysAgo(j.days).slice(0, 19).replace('T', ' '),
            jobDescription: j.body,
          })),
      };
    }
    const gh = /^\/v1\/boards\/([^/]+)\/jobs/.exec(u.pathname);
    if (u.host === 'boards-api.greenhouse.io' && gh) return boardBody(`greenhouse:${gh[1]}`);
    const lv = /^\/v0\/postings\/([^/]+)/.exec(u.pathname);
    if (u.host === 'api.lever.co' && lv) return boardBody(`lever:${lv[1]}`);
    const ab = /^\/posting-api\/job-board\/([^/]+)/.exec(u.pathname);
    if (u.host === 'api.ashbyhq.com' && ab) return boardBody(`ashby:${ab[1]}`);
    throw new Error(`fixture has no answer for ${url}`);
  };
  return Object.assign(f, { calls });
}
