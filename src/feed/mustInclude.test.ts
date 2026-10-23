import { beforeEach, describe, expect, it } from 'vitest';
import {
  includeFields,
  keepIncluded,
  passesInclude,
  mentionsAny,
  mergeMustInclude,
  readMustInclude,
  relatedCounts,
  RELATED_TITLES,
  sanitizeMustInclude,
  setMustInclude,
} from './mustInclude';
import { emptyBlob, mergeBlob, readBlob, writeBlob } from '../syncBlob';

beforeEach(() => localStorage.clear());

describe('mentionsAny', () => {
  it.each([
    ['Design System Lead', true],
    ['design systems', true],
    ['Systems Designer', true],
    ['UI Systems', true],
    ['SYSTEMS', true],
    ['ecosystem', false],
    ['Ecosystems partner', false],
    ['subsystem', false],
    ['Design Engineer', false],
  ])('%s → %s', (text, want) => expect(mentionsAny(['systems'], text)).toBe(want));

  it('looks at every text given (title, description)', () => {
    expect(mentionsAny(['systems'], 'Product Designer', 'Grow our design system.')).toBe(true);
    expect(mentionsAny(['systems'], 'Product Designer', 'Grow our ecosystem.')).toBe(false);
  });

  it('no terms is no rule', () => expect(mentionsAny([], 'anything')).toBe(true));
});

describe('phrase matching (design system)', () => {
  it.each([
    ['Design System Lead', true],
    ['Senior Design Systems Engineer', true],
    ['design-system tooling', true],
    ['Design-Systems team', true],
    ['DESIGN   SYSTEMS', true],
    ['design\u2011system', true],
    ['Design System(s)', true],
    ['design systems.', true],
    ['Design Systems & Infrastructure', true],
    ['designs scalable systems', false],
    ['design and system', false],
    ['system design', false],
    ['Systems Design Engineer', false],
    ['design ecosystem', false],
    ['UI Systems', false],
    ['designs system', false],
    ['redesign systems', false],
  ])('%s → %s', (text, want) => expect(passesInclude(['design system'], text)).toBe(want));

  // A separator between the two words breaks the phrase (Figma's "Manager, Design - Systems &
  // Infrastructure" passed). A hyphen inside a word still joins it.
  it.each([
    'Manager, Design - Systems & Infrastructure',
    'Design – Systems',
    'Design–Systems',
    'Design — Systems',
    'Design—Systems',
    'Design, Systems',
    'Design | Systems',
    'Design / Systems',
    'Design/Systems',
    'Design: Systems',
    'Design & Systems',
    'Design -Systems',
    'Design- Systems',
    'design ‑ system',
  ])('%s does not say the phrase', (text) => {
    expect(passesInclude(['design system'], text)).toBe(false);
    expect(passesInclude(['design system'], 'Product Designer', text)).toBe(false);
  });

  it.each([
    'Design Systems Engineer',
    'design-system',
    'Design System(s)',
    'Senior Engineer, Design Systems',
    'Design Systems - Platform',
    'Lead | Design Systems & Infrastructure',
  ])('%s still says the phrase', (text) => {
    expect(passesInclude(['design system'], text)).toBe(true);
    expect(passesInclude(['design system'], 'Product Designer', text)).toBe(true);
  });

  // Adrian's phone, 2026-10-23: these passed on a bare "systems" in the description.
  it.each([
    ['Senior Design Engineer', 'Frontcareers builds scalable systems for our design team.'],
    ['Staff Design Engineer', 'Mixpanel: own UI systems and design tooling.'],
  ])(
    '%s with "systems" (not the phrase) in its description is hidden, descriptions on or off',
    (t, d) => {
      expect(passesInclude(['design system'], t, d)).toBe(false);
      expect(passesInclude({ terms: ['design system'], inText: false }, t, d)).toBe(false);
    },
  );

  it('strips HTML from the description first', () => {
    expect(
      passesInclude(['design system'], 'Designer', '<p>Own the <b>design</b> system</p>'),
    ).toBe(true);
  });

  const title = 'Product Designer';
  const body = 'Grow our design system.';
  // [phrase in title, neither, phrase only in the description]
  it.each([
    ['both on', {}, [true, false, true]],
    ['title only', { inText: false }, [true, false, false]],
    ['description only', { inTitle: false }, [false, false, true]],
    ['both off = title only', { inTitle: false, inText: false }, [true, false, false]],
  ] as const)('%s', (_n, f, want) => {
    const rule = { terms: ['design system'], ...f };
    expect([
      passesInclude(rule, 'Design Systems Lead', ''),
      passesInclude(rule, title, ''),
      passesInclude(rule, title, body),
    ]).toEqual(want);
  });

  it('both off reads as title only', () =>
    expect(includeFields({ terms: [], inTitle: false, inText: false })).toEqual({
      title: true,
      text: false,
    }));
});

