import { beforeEach, describe, expect, it } from 'vitest';
import {
  includeFields,
  keepIncluded,
  passesInclude,
  mentionsAny,
  mergeMustInclude,
  readMustInclude,
  relatedCounts,
  relatedIsOn,
  RELATED_TITLES,
  toggleRelated,
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

  const title = 'Welder';
  const body = 'Weld our cooling systems.';
  // [phrase in title, neither, phrase only in the description]
  it.each([
    ['default: title only', {}, [true, false, false]],
    ['both on', { inText: true }, [true, false, true]],
    ['description only', { inTitle: false, inText: true }, [false, false, true]],
    ['both off = title only', { inTitle: false, inText: false }, [true, false, false]],
  ] as const)('%s', (_n, f, want) => {
    const rule = { terms: ['systems'], ...f };
    expect([
      passesInclude(rule, 'Welder, Systems Lead', ''),
      passesInclude(rule, title, ''),
      passesInclude(rule, title, body),
    ]).toEqual(want);
  });

  it('a design system rule reads the title only, whatever the toggles say', () => {
    for (const f of [{}, { inText: true }, { inTitle: false, inText: true }]) {
      const rule = { terms: ['design system'], ...f };
      expect(includeFields(rule)).toEqual({ title: true, text: false });
      expect(passesInclude(rule, 'Design Systems Lead', '')).toBe(true);
      expect(passesInclude(rule, 'Product Designer', 'Grow our design system.')).toBe(false);
    }
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
  // Description on: it must never let a title in on a design system rule (Adrian 2026-10-23: only
  // titles saying design system(s) or Design Technologist).
  const rule = { terms: ['design system'], inText: true };
  const DS = 'You will grow our design system with Claude Code and Cursor.';
  it.each([
    ['Design Technologist', '', true],
    ['Senior Design Technologist', 'Nothing about it.', true],
    ['Staff Design Engineer, Design Systems', '', true],
    // Live postings (Adrian's phone) and Ashby's roles in Companies → Watched.
    ['Senior Design Engineer', DS, false],
    ['Staff Design Engineer', DS, false],
    ['Design Engineer – Americas', DS, false],
    ['Design Engineer – Canada', DS, false],
    ['Design Engineer – EU', DS, false],
    ['Design Engineer – UK', DS, false],
    ['Design Engineer', DS, false],
    ['UI Platform Engineer', DS, false],
    ['Component Library Engineer', DS, false],
    ['Frontend Platform Engineer', DS, false],
    ['Product Designer', DS, false],
  ])('%s · %s → %s', (title, text, want) => {
    expect(passesInclude(rule, title, text)).toBe(want);
    expect(passesInclude({ terms: ['design system'] }, title, text)).toBe(want);
  });

  it('Design Technologist is the only related title', () => {
    expect(RELATED_TITLES.map((r) => r.id)).toEqual(['Design Technologist']);
  });

  it('a title switched off no longer passes; the control off turns them all off', () => {
    expect(
      passesInclude({ ...rule, relatedOff: ['Design Technologist'] }, 'Design Technologist'),
    ).toBe(false);
    expect(passesInclude({ ...rule, related: false }, 'Design Technologist')).toBe(false);
    expect(relatedIsOn(rule, 'Design Technologist')).toBe(true);
    expect(toggleRelated(rule, 'Design Technologist')).toEqual({
      relatedOff: ['Design Technologist'],
    });
    expect(
      toggleRelated({ ...rule, relatedOff: ['Design Technologist'] }, 'Design Technologist'),
    ).toEqual({ relatedOff: [] });
  });

  it('only on a rule that asks for design system(s); a bare list has no related path', () => {
    expect(passesInclude({ terms: ['welding'] }, 'Design Technologist')).toBe(false);
    expect(passesInclude({ terms: ['design systems'] }, 'Design Technologist')).toBe(true);
    expect(passesInclude(['design system'], 'Design Technologist')).toBe(false);
  });

  it('Companies and dream rows (keepIncluded) take the same rule', () => {
    const roles = [
      { id: 'a', title: 'Design Technologist', text: '' },
      { id: 'b', title: 'Backend Engineer', text: DS },
      { id: 'c', title: 'Staff Design Engineer', text: DS },
    ];
    expect(keepIncluded(roles, rule).map((r) => r.id)).toEqual(['a']);
  });

  it('counts what each title would let in, on or off', () => {
    const ps = [
      { title: 'Design Technologist', text: '' },
      { title: 'Design Technologist II', text: '' },
      { title: 'Design Systems Lead', text: '' }, // passes on its own: not counted
      { title: 'Design Engineer', text: DS },
    ];
    expect(relatedCounts(ps, { ...rule, relatedOff: ['Design Technologist'] })).toEqual({
      'Design Technologist': 2,
    });
  });

  it('keeps the control and the off list in the entry (absent = on); retired ids are dropped', () => {
    setMustInclude('t', {
      related: false,
      relatedOff: ['Design Technologist', 'Design Technologist', 'UI Platform'],
    });
    expect(readMustInclude('t')).toEqual({
      terms: [],
      atsOff: [],
      related: false,
      relatedOff: ['Design Technologist'],
    });
    setMustInclude('t', { related: true, relatedOff: [] });
    expect(readMustInclude('t')).toEqual({ terms: [], atsOff: [] });
  });

  it('Match in description defaults off: a stored default (absent) reads off, only true is kept', () => {
    expect(sanitizeMustInclude({ t: { terms: ['x'] } }).t.inText).toBeUndefined();
    expect(sanitizeMustInclude({ t: { terms: ['x'], inText: false } }).t.inText).toBeUndefined();
    expect(sanitizeMustInclude({ t: { terms: ['x'], inText: true } }).t.inText).toBe(true);
    expect(includeFields({ terms: ['x'] })).toEqual({ title: true, text: false });
  });

  it('rides the sync blob', () => {
    const local = {
      ...emptyBlob(),
      mustInclude: {
        t: { terms: ['design system'], atsOff: [], relatedOff: ['Design Technologist'] },
      },
    };
    expect(readBlob(writeBlob(local)).mustInclude).toEqual(local.mustInclude);
  });
});
