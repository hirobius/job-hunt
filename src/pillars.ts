// Career pillars — a pillar is a named field the user is job-hunting in, with its
// own search terms, seniority stance, curated Discover groups, and (reserved for a
// later chunk) default AI-tailor role. The app ships built-in pillars; Chunk 2 lets
// users curate their own. Discover reads the active pillar (see pillarStore.ts).
import { GROUPS, TITLES, ATS_ROLES, type Group, type Tile } from './jobsData';

export type Seniority = 'entry' | 'experienced' | 'any';

export interface Pillar {
  id: string;
  label: string;
  /** Title-search chips. */
  titles: string[];
  /** ATS hidden-jobs search terms. */
  atsRoles: string[];
  /** Drives entry-level filtering and the ATS junior/associate clause. */
  seniority: Seniority;
  /** Default search location label (e.g. "Remote", "Spokane, WA"). */
  location: string;
  /** Reserved: default target role for AI tailoring (wired in a later chunk). */
  tailorRole?: string;
  /** Curated Discover groups; groups[0] is the pillar's "Apply Now" featured tab. */
  groups: Group[];
  /** Shipped with the app (vs a user-created pillar). */
  builtIn?: boolean;
}

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });
const byId: Record<string, Group> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
const pick = (...ids: string[]): Group[] => ids.map((id) => byId[id]).filter(Boolean);

// Cross-cutting groups shown in EVERY pillar: survival income + universal job tools.
export const CROSS_CUTTING_GROUPS: Group[] = pick(
  'income',
  'hirenow',
  'remoteboards',
  'tools',
  'veteran',
);

const DESIGN_TITLES = [
  'Design Engineer',
  'Design Systems Engineer',
  'Design Technologist',
  'UX Engineer',
  'UI Engineer',
  'Front-End Engineer',
  'Front-End Engineer (React)',
  'Product Engineer',
  'Creative Technologist',
  'Prototyper',
  'Design Systems Lead',
  'Software Engineer, Front-End',
];

const DESIGN_ATS_ROLES = [
  'design engineer',
  'design systems',
  'design technologist',
  'UX engineer',
  'front-end engineer',
  'product engineer',
];

// Featured "Apply Now" set for the Design Engineering pillar — companies known for
// design-engineering culture plus two 1-click aggregator searches.
const DESIGN_BRIEF: Group = {
  id: 'design-brief',
  label: 'Apply Now',
  tiles: [
    t('Vercel', 'Hires design engineers · ships the web', 'https://vercel.com/careers'),
    t('Linear', 'Design-engineering culture', 'https://linear.app/careers'),
    t('Figma', 'Design tooling · design-eng roles', 'https://www.figma.com/careers/'),
    t('Framer', 'Design + code product team', 'https://www.framer.com/careers/'),
    t('Stripe · Design Eng', 'Design systems / front-end', 'https://stripe.com/jobs/search?q=design%20engineer'),
    t('Notion', 'Product + design engineering', 'https://www.notion.so/careers'),
    t('Retool', 'Internal-tools; design eng', 'https://retool.com/careers'),
    t('Raycast', 'Design-led product team', 'https://www.raycast.com/careers'),
    t(
      'LinkedIn · Design Engineer (Remote)',
      'All levels · remote',
      'https://www.linkedin.com/jobs/search/?keywords=Design%20Engineer&f_WT=2',
    ),
    t(
      'Google Jobs · Design Engineer',
      'Aggregates all boards',
      'https://www.google.com/search?q=design+engineer+remote&ibp=htl;jobs',
    ),
  ],
};

export const IT_PILLAR: Pillar = {
  id: 'it',
  label: 'IT Support',
  titles: TITLES,
  atsRoles: ATS_ROLES,
  seniority: 'entry',
  location: 'Remote',
  tailorRole: 'IT Support Specialist',
  groups: pick(
    'brief',
    'itsupport',
    'grc',
    'govcon',
    'spokane',
    'saas',
    'seccos',
    'remotecos',
    'staffing',
    'skillup',
  ),
  builtIn: true,
};

export const DESIGN_PILLAR: Pillar = {
  id: 'design',
  label: 'Design Engineering',
  titles: DESIGN_TITLES,
  atsRoles: DESIGN_ATS_ROLES,
  seniority: 'experienced',
  location: 'Remote',
  tailorRole: 'Design Engineer',
  groups: [DESIGN_BRIEF, ...pick('designtech', 'aieng')],
  builtIn: true,
};

export const BUILTIN_PILLARS: Pillar[] = [IT_PILLAR, DESIGN_PILLAR];
