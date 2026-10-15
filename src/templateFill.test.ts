import { describe, expect, it } from 'vitest';
import { fillTemplate, unfilledTokens, valuesFromJob } from './templateFill';
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
