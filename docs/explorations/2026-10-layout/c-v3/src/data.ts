// Invented sample data for the C v3 exploration. No real employers.
export type Fit = 'Strong fit' | 'Stretch' | 'Reach';

export interface Role {
  title: string;
  where: string;
  mode: string;
  pay?: string;
  fit: Fit;
  posted: string;
  saved?: boolean;
  contract?: boolean;
}

export interface Company {
  id: string;
  name: string;
  team: string;
  board: string;
  checked: string;
  roles: Role[];
  starred?: boolean;
  newRoles?: number;
  phone?: boolean;
}

export const TRACK = { name: 'Design systems', where: 'Spokane, WA', mode: 'Hybrid' };

export const COMPANIES: Company[] = [
  {
    id: 'kestrel',
    name: 'Kestrel Labs',
    team: 'Design system team',
    board: 'Greenhouse',
    checked: '5 min ago',
    starred: true,
    newRoles: 2,
    roles: [
      { title: 'Senior design systems designer', where: 'Remote, US', mode: 'Remote', pay: '$150k–$175k', fit: 'Strong fit', posted: '2 days ago' },
      { title: 'Design engineer, components', where: 'Seattle, WA', mode: 'Hybrid', pay: '$160k–$190k', fit: 'Stretch', posted: '4 days ago' },
      { title: 'Product designer, platform', where: 'Remote, US', mode: 'Remote', fit: 'Stretch', posted: '1 week ago', saved: true },
    ],
  },
  {
    id: 'juniper',
    name: 'Juniper Freight',
    team: 'Platform UI',
    board: 'Lever',
    checked: '12 min ago',
    roles: [
      { title: 'Staff product designer, design system', where: 'Spokane, WA', mode: 'Hybrid', pay: '$140k–$165k', fit: 'Strong fit', posted: 'Today' },
      { title: 'UI engineer', where: 'Spokane, WA', mode: 'On-site', fit: 'Reach', posted: '3 days ago' },
    ],
  },
  {
    id: 'harbor',
    name: 'Harbor & Pine',
    team: 'Brand and design ops',
    board: 'Ashby',
    checked: '20 min ago',
    starred: true,
    roles: [{ title: 'Design ops lead (contract)', where: 'Remote', mode: 'Remote', pay: '$85/hr', fit: 'Strong fit', posted: 'Yesterday', contract: true }],
  },
  {
    id: 'tallgrass',
    name: 'Tallgrass Pay',
    team: 'Founding design',
    board: 'Workable',
    checked: '1 hr ago',
    roles: [{ title: 'Founding product designer', where: 'Boise, ID', mode: 'Hybrid', fit: 'Stretch', posted: '5 days ago' }],
  },
  {
    id: 'bluefin',
    name: 'Bluefin Studio',
    team: 'Component library',
    board: 'Recruitee',
    checked: '1 hr ago',
    phone: true,
    roles: [{ title: 'Component library lead', where: 'Portland, OR', mode: 'Hybrid', pay: '$135k–$150k', fit: 'Strong fit', posted: '6 days ago' }],
  },
];

export const STARRED_QUIET: Company = {
  id: 'orchard',
  name: 'Orchard Analytics',
  team: 'Dream company · no public board',
  board: 'none found',
  checked: 'never',
  starred: true,
  roles: [],
};

export type Stage = 'To apply' | 'Follow up' | 'Applied' | 'Interviewing' | 'Offer' | 'Closed';

export interface Job {
  title: string;
  company: string;
  stage: Stage;
  line: string;
  fit?: Fit;
  starred?: boolean;
  closed?: boolean;
}

export const JOBS: Job[] = [
  { title: 'Senior design systems designer', company: 'Kestrel Labs', stage: 'To apply', line: 'Saved today · Remote', fit: 'Strong fit', starred: true },
  { title: 'Staff product designer, design system', company: 'Juniper Freight', stage: 'To apply', line: 'Saved yesterday · Hybrid', fit: 'Strong fit' },
  { title: 'Design ops lead (contract)', company: 'Harbor & Pine', stage: 'To apply', line: 'Saved 2 days ago · Remote', fit: 'Strong fit', closed: true },
  { title: 'Founding product designer', company: 'Tallgrass Pay', stage: 'Follow up', line: 'Applied Oct 9 · follow up now', fit: 'Stretch' },
  { title: 'Component library lead', company: 'Bluefin Studio', stage: 'Interviewing', line: 'Phone screen Tue 21, 10:00', fit: 'Strong fit' },
  { title: 'Product designer, platform', company: 'Kestrel Labs', stage: 'Applied', line: 'Applied Oct 14 · follow up in 4 days', fit: 'Stretch' },
];

export const STAGE_COUNTS: Record<Stage, number> = {
  'To apply': 3,
  'Follow up': 2,
  Applied: 6,
  Interviewing: 1,
  Offer: 0,
  Closed: 4,
};

export const TEMPLATES = [
  { id: 'intro', title: 'Short intro note', pinned: true, body: 'Hi [Contact],\n\nI saw the [Role] opening at [Company] and it lines up with the design system work I have led for the last six years.' },
  { id: 'follow', title: 'Follow-up after applying', pinned: true, body: 'Hi [Contact],\n\nI applied for [Role] on [Applied date] and wanted to share one example that fits the team.' },
  { id: 'cover', title: 'Cover letter opener', body: 'Dear [Company] hiring team,\n\nI build component libraries that teams actually adopt.' },
  { id: 'thanks', title: 'Thank-you after an interview', body: 'Hi [Contact],\n\nThank you for the time today. The way [Company] runs design reviews stuck with me.' },
];

export const WEEKLY = [2, 4, 3, 6, 5, 8, 7, 9];
