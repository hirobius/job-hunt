// The Privacy policy and Terms (#43), as data: `LegalPage` renders them at `#/legal/privacy` and
// `#/legal/terms`, and `legal.test.ts` checks the disclosures against the code (every host the CSP
// lets the browser reach is named in `THIRD_PARTIES`). Starting templates for review, not legal
// advice: while `LEGAL_DRAFT` is true the page says so. Adrian approves any wording before it ships.
import { BRAND } from './brand';
import { LEGAL_TITLES } from './legalRoute';

/** True while the wording is unapproved: the page shows a draft notice. Adrian approved it
 *  on 2026-10-20 and the Bluesky / Mastodon revision (PR #420) on 2026-10-28. The legal gaps
 *  revision (2026-11-13: privacy contact, erasure of the sign-in, processors and region, retention)
 *  waits for his review. */
export const LEGAL_DRAFT = true;
export const LEGAL_UPDATED = '13 November 2026';
export const OPERATOR = 'Hirobius';
/** The one contact for privacy requests and questions (Adrian 2026-11-13: a public business address). */
export const CONTACT_EMAIL = 'info@hirobius.com'; // pii-allow: public business address (Adrian 2026-11-13)
/** Where Supabase keeps account data (the project's region, read 2026-11-13). */
export const DATA_REGION = 'the United States (AWS us-east-2, Ohio)';

export type LegalSlug = 'privacy' | 'terms';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  /** An optional bullet list after the paragraphs. */
  list?: string[];
}

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  sections: LegalSection[];
}

export interface ThirdParty {
  name: string;
  /** What it does for the app and what it receives. */
  purpose: string;
  /** The origins the browser contacts for it (vercel.json connect-src); empty = same origin. */
  hosts: string[];
}

/** Everyone the app shares data with or contacts on the user's behalf (#43's subprocessor list). */
export const THIRD_PARTIES: ThirdParty[] = [
  {
    name: 'Supabase',
    purpose: `Sign-in, cloud sync and crash reports, as our processor. If you sign in, it stores your email address and a copy of your data so it can sync between your devices. It also stores the anonymous crash reports described above. Your data is stored in ${DATA_REGION}.`,
    hosts: ['https://nelrcmbkimjjmfmgnixj.supabase.co', 'wss://nelrcmbkimjjmfmgnixj.supabase.co'],
  },
  {
    name: 'Vercel',
    purpose:
      'Hosting and Web Analytics, as our processor. It serves the app from its global network and counts page views without cookies. Like any web host, it sees your IP address and browser details when you load the app.',
    hosts: [],
  },
  {
    name: 'Public job sources',
    purpose:
      'When you search for openings, check a company or check whether a saved job is still open, your browser may ask these services directly: Hacker News (via Algolia), Remotive, Jobicy, Remote OK, Bluesky and Mastodon (mastodon.social and hachyderm.io) public posts, and the Greenhouse, Lever, Ashby, Workable, Recruitee, SmartRecruiters, Teamtailor, Personio, BambooHR, Rippling, Gem, Pinpoint and Breezy HR job boards. They receive your IP address and which search or company board the app is checking, never your notes, documents or account.',
    hosts: [
      'https://hn.algolia.com',
      'https://remotive.com',
      'https://jobicy.com',
      'https://remoteok.com',
      'https://public.api.bsky.app',
      'https://mastodon.social',
      'https://hachyderm.io',
      'https://boards-api.greenhouse.io',
      'https://api.lever.co',
      'https://api.eu.lever.co',
      'https://api.ashbyhq.com',
      'https://apply.workable.com',
      'https://*.recruitee.com',
      'https://api.smartrecruiters.com',
      'https://*.teamtailor.com',
      'https://*.jobs.personio.de',
      'https://*.bamboohr.com',
      'https://api.rippling.com',
      'https://api.gem.com',
      'https://*.pinpointhq.com',
      'https://*.breezy.hr',
    ],
  },
  {
    name: 'Job searches our server runs',
    purpose:
      'If you sign in and your search is for design systems roles, our server (not your browser) looks for openings on designsystems.jobs, Arbeitnow, Remote OK and We Work Remotely and, once each is switched on, TheirStack, Adzuna, Jooble and Into Design Systems. They receive only a fixed search phrase such as “design system”, never your email, jobs, notes, documents or account. Each opening links back to the site it came from and names it; openings from Adzuna are labelled “Jobs by Adzuna”.',
    hosts: [],
  },
  {
    name: 'DuckDuckGo',
    purpose:
      'Company logos. To show a company’s logo, your browser asks DuckDuckGo’s icon service for the icon of the company’s web address, such as acme.com. It receives that web address and your IP address, and may see that the request came from this app (our site address, never the page or job), but never your name, email, notes, documents or account. Where there is no logo, the app shows the company’s first letter.',
    hosts: ['https://icons.duckduckgo.com'],
  },
  {
    name: 'Company directories',
    purpose:
      'Finding companies: a public mirror of the Y Combinator company list and GitHub’s public search. They receive your IP address and what you searched for.',
    hosts: ['https://yc-oss.github.io', 'https://api.github.com'],
  },
];

