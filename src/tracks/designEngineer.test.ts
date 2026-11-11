// Design engineering roles (Adrian 2026-11-11): real titles that must reach the queue, and ones
// that must not (hardware design engineers, plain software engineers).
import { describe, expect, it } from 'vitest';
import { buildFeed } from '../feed/feed';
import { passesInclude } from '../feed/include';
import { RELATED_TITLES } from '../feed/mustInclude';
import { profileFrom, searchProfileOf } from '../feed/profile';
import type { Posting } from '../feed/types';
import { notUiDesignTitle, relatedTitleOk } from './designRoleGuard';
import { isDsRole } from './feeds/dsRole';
import { compileProfile } from './plan';
import { scoreForTrack } from './scoreForTrack';
import { designSystemsTrack } from './track-config';

const posting = (title: string, descriptionText = '') => ({
  source: 'greenhouse' as const,
  sourceId: '1',
  company: 'Acme',
  url: 'https://example.com/job',
  title,
  descriptionText,
});
const verdict = (title: string, body = '', track = designSystemsTrack) =>
  scoreForTrack(posting(title, body), track).verdict;
const RULE = { terms: ['design system'], atsOff: [] };

const MUST_MATCH = [
  'Design Engineer',
  'Senior Design Engineer',
  'Staff Design Engineer, Web',
  'Design Engineer - Product',
  'Design Engineer (Frontend)',
  'Design Engineer (Design Systems)',
  'Design Engineer, Developer Tooling',
  'Design Engineer, Internal Tooling',
  'Design Engineer, Design Process',
  'Design Engineer, Developer Tools',
  'Front-end Design Engineer',
  'Frontend Design Engineer',
  'Senior UX Engineer',
  'UX Engineer II',
  'Lead UX Engineer, Design Systems',
  'UI Design Engineer',
  'UI Product Design Engineer',
  'Product Design Engineer, Web',
  'Design Engineer, Prototyping',
  'Design Engineer (IC4)',
  'Design Technologist',
  'Senior Design Technologist, Prototyping',
];

/** Design engineer titles naming non-UI work: never listed, never queued (review of #581). */
const HARDWARE = [
  'Mechanical Design Engineer',
  'Senior Electrical Design Engineer',
  'Hardware Design Engineer',
  'Design Engineer - Mechanical',
  'Design Engineer – Mechanical',
  'Electro-Mechanical Design Engineer',
  'Electromechanical Design Engineer',
  'Product Design Engineer',
  'Product Design Engineer (Consumer Hardware)',
  'Process Design Engineer',
  'ASIC Design Engineer',
  'RF Design Engineer',
  'Analog Design Engineer',
  'Analog IC Design Engineer',
  'Mixed-Signal Design Engineer',
  'Digital Design Engineer',
  'Physical Design Engineer',
  'PCB Design Engineer',
  'IC Design Engineer',
  'SoC Design Engineer',
  'Semiconductor Design Engineer',
  'Silicon Design Engineer',
  'Electronics Design Engineer',
  'Firmware Design Engineer',
  'Embedded Design Engineer',
  'Power Electronics Design Engineer',
  'Battery Design Engineer',
  'Thermal Design Engineer',
  'Mechatronics Design Engineer',
  'Aerospace Design Engineer',
  'Civil Design Engineer',
  'Structural Design Engineer',
  'CAD Design Engineer',
  'Optics Design Engineer',
  'Optical Design Engineer',
  'Photonics Design Engineer',
  'Antenna Design Engineer',
  'Substation Design Engineer',
  'Medical Device Design Engineer',
  'Tool Design Engineer',
  'Tool & Die Design Engineer',
  'Die Design Engineer',
  'Fixture Design Engineer',
  'Water Design Engineer',
  'Transportation Design Engineer',
  'Design Engineer - Plumbing',
  'HVAC Design Engineer',
  'Lighting Design Engineer',
  'System Design Engineer',
  'Systems Design Engineer',
  'Senior Hardware UX Engineer',
  // Queued by the first dry run of this guard (2026-11-11), added since.
  'RTL Design Engineer, Networking / NoC',
  'Data Center Design Engineer',
  'Staff Actuator Design Engineer',
  'Sensor Design Engineer',
  'Enclosure Design Engineer',
];

/** Interns: the scorer rejects them (fitRejectReason), and the Feed now does for related titles. */
const INTERNS = ['Design Engineer Intern', 'UX Engineer Intern', 'Design Technologist Internship'];

const MUST_NOT_MATCH = [
  ...HARDWARE,
  'Software Engineer',
  'Senior Software Engineer, Frontend',
  'Design Verification Engineer',
  'Design Engineering Manager',
];

const NOT_LISTED = [...HARDWARE, ...INTERNS];