describe('keepIncluded', () => {
  it('keeps roles whose title or text says a term', () => {
    const roles = [
      { id: 'a', title: 'Design Systems Engineer', text: '' },
      { id: 'b', title: 'Product Designer', text: 'Our design system team.' },
      { id: 'c', title: 'Product Designer', text: 'A great ecosystem.' },
    ];
    expect(keepIncluded(roles, ['systems']).map((r) => r.id)).toEqual(['a', 'b']);
    expect(keepIncluded(roles, [])).toBe(roles);
  });
});

describe('store', () => {
  it('sanitizes junk, keeps an empty entry (the user cleared it)', () => {
    expect(sanitizeMustInclude('x')).toEqual({});
    expect(
      sanitizeMustInclude({ __proto__: 1, a: { terms: [' systems ', 'Systems', 3] }, b: [] }),
    ).toEqual({ a: { terms: ['systems'], atsOff: [] } });
    expect(sanitizeMustInclude({ a: { terms: [] } })).toEqual({ a: { terms: [], atsOff: [] } });
  });

  it('set merges over the entry', () => {
    setMustInclude('t', { terms: ['systems'] });
    setMustInclude('t', { atsOff: ['design tokens'] });
    expect(readMustInclude('t')).toEqual({ terms: ['systems'], atsOff: ['design tokens'] });
  });

  it('cloud wins per track; local-only tracks are kept', () => {
    const cloud = { a: { terms: ['systems'], atsOff: [] } };
    const local = { a: { terms: [], atsOff: [] }, b: { terms: ['x'], atsOff: [] } };
    expect(mergeMustInclude(cloud, local)).toEqual({ ...local, ...cloud });
  });
});

describe('in the sync blob (v11)', () => {
  const local = { ...emptyBlob(), mustInclude: { t: { terms: ['systems'], atsOff: [] } } };
  it('round-trips', () => {
    expect(readBlob(writeBlob(local)).mustInclude).toEqual(local.mustInclude);
  });
  it('an older (v10) cloud copy keeps this device’s on refresh', () => {
    const old = readBlob({ v: 10, jobs: [] });
    expect(mergeBlob(old, local, false).mustInclude).toEqual(local.mustInclude);
  });
  it('a v11 cloud copy wins on refresh', () => {
    const cloud = readBlob({ v: 11, jobs: [], mustInclude: { t: { terms: [] } } });
    expect(mergeBlob(cloud, local, false).mustInclude).toEqual({ t: { terms: [], atsOff: [] } });
  });
});

