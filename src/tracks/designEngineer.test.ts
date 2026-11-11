// Design engineering roles (Adrian 2026-11-11): real titles that must reach the queue, and ones
// that must not (hardware design engineers, plain software engineers).
import { describe, expect, it } from 'vitest';
import { passesInclude, RELATED_TITLES } from '../feed/mustInclude';
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
  'Front-end Design Engineer',
  'Frontend Design Engineer',
  'Senior UX Engineer',
  'UX Engineer II',
  'Lead UX Engineer, Design Systems',
  'UI Design Engineer',
  'Design Technologist',
  'Senior Design Technologist, Prototyping',
];

const MUST_NOT_MATCH = [
  'Software Engineer',
  'Senior Software Engineer, Frontend',
  'Mechanical Design Engineer',
  'Senior Electrical Design Engineer',
  'Hardware Design Engineer',
  'Design Engineer - Mechanical',
  'Product Design Engineer (Consumer Hardware)',
  'ASIC Design Engineer',
  'RF Design Engineer',
  'Structural Design Engineer',
  'HVAC Design Engineer',
  'Design Verification Engineer',
  'Design Engineering Manager',
  'Lighting Design Engineer',
];

describe('design engineer roles', () => {
  it.each(MUST_MATCH)('queues %s', (title) => {
    expect(verdict(title)).toBe('queue');
    expect(passesInclude(RULE, title)).toBe(true);
    expect(isDsRole(title)).toBe(true);
  });

  it.each(MUST_NOT_MATCH)('does not queue %s', (title) => {
    expect(verdict(title)).not.toBe('queue');
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