const name = BRAND.name;

export const PRIVACY: LegalDoc = {
  slug: 'privacy',
  title: LEGAL_TITLES.privacy,
  sections: [
    {
      heading: 'Who we are',
      paragraphs: [
        `${name} is run by ${OPERATOR}. Questions about your data go to ${CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: 'What we store',
      paragraphs: [
        `${name} works without an account. Until you sign in, everything you enter stays in your browser’s local storage on this device.`,
        'If you sign in, we store your email address and a copy of what you enter, so it syncs between your devices:',
      ],
      list: [
        'Jobs you save, with their notes, to-dos, interviews and status history',
        'Documents and templates you write',
        'Files you upload, such as final copies of your résumé',
        'Evidence text you paste in to rank openings',
        'Your Application kit: the name, contact details, links and answers you choose to fill in',
        'Your tracks, saved companies, searches and settings',
        'Daily picks: roles, fit notes and draft messages a scheduled assistant adds to your account, only if you set one up with your own feed token. They are deleted after 60 days',
      ],
    },
    {
      heading: 'Local storage and cookies',
      paragraphs: [
        `${name} keeps your data, your sign-in session and a few display settings in your browser’s local storage. It also keeps short-lived caches there, such as which job boards it has already checked. We do not use cookies, and we do not track you across other sites.`,
      ],
    },
    {
      heading: 'Crash reports',
      paragraphs: [
        `When ${name} breaks, it sends us a short crash report so we can fix it: the error message and where in the code it happened, which page you were on (for example Pipeline, not which job), and your browser name and version. It never includes your email, account, jobs, notes or documents, and it is not linked to you.`,
      ],
    },
    {
      heading: 'Who else sees your data',
      paragraphs: [
        'We do not sell your data or use it for advertising. These services help run the app:',
      ],
      list: THIRD_PARTIES.map((t) => `${t.name}: ${t.purpose}`),
    },
    {
      heading: 'Your choices',
      paragraphs: [
        'Export: Back up (Account menu, Data) downloads everything as one file, and Export CSV downloads your jobs as a spreadsheet.',
        'Erasure: when signed in, Delete my data (Account menu, Data) removes your synced data and your sign-in, including your email address, from the cloud, and your data from this device.',
        `Privacy requests: to ask what we hold about you, to correct it or to have it erased, email ${CONTACT_EMAIL}. We answer within 30 days.`,
        'Signed out, clearing this site’s data in your browser removes everything.',
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'Your account and synced data: until you delete them or ask us to.',
        'Recently removed: a job you remove stays there for 30 days so you can restore it, then it is deleted.',
        'Crash reports: deleted after 90 days.',
        'Rate-limit records: to stop floods of crash reports we keep a scrambled code made from your network address, never your address itself, for 2 days.',
        'Daily picks: deleted after 60 days.',
        'Page-view counts: kept as totals and not tied to you.',
      ],
    },
    {
      heading: 'Children',
      paragraphs: [`${name} is not meant for children under 16.`],
    },
    {
      heading: 'Changes',
      paragraphs: [
        'If this policy changes, we will update the date at the top of this page. For a change that affects data you have already given us, we will tell you in the app first.',
      ],
    },
  ],
};

export const TERMS: LegalDoc = {
  slug: 'terms',
  title: LEGAL_TITLES.terms,
  sections: [
    {
      heading: 'The service',
      paragraphs: [
        `${name} is a free tool for finding and tracking job applications, run by ${OPERATOR}. By using it you agree to these terms.`,
      ],
    },
    {
      heading: 'Your content',
      paragraphs: [
        'What you enter stays yours. You let us store it and sync it between your devices, only so the app works for you.',
      ],
    },
    {
      heading: 'Job listings and other sites',
      paragraphs: [
        `Openings and company pages come from other sites. We don’t write or check them, and we can’t promise they are accurate, current or still open. Applying happens on the employer’s site, under its terms.`,
      ],
    },
    {
      heading: 'Fair use',
      paragraphs: [
        `Use ${name} for your own job search. Don’t use it to overload, scrape or get around the limits of the job sources it reads, or to break the law.`,
      ],
    },
    {
      heading: 'No warranty',
      paragraphs: [
        `${name} is provided as is. We work to keep your data safe and the app running, but we can’t promise it will always be available or free of errors. Keep a backup of anything you can’t afford to lose.`,
      ],
    },
    {
      heading: 'Liability',
      paragraphs: [
        `As far as the law allows, ${OPERATOR} is not liable for lost data, missed applications or other indirect losses from using ${name}.`,
      ],
    },
    {
      heading: 'Ending use',
      paragraphs: [
        'You can stop using the app and delete your data at any time. We may suspend access that breaks these terms.',
      ],
    },
    {
      heading: 'Changes and contact',
      paragraphs: [
        `If these terms change, we will update the date at the top of this page. Questions go to ${CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = { privacy: PRIVACY, terms: TERMS };

/** An unknown or missing sub-slug shows the Privacy policy. */
export const legalDocFor = (sub: string | null): LegalDoc => (sub === 'terms' ? TERMS : PRIVACY);