describe('related titles (2026-10-23)', () => {
  // Title only, so the description never passes a posting on its own: the related path is all
  // that can let a non-phrase title in.
  const rule = { terms: ['design system'], inText: false };
  const DS = 'You will grow our design system.';
  const AI = 'We build with Claude Code and Cursor every day.';
  it.each([
    ['Design Technologist', '', true],
    ['Senior Design Technologist', 'Nothing about it.', true],
    ['UI Platform Engineer', DS, true],
    ['UI Platform Engineer', 'Own the platform.', false],
    ['Component Library Engineer', DS, true],
    ['Frontend Platform Engineer', DS, true],
    ['Front-end Platform Engineer', DS, true],
    ['Frontend Platform Engineer', 'Own the platform.', false],
    ['Design Engineer', `${DS} ${AI}`, true],
    ['Design Engineer', DS, false],
    ['Design Engineer', AI, false],
    ['Design Engineer', `${DS} An AI-assisted workflow.`, true],
    ['Design Engineer', `${DS} Comfort with LLMs.`, true],
    ['Design Engineer', `${DS} Agentic tools.`, true],
    ['Design Engineer', `${DS} Copilot is fine.`, true],
    ['Design Engineer', `${DS} AI tools daily.`, true],
    ['Design Engineer', `${DS} Claude.`, true],
    ['Design Engineer', `${DS} Precursors of the web.`, false],
    ['Design Engineering Manager', `${DS} ${AI}`, false],
    ['Product Designer', `${DS} ${AI}`, false],
    // "system design", never the phrase, in the description
    ['UI Platform Engineer', 'Strong system design skills.', false],
  ])('%s · %s → %s', (title, text, want) => {
    expect(passesInclude(rule, title, text)).toBe(want);
  });

  it('a title switched off no longer passes; the control off turns them all off', () => {
    expect(
      passesInclude({ ...rule, relatedOff: ['Design Technologist'] }, 'Design Technologist'),
    ).toBe(false);
    expect(passesInclude({ ...rule, related: false }, 'UI Platform Engineer', DS)).toBe(false);
    expect(passesInclude({ ...rule, related: false }, 'Design Technologist')).toBe(false);
  });

  it('only on a rule that asks for design system(s); a bare list has no related path', () => {
    expect(passesInclude({ terms: ['welding'], inText: false }, 'Design Technologist')).toBe(false);
    expect(passesInclude({ terms: ['design systems'], inText: false }, 'Design Technologist')).toBe(
      true,
    );
    expect(passesInclude(['design system'], 'Design Technologist')).toBe(false);
  });

  it('Companies and dream rows (keepIncluded) take the related titles too', () => {
    const roles = [
      { id: 'a', title: 'Design Technologist', text: '' },
      { id: 'b', title: 'Backend Engineer', text: DS },
    ];
    expect(keepIncluded(roles, rule).map((r) => r.id)).toEqual(['a']);
  });

  it('counts what each title would let in, on or off', () => {
    const ps = [
      { title: 'Design Technologist', text: '' },
      { title: 'Design Technologist II', text: '' },
      { title: 'UI Platform Engineer', text: DS },
      { title: 'UI Platform Engineer', text: 'nope' },
      { title: 'Design Systems Lead', text: '' }, // passes on its own: not counted
      { title: 'Design Engineer', text: `${DS} ${AI}` },
    ];
    expect(relatedCounts(ps, { ...rule, relatedOff: ['UI Platform'] })).toEqual({
      'Design Technologist': 2,
      'UI Platform': 1,
      'Component Library': 0,
      'Frontend Platform': 0,
      'Design Engineer': 1,
    });
  });

  it('keeps the control and the off list in the entry (absent = on)', () => {
    setMustInclude('t', { related: false, relatedOff: ['UI Platform', 'UI Platform', 'Bogus'] });
    expect(readMustInclude('t')).toEqual({
      terms: [],
      atsOff: [],
      related: false,
      relatedOff: ['UI Platform'],
    });
    setMustInclude('t', { related: true, relatedOff: [] });
    expect(readMustInclude('t')).toEqual({ terms: [], atsOff: [] });
    expect(RELATED_TITLES.map((r) => r.id)).toEqual([
      'Design Technologist',
      'UI Platform',
      'Component Library',
      'Frontend Platform',
      'Design Engineer',
    ]);
  });

  it('rides the sync blob', () => {
    const local = {
      ...emptyBlob(),
      mustInclude: { t: { terms: ['design system'], atsOff: [], relatedOff: ['UI Platform'] } },
    };
    expect(readBlob(writeBlob(local)).mustInclude).toEqual(local.mustInclude);
  });
});
