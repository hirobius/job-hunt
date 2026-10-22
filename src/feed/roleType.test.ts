import { describe, expect, it } from 'vitest';
import {
  classifyRole,
  foldRoles,
  isDesignSystemsTrack,
  orderByRoleType,
  roleTypeTag,
  type RoleType,
} from './roleType';

const DS_TEXT =
  'You will own our design system: the component library, design tokens and the Figma library. ' +
  'Partner with designers on the design system roadmap.';
const DESIGN_LED_TEXT =
  'A designer at heart: a portfolio of interaction design and visual design work, prototyping in Figma, user research.';
const ENG_TEXT =
  '5+ years of professional software engineering in TypeScript and React. CI/CD, testing, APIs. We use our design system.';

describe('classifyRole', () => {
  it.each<[string, string, RoleType]>([
    // Ashby's board (Adrian's example): front-end engineering roles lead its "matching roles".
    ['Design Engineer - Americas/Canada/EU', '', 'design-engineering'],
    ['Design Engineer - Americas/Canada/EU', ENG_TEXT, 'design-engineering'],
    ['Senior Design Engineer', '', 'design-engineering'],
    ['Product Designer', '', 'product-design'],
    ['Senior Product Designer, Growth', '', 'product-design'],
    // Design systems: the title centres on it.
    ['Design Systems Designer', '', 'design-systems'],
    ['Lead, Design Systems', '', 'design-systems'],
    ['Design Systems Manager', '', 'design-systems'],
    ['Product Designer – Design Systems', '', 'design-systems'],
    ['Product Designer, Design System', '', 'design-systems'],
    ['UX Engineer – Design Systems', '', 'design-systems'],
    ['Design Engineer, Design Systems', '', 'design-systems'],
    ['Design Systems Engineer', '', 'design-systems'],
    ['Design Technologist', '', 'design-systems'],
    ['Staff Design Technologist', '', 'design-systems'],
    ['DesignOps Manager', '', 'design-systems'],
    ['Design Operations Lead', '', 'design-systems'],
    ['Senior Designer, Component Library', '', 'design-systems'],
    ['Design Tokens Lead', '', 'design-systems'],
    ['UI Kit Designer', '', 'design-systems'],
    // Engineering titles with a design-system focus stay engineering unless the text is design-led.
    ['Software Engineer, Design Systems', '', 'design-engineering'],
    ['Software Engineer, Design Systems', ENG_TEXT, 'design-engineering'],
    ['Software Engineer, Design Systems', DESIGN_LED_TEXT, 'design-systems'],
    ['Senior Frontend Engineer, Design System', '', 'design-engineering'],
    ['Front-end Developer - Design Systems', '', 'design-engineering'],
    // Engineering without a design-system focus.
    ['Frontend Engineer', '', 'design-engineering'],
    ['UI Engineer', '', 'design-engineering'],
    ['Software Engineer', '', 'design-engineering'],
    ['Creative Technologist', '', 'design-engineering'],
    ['UX Engineer', '', 'design-engineering'],
    // A design-flavoured title whose text centres on the design system.
    ['Design Engineer', DS_TEXT, 'design-systems'],
    ['Product Designer', DS_TEXT, 'design-systems'],
    ['UX Designer', '', 'product-design'],
    ['UI Designer', '', 'product-design'],
    ['Interaction Designer', '', 'product-design'],
    ['Head of Design', '', 'product-design'],
    // "System design" is not a design system.
    ['System Design Interviewer', '', 'other'],
    ['Software Engineer, System Design', '', 'design-engineering'],
    ['Systems Designer', 'Game system design for our RPG.', 'product-design'],
    ['Recruiter', '', 'other'],
    ['Program Manager', DS_TEXT, 'design-systems'],
    ['Program Manager', '', 'other'],
  ])('%s → %s', (title, text, want) => {
    expect(classifyRole(title, text)).toBe(want);
  });

  it('a body that names the design system once does not make a role about it', () => {
    expect(classifyRole('Design Engineer', 'You will contribute to our design system.')).toBe(
      'design-engineering',
    );
  });
});

describe('roleTypeTag', () => {
  it('plain words; Other has none', () => {
    expect(roleTypeTag('design-systems')).toBe('Design systems');
    expect(roleTypeTag('product-design')).toBe('Product design');
    expect(roleTypeTag('design-engineering')).toBe('Engineering-heavy');
    expect(roleTypeTag('other')).toBe('');
  });
});

describe('isDesignSystemsTrack', () => {
  it.each<[string[], boolean]>([
    [['design systems', 'design system designer'], true],
    [['Design Systems Lead', 'Design Technologist'], true],
    [['component library'], true],
    [['sheet metal', 'welder'], false],
    [['servicenow developer'], false],
    [['system design'], false],
    [[], false],
  ])('%j → %s', (terms, want) => {
    expect(isDesignSystemsTrack(terms)).toBe(want);
  });
});

const row = (id: string, title: string, text = '') => ({ id, title, text });

describe('orderByRoleType', () => {
  it('design systems, then product design, then other, then engineering; stable within a type', () => {
    const rows = [
      row('fe', 'Frontend Engineer'),
      row('de', 'Design Engineer - Americas/Canada/EU'),
      row('pd', 'Product Designer'),
      row('ds1', 'Design Systems Designer'),
      row('x', 'Program Manager'),
      row('ds2', 'UX Engineer – Design Systems'),
    ];
    expect(orderByRoleType(rows).map((r) => r.id)).toEqual(['ds1', 'ds2', 'pd', 'x', 'fe', 'de']);
  });
});

describe('foldRoles', () => {
  const rows = [
    row('ds', 'Design Systems Designer'),
    row('de', 'Design Engineer'),
    row('pd', 'Product Designer'),
  ];
  it('folds engineering-heavy roles when asked', () => {
    const { shown, folded } = foldRoles(rows, true);
    expect(shown.map((r) => r.id)).toEqual(['ds', 'pd']);
    expect(folded.map((r) => r.id)).toEqual(['de']);
  });
  it('folds nothing otherwise', () => {
    const { shown, folded } = foldRoles(rows, false);
    expect(shown).toEqual(rows);
    expect(folded).toEqual([]);
  });
});
