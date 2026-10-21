import { describe, expect, it } from 'vitest';
import {
  fillTemplate,
  fillSnippet,
  fillVariables,
  ownValue,
  resolveVariables,
  unfilledTokens,
  valuesFromJob,
} from './templateFill';
import type { Job } from './types';

describe('fillTemplate', () => {
  const cases: [string, string, Parameters<typeof fillTemplate>[1], string][] = [
    ['fills a token', 'Hi [Contact]', { contact: 'Sam' }, 'Hi Sam'],
    [
      'case-insensitive',
      '[company] / [ROLE]',
      { company: 'Acme', role: 'Welder' },
      'Acme / Welder',
    ],
    ['trims values', '[Company]', { company: '  Acme  ' }, 'Acme'],
    ['empty leaves token', 'At [Company]', { company: '' }, 'At [Company]'],
    ['whitespace-only leaves token', 'At [Company]', { company: '   ' }, 'At [Company]'],
    ['missing leaves token', 'At [Company]', {}, 'At [Company]'],
    ['unknown token untouched', 'Thanks, [Your name]', { company: 'Acme' }, 'Thanks, [Your name]'],
    [
      'repeated tokens',
      '[Role] at [Company]; [Role]',
      { role: 'Dev', company: 'X' },
      'Dev at X; Dev',
    ],
    ['value with $ is literal', '[Company]', { company: 'A$&B' }, 'A$&B'],
  ];
  it.each(cases)('%s', (_n, body, values, out) => {
    expect(fillTemplate(body, values)).toBe(out);
  });
});

describe('valuesFromJob', () => {
  it('maps job fields', () => {
    const job = { url: 'u', label: 'Dev', company: 'Acme', contact: 'Sam', angle: 'Hi' } as Job;
    expect(valuesFromJob(job)).toEqual({
      company: 'Acme',
      role: 'Dev',
      contact: 'Sam',
      angle: 'Hi',
    });
  });
});

describe('unfilledTokens', () => {
  it('lists remaining known tokens only', () => {
    expect(unfilledTokens('[Company] [role] [Your name]')).toEqual(['Company', 'Role']);
  });
});

describe('fillVariables', () => {
  it('fills any variable by name, without case; unset ones stay visible', () => {
    expect(
      fillVariables('[Pet], [your name] at [Company] [Role]', {
        pet: 'Rex',
        'your name': 'Sam',
        company: ' ',
      }),
    ).toBe('Rex, Sam at [Company] [Role]');
  });
});

describe('resolveVariables', () => {
  const job = { url: 'u', company: 'Acme', label: 'Welder', contact: '' } as Job;
  it('with no job, values come from the template, then the kit name', () => {
    expect(resolveVariables(['Company', 'Your name'], { company: 'X' }, null, 'Sam')).toEqual({
      company: { value: 'X', source: 'template' },
      'your name': { value: 'Sam', source: 'kit' },
    });
  });
  it('a picked job fills its fields; the template fills what the job lacks', () => {
    expect(
      resolveVariables(['Company', 'Contact', 'Pet'], { contact: 'Team', pet: 'Rex' }, job),
    ).toEqual({
      company: { value: 'Acme', source: 'job' },
      contact: { value: 'Team', source: 'template' },
      pet: { value: 'Rex', source: 'template' },
    });
  });
  it('a template value beats the kit name', () => {
    expect(
      resolveVariables(['Your name'], { 'your name': 'A' }, null, 'B')['your name'].value,
    ).toBe('A');
  });
});

describe('fillSnippet', () => {
  it('fills from the job, then the template values, then the kit name', () => {
    const job = { url: 'u', company: 'Acme', label: 'Welder' } as Job;
    expect(
      fillSnippet(
        { body: '[Role] at [Company], [Contact]. [Your name] [X]', values: { contact: 'Team' } },
        job,
        'Sam',
      ),
    ).toBe('Welder at Acme, Team. Sam [X]');
  });
});

describe('variables named after Object.prototype members', () => {
  const names = ['constructor', '__proto__', 'toString', 'hasOwnProperty'];
  it.each(names)('[%s] stays visible when unset and never throws', (n) => {
    const job = { url: 'u', company: 'Acme' } as Job;
    expect(fillSnippet({ body: `Hi [${n}]` }, job, 'Sam')).toBe(`Hi [${n}]`);
    expect(fillVariables(`[${n}]`, {})).toBe(`[${n}]`);
    expect(Object.keys(resolveVariables([n], {}, job))).toEqual([]);
  });
  it.each(names)('[%s] fills from its own template value', (n) => {
    const values = Object.fromEntries([[n.toLowerCase(), 'X']]);
    expect(fillSnippet({ body: `[${n}]`, values }, null)).toBe('X');
  });
  it('ignores non-string values from an unsanitized synced blob', () => {
    const values = { pet: 42, contact: null } as unknown as Record<string, string>;
    expect(fillSnippet({ body: '[Pet] [Contact]', values }, null)).toBe('[Pet] [Contact]');
    expect(ownValue({ a: 1 } as Record<string, unknown>, 'a')).toBeUndefined();
  });
});