const feedPosting = (title: string, i: number): Posting => ({
  id: String(i),
  source: 'greenhouse',
  title,
  company: `Acme ${i}`, // one company each, so no two rows fold into one
  url: `https://boards.greenhouse.io/acme/jobs/${i}`,
  location: 'Remote',
  mode: 'remote',
  text: '',
});
/** The titles the Feed lists with a design-systems profile (the default, and onboarding's shape). */
const listed = (titles: string[], profile = searchProfileOf(null)) =>
  buildFeed(
    {
      postings: titles.map(feedPosting),
      sources: [{ key: 'greenhouse:acme', label: 'Acme', fetched: titles.length }],
    },
    profile,
    [],
    {
      now: Date.parse('2026-11-11T12:00:00'),
      decided: { decided: [], muted: [], followed: [] },
      seen: {},
      saved: new Set(),
    },
  ).rows.map((r) => r.title);
const dsProfile = profileFrom({
  atsRoles: [],
  seniority: 'any',
  sweep: { titles: ['Design Systems Engineer'], off: [] },
  include: { terms: [], atsOff: [] },
  where: '',
});

describe('the design engineer guard (designRoleGuard.ts)', () => {
  it.each(MUST_MATCH)('lets %s in', (title) => {
    expect(notUiDesignTitle(title)).toBe(false);
    expect(relatedTitleOk(title)).toBe(true);
  });

  it.each(HARDWARE)('flags %s as non-UI', (title) => {
    expect(notUiDesignTitle(title)).toBe(true);
  });

  it.each(INTERNS)('keeps %s out of a related title', (title) => {
    expect(relatedTitleOk(title)).toBe(false);
  });

  it('matches words, never parts of words', () => {
    for (const t of [
      'Design Engineer, Developer Tools', // tools, not tool
      'Design Engineer, Powerful Interfaces', // powerful, not power
      'Design Engineer, Diet App', // diet, not die
      'Design Engineer, Waterloo', // waterloo, not water
      'Design Engineer, Ecosystem', // ecosystem, not system design
      'Design Systems Design Engineer',
    ])
      expect(notUiDesignTitle(t)).toBe(false);
  });
});

describe('design engineer roles', () => {
  it.each(MUST_MATCH)('queues %s', (title) => {
    expect(verdict(title)).toBe('queue');
    expect(passesInclude(RULE, title)).toBe(true);
    expect(isDsRole(title)).toBe(true);
  });

  it.each(MUST_NOT_MATCH)('does not queue %s', (title) => {
    expect(verdict(title)).not.toBe('queue');
  });

  it.each(NOT_LISTED)('keeps %s out of the include rule and the keyless feeds', (title) => {
    expect(passesInclude(RULE, title)).toBe(false);
    expect(isDsRole(title)).toBe(false);
  });

  it.each(INTERNS)('rejects %s in the scorer', (title) => {
    expect(verdict(title)).toBe('reject');
  });

  it('lists every UI design engineer in the Feed and no hardware one or intern', () => {
    for (const profile of [searchProfileOf(null), dsProfile]) {
      expect(listed(MUST_MATCH, profile)).toEqual(expect.arrayContaining(MUST_MATCH));
      expect(listed(MUST_MATCH, profile)).toHaveLength(MUST_MATCH.length);
      expect(listed(NOT_LISTED, profile)).toEqual([]);
    }
  });

  it('still lists a design systems intern through the design system phrase (scorer rejects it)', () => {
    expect(listed(['Design Systems Intern'])).toEqual(['Design Systems Intern']);
  });

  it('keeps plain software engineers out of the keyless feeds and the include rule', () => {
    expect(isDsRole('Software Engineer')).toBe(false);
    expect(passesInclude(RULE, 'Senior Software Engineer')).toBe(false);
  });

  it('holds a creative technologist without design-system work, queues one with it', () => {
    expect(verdict('Creative Technologist')).toBe('reject');
    expect(
      verdict(
        'Creative Technologist',
        'Build our design system and component library in Storybook.',
      ),
    ).toBe('queue');
  });

  it('drops the design engineer patterns when that related title is off', () => {
    const off = compileProfile({
      titles: [],
      scorer: 'design-systems',
      relatedOff: ['Design Engineer'],
    })!;
    expect(verdict('Senior Design Engineer', '', off)).toBe('reject');
    expect(verdict('Design Technologist', '', off)).toBe('queue');
    expect(verdict('Design Systems Engineer', '', off)).toBe('queue');
    expect(passesInclude({ ...RULE, relatedOff: ['Design Engineer'] }, 'UX Engineer')).toBe(false);
  });

  it('lists Design Engineer as a related title', () => {
    expect(RELATED_TITLES.map((r) => r.id)).toContain('Design Engineer');
  });
});
