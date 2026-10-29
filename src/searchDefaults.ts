// What a new Search profile starts with (simplify 7/11, #388): the app's one job is design-system
// openings, so onboarding prefills these titles and follows these companies. The titles are the
// Design Systems starter pack's (curation/packContent.ts reads them from here); the companies are
// its board list (radar/directory.ts: the hand-picked boards, then the confirmed seed boards).
// The Search profile form's draft (Onboarding.tsx, SearchProfileDialog.tsx) lives here too.
import { DIRECTORY_BY_PACK } from './radar/directory';
import { boardLabel, parseBoardUrl } from './feed/sources/ats';
import type { Source } from './sourcesModel';
import { saveProfile, type Profile, type WorkMode } from './profile';
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

/** The starter design-system companies, as Sources: one per board, named from its slug. */
export function seedSources(): Source[] {
  const out: Source[] = [];
  for (const url of DIRECTORY_BY_PACK.designsystems) {
    const b = parseBoardUrl(url);
    if (b) out.push({ kind: b.kind, ref: b.slug, label: boardLabel(b), ...(b.eu && { eu: true }) });
  }
  return out;
}

/** The form's fields: what onboarding asks and the Account menu's Search profile edits. */
export interface ProfileDraft {
  titles: string[];
  remoteOnly: boolean;
  location: string;
  leaveOut: string[];
}

export const NEW_PROFILE: ProfileDraft = {
  titles: [...DESIGN_SYSTEMS_TITLES],
  remoteOnly: true,
  location: '',
  leaveOut: [],
};

export const draftOf = (p: Profile): ProfileDraft => ({
  titles: p.titles,
  remoteOnly: p.mode === 'remote',
  location: p.location,
  leaveOut: p.leaveOut,
});

/** The profile fields a draft sets. Remote only off reads as anywhere ('any'): one switch. */
export const fieldsOf = (d: ProfileDraft) => ({
  titles: d.titles,
  mode: (d.remoteOnly ? 'remote' : 'any') as WorkMode,
  location: d.remoteOnly ? '' : d.location.trim(),
  leaveOut: d.leaveOut,
});

/** Save a new profile from the form and follow the starter companies. Returns how many it followed. */
export function finishSetup(draft: ProfileDraft): number {
  saveProfile({
    ...fieldsOf(draft),
    titlesOff: [],
    atsRoles: [...DESIGN_SYSTEMS_ATS_ROLES],
    atsOff: [],
    include: { terms: [...DESIGN_SYSTEMS_INCLUDE] },
    level: 'any',
    scorer: 'design-systems',
  });
  return addSources(seedSources());
}
