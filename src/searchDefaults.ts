// What a new Search profile starts with (simplify 7/11, #388): the app's one job is design-system
// openings, so a new profile starts with these titles and follows these companies. The titles are the
// Design Systems starter pack's (curation/packContent.ts reads them from here); the companies are
// its board list (radar/directory.ts: the hand-picked boards, then the confirmed seed boards).
// The Search profile form's draft (SearchProfileDialog.tsx) lives here too. There is no first-run
// form (Adrian 2026-10-29): `ensureProfile` gives a new user this profile on its own.
import { DIRECTORY_BY_PACK } from './radar/directory';
import { boardLabel, parseBoardUrl } from './feed/sources/ats';
import { boardSource, type Source } from './sourcesModel';
import {
  cleanList,
  getProfile,
  MAX_PROFILE_TITLES,
  profileTitles,
  saveProfile,
  type Profile,
  type WorkMode,
} from './profile';
import { addSources } from './sources';

export const DESIGN_SYSTEMS_TITLES = [
  'Design Systems Engineer',
  'Design Systems Designer',
  'Design Systems Lead',
  'Design Systems Manager',
  'Design Systems Architect',
  'Design Systems Technologist',
  // #198: the senior searches, phrase-matched so they catch designer and engineer titles alike.
  'Staff Design Systems',
  'Principal Design Systems',
];

/** The broad searches (the pack's ATS roles): the feeds are read for each, so a posting that says
 *  "design systems" under another title is read too (and counted when it is not a design-system
 *  role). */
export const DESIGN_SYSTEMS_ATS_ROLES = [
  'design systems',
  'design systems designer',
  'design systems engineer',
  'design systems lead',
  'design systems manager',
  'design system technologist',
];

/** The inclusion check a new profile asks for (feed/profile.ts `designSystemRule`). */
export const DESIGN_SYSTEMS_INCLUDE = ['design system'];

/** The starter design-system companies, as Sources: one per board, named from its slug. `auto`
 *  marks them as followed on their own (a new user's auto profile). */
export function seedSources({ auto = false }: { auto?: boolean } = {}): Source[] {
  const out: Source[] = [];
  for (const url of DIRECTORY_BY_PACK.designsystems) {
    const b = parseBoardUrl(url);
    if (b) out.push({ ...boardSource(b, boardLabel(b)), ...(auto && { auto: true as const }) });
  }
  return out;
}

/** The form's fields: what onboarding asks and the Account menu's Search profile edits. */
export interface ProfileDraft {
  /** The titles that are on (searched). */
  titles: string[];
  remoteOnly: boolean;
  location: string;
  leaveOut: string[];
  /** The stored mode, so Save keeps a hybrid or on-site one while Remote only stays off. */
  mode: WorkMode;
  /** Titles switched off (kept, not searched, not shown): Save keeps them unless one is added. */
  titlesOff: string[];
}

export const NEW_PROFILE: ProfileDraft = {
  titles: [...DESIGN_SYSTEMS_TITLES],
  remoteOnly: true,
  location: '',
  leaveOut: [],
  mode: 'remote',
  titlesOff: [],
};

export const draftOf = (p: Profile): ProfileDraft => ({
  titles: profileTitles(p),
  remoteOnly: p.mode === 'remote',
  location: p.location,
  leaveOut: p.leaveOut,
  mode: p.mode,
  titlesOff: p.titlesOff,
});

const norm = (s: string) => s.trim().toLowerCase();

/** The profile fields a draft sets. Remote only off reads as anywhere ('any'), or the hybrid /
 *  on-site mode the profile had; a title typed back in is on again. Saving from the form also drops
 *  `fromTrack`, so the v12 move's one-time remote fix never overrides this choice. */
export const fieldsOf = (d: ProfileDraft) => {
  const on = new Set(d.titles.map(norm));
  const off = d.titlesOff.filter((t) => !on.has(norm(t)));
  return {
    titles: cleanList([...d.titles, ...off], MAX_PROFILE_TITLES),
    titlesOff: off,
    mode: (d.remoteOnly ? 'remote' : d.mode === 'remote' ? 'any' : d.mode) as WorkMode,
    location: d.remoteOnly ? '' : d.location.trim(),
    leaveOut: d.leaveOut,
    fromTrack: undefined,
  };
};

/** Save a new profile from the form and follow the starter companies. Returns how many it followed. */
export function finishSetup(
  draft: ProfileDraft,
  { auto = false }: { auto?: boolean } = {},
): number {
  saveProfile({
    ...(auto && { auto: true as const }),
    ...fieldsOf(draft),
    atsRoles: [...DESIGN_SYSTEMS_ATS_ROLES],
    atsOff: [],
    include: { terms: [...DESIGN_SYSTEMS_INCLUDE] },
    level: 'any',
    scorer: 'design-systems',
  });
  return addSources(seedSources({ auto }));
}

/** A new user's search, made with no questions asked (Adrian 2026-10-29: no setup screen): the
 *  design-systems profile (its titles, remote only) and the starter companies followed. Does
 *  nothing when a profile exists. Returns how many companies it followed. */
export function ensureProfile(): number {
  return getProfile() ? 0 : finishSetup(NEW_PROFILE, { auto: true });
}
