// Career categories for the preferences preview (ADR 0011, proposed; behind careersFlag.ts). The
// first wave: the careers the public company boards (Greenhouse, Lever, Ashby and the like) and the
// remote boards list in volume. Each gives the titles and skills the form offers as chips. Pure
// data and helpers; nothing here changes the Feed, the scorer or the profile in use.
import {
  cleanList,
  MAX_CATEGORIES,
  MAX_PROFILES,
  MAX_PROFILE_TITLES,
  type Profile,
  type WorkMode,
} from '../profileModel.ts';
import type { Seniority } from '../curation/types.ts';

export interface CareerCategory {
  /** Stable: stored on the profile. */
  id: string;
  label: string;
  /** Titles offered as chips, most common first. */
  titles: string[];
  /** Skills offered as chips. */
  skills: string[];
}

export const CAREER_CATEGORIES: readonly CareerCategory[] = [
  {
    id: 'software',
    label: 'Software engineering',
    titles: [
      'Software Engineer',
      'Frontend Engineer',
      'Backend Engineer',
      'Full Stack Engineer',
      'Mobile Engineer',
      'DevOps Engineer',
      'Site Reliability Engineer',
      'Engineering Manager',
    ],
    skills: ['TypeScript', 'React', 'Python', 'Go', 'Java', 'Kubernetes', 'AWS', 'SQL'],
  },
  {
    id: 'design',
    label: 'Product design',
    titles: [
      'Product Designer',
      'UX Designer',
      'UI Designer',
      'UX Researcher',
      'Content Designer',
      'Brand Designer',
      'Design Manager',
    ],
    skills: ['Figma', 'Prototyping', 'User research', 'Interaction design', 'Accessibility'],
  },
  {
    id: 'design-systems',
    label: 'Design systems',
    titles: [
      'Design Systems Engineer',
      'Design Systems Designer',
      'Design Systems Lead',
      'Design Engineer',
      'Design Technologist',
    ],
    skills: ['Design tokens', 'Component libraries', 'Storybook', 'Figma variables', 'React'],
  },
  {
    id: 'data',
    label: 'Data and analytics',
    titles: [
      'Data Analyst',
      'Data Scientist',
      'Data Engineer',
      'Analytics Engineer',
      'Machine Learning Engineer',
      'Business Intelligence Analyst',
    ],
    skills: ['SQL', 'Python', 'dbt', 'Tableau', 'Statistics', 'Machine learning'],
  },
  {
    id: 'product',
    label: 'Product management',
    titles: [
      'Product Manager',
      'Senior Product Manager',
      'Technical Product Manager',
      'Product Owner',
      'Product Operations Manager',
    ],
    skills: ['Roadmaps', 'Discovery', 'Analytics', 'Agile', 'Go to market'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    titles: [
      'Marketing Manager',
      'Content Marketing Manager',
      'Product Marketing Manager',
      'Growth Marketing Manager',
      'SEO Specialist',
      'Social Media Manager',
      'Copywriter',
    ],
    skills: ['SEO', 'Content strategy', 'Email marketing', 'Paid media', 'HubSpot'],
  },
  {
    id: 'sales',
    label: 'Sales',
    titles: [
      'Account Executive',
      'Sales Development Representative',
      'Account Manager',
      'Solutions Engineer',
      'Sales Manager',
      'Partnerships Manager',
    ],
    skills: ['Salesforce', 'Prospecting', 'Negotiation', 'Enterprise sales', 'SaaS'],
  },
  {
    id: 'support',
    label: 'Customer success and support',
    titles: [
      'Customer Success Manager',
      'Customer Support Specialist',
      'Technical Support Engineer',
      'Implementation Manager',
      'Support Team Lead',
    ],
    skills: ['Zendesk', 'Onboarding', 'Renewals', 'Troubleshooting', 'Intercom'],
  },
  {
    id: 'operations',
    label: 'Operations and projects',
    titles: [
      'Operations Manager',
      'Project Manager',
      'Program Manager',
      'Business Operations Analyst',
      'Chief of Staff',
      'Executive Assistant',
    ],
    skills: ['Process improvement', 'Planning', 'Stakeholder management', 'Jira', 'Excel'],
  },
  {
    id: 'finance',
    label: 'Finance and accounting',
    titles: [
      'Accountant',
      'Financial Analyst',
      'Controller',
      'Bookkeeper',
      'Payroll Specialist',
      'FP&A Manager',
    ],
    skills: ['Excel', 'Financial modeling', 'GAAP', 'NetSuite', 'QuickBooks'],
  },
  {
    id: 'people',
    label: 'People and recruiting',
    titles: [
      'Recruiter',
      'Technical Recruiter',
      'People Operations Manager',
      'HR Business Partner',
      'Talent Acquisition Manager',
    ],
    skills: ['Sourcing', 'Interviewing', 'Workday', 'Employee relations', 'Onboarding'],
  },
];

const norm = (s: string) => s.trim().toLowerCase();
const byId = new Map(CAREER_CATEGORIES.map((c) => [c.id, c]));

/** The category ids that exist, in the order given, at most MAX_CATEGORIES. */
export const cleanCategories = (ids: readonly string[]): string[] =>
  cleanList(
    ids.filter((id) => byId.has(id)),
    MAX_CATEGORIES,
  );

/** Add or remove a category. A pick past the limit changes nothing. */
export function toggleCategory(picked: readonly string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  return picked.length >= MAX_CATEGORIES ? [...picked] : cleanCategories([...picked, id]);
}

const offered = (ids: readonly string[], of: (c: CareerCategory) => string[]) =>
  cleanList(
    ids.flatMap((id) => (byId.has(id) ? of(byId.get(id)!) : [])),
    MAX_PROFILE_TITLES,
  );

/** The titles offered for the picked categories, then any picked title not among them. */
export const titleChoices = (ids: readonly string[], picked: readonly string[]): string[] =>
  cleanList([...offered(ids, (c) => c.titles), ...picked], MAX_PROFILE_TITLES);

/** The skills offered for the picked categories, then any picked skill not among them. */
export const skillChoices = (ids: readonly string[], picked: readonly string[]): string[] =>
  cleanList([...offered(ids, (c) => c.skills), ...picked], MAX_PROFILE_TITLES);

/** Add or remove one value, ignoring case. */
export const toggleValue = (list: readonly string[], v: string): string[] =>
  list.some((x) => norm(x) === norm(v)) ? list.filter((x) => norm(x) !== norm(v)) : [...list, v];

/** What the preferences form holds. */
export interface CareerPrefs {
  categories: string[];
  titles: string[];
  skills: string[];
  level: Seniority;
  mode: WorkMode;
  location: string;
  /** Yearly, in dollars, as typed ('' = none). */
  pay: string;
  payOnly: boolean;
  leaveOut: string[];
}

export const NEW_PREFS: CareerPrefs = {
  categories: [],
  titles: [],
  skills: [],
  level: 'any',
  mode: 'remote',
  location: '',
  pay: '',
  payOnly: false,
  leaveOut: [],
};

/** "120,000", "$120k" or "120000" as dollars a year; 0 when it is not a number. */
export function parsePay(text: string): number {
  const m = /^\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?\s*$/i.exec(text);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The id of the profile the preview saves: never the profile in use. */
export const PREVIEW_PROFILE_ID = 'profile-careers-preview';

type PreviewFields = Omit<Profile, 'createdAt'>;

/** The profile fields the form sets. No scorer and no design-system inclusion check. */
export function fieldsOfPrefs(p: CareerPrefs): PreviewFields {
  const pay = parsePay(p.pay);
  const remote = p.mode === 'remote';
  return {
    id: PREVIEW_PROFILE_ID,
    label: 'Career preferences (preview)',
    titles: cleanList(p.titles, MAX_PROFILE_TITLES),
    titlesOff: [],
    atsRoles: [],
    atsOff: [],
    include: { terms: [] },
    leaveOut: cleanList(p.leaveOut),
    level: p.level,
    location: remote ? '' : p.location.trim(),
    mode: p.mode,
    categories: cleanCategories(p.categories),
    skills: cleanList(p.skills),
    ...(pay && { payFloor: pay }),
    ...(pay && p.payOnly && { payOnly: true as const }),
  };
}

/** The form's values from a saved preview profile. */
export const prefsOf = (p: Profile): CareerPrefs => ({
  categories: cleanCategories(p.categories ?? []),
  titles: p.titles,
  skills: p.skills ?? [],
  level: p.level,
  mode: p.mode,
  location: p.location,
  pay: p.payFloor ? String(p.payFloor) : '',
  payOnly: !!p.payOnly,
  leaveOut: p.leaveOut,
});

/** The list with the preview profile saved behind the profile in use. With no profile in use the
 *  list is returned as it is: the preview never takes the first place, which the Feed and the
 *  server sync read. A list that is full is returned as it is too. */
export function withPreview(all: readonly Profile[], prefs: CareerPrefs, now: string): Profile[] {
  if (!all.length || all[0].id === PREVIEW_PROFILE_ID) return [...all];
  const old = all.find((x) => x.id === PREVIEW_PROFILE_ID);
  const next: Profile = { ...fieldsOfPrefs(prefs), createdAt: old?.createdAt ?? now };
  const rest = all.slice(1).filter((x) => x.id !== PREVIEW_PROFILE_ID);
  // A full list keeps what it has: the preview never pushes a stored profile out.
  if (rest.length > MAX_PROFILES - 2) return [...all];
  return [all[0], next, ...rest];
}
