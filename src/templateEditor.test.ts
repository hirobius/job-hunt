import { describe, expect, it } from 'vitest';
import {
  insertAt,
  insertToken,
  splitVariables,
  templateVariables,
  TOKEN_CHIPS,
  rowChips,
} from './templateEditor';

describe('insertAt', () => {
  it('inserts at a caret and puts the caret after the token', () => {
    expect(insertAt('Hello world', 5, 5, '[Role]')).toEqual({
      value: 'Hello[Role] world',
      caret: 11,
    });
  });
  it('replaces a selection', () => {
    expect(insertAt('Hi NAME,', 3, 7, '[Contact]')).toEqual({ value: 'Hi [Contact],', caret: 12 });
  });
  it('appends when there is no caret', () => {
    expect(insertAt('Dear', null, null, '[Contact]')).toEqual({
      value: 'Dear[Contact]',
      caret: 13,
    });
  });
});

// #207: a variable put in from the chips or the menu never glues onto the words beside it, so a
// template never reads "[Company]Hi [Contact],". Typed and pasted text still go in as they are.
describe('insertToken', () => {
  it.each([
    ['start of a line', 'Hi [Contact],', 0, 0, '[Company]', '[Company] Hi [Contact],', 10],
    [
      'start of a later line',
      'Hello\nHi there',
      6,
      6,
      '[Company]',
      'Hello\n[Company] Hi there',
      16,
    ],
    ['end of a line', 'Hi there\nBye', 8, 8, '[Role]', 'Hi there [Role]\nBye', 15],
    ['mid-word', 'Helloworld', 5, 5, '[Role]', 'Hello [Role] world', 13],
    ['before a space', 'Hello world', 5, 5, '[Role]', 'Hello [Role] world', 12],
    ['after a space', 'Hello world', 6, 6, '[Role]', 'Hello [Role] world', 13],
    ['after punctuation', 'Hi,', 3, 3, '[Role]', 'Hi, [Role]', 10],
    ['before punctuation', 'Hi ,', 3, 3, '[Role]', 'Hi [Role],', 9],
    ['between two chips', '[Company][Role]', 9, 9, '[Contact]', '[Company] [Contact] [Role]', 20],
    ['an empty body', '', 0, 0, '[Role]', '[Role]', 6],
    ['no caret: on the end', 'Dear', null, null, '[Contact]', 'Dear [Contact]', 14],
    ['over a selection', 'Hi NAME,', 3, 7, '[Contact]', 'Hi [Contact],', 12],
  ])('%s', (_case, value, start, end, token, want, caret) => {
    expect(insertToken(value, start, end, token)).toEqual({ value: want, caret });
  });
});

describe('TOKEN_CHIPS', () => {
  it('lists the fill tokens, then Your name, each with a hint', () => {
    expect(TOKEN_CHIPS.map((c) => c.token)).toEqual([
      '[Company]',
      '[Role]',
      '[Contact]',
      '[Angle]',
      '[Your name]',
    ]);
    TOKEN_CHIPS.forEach((c) => expect(c.hint.length).toBeGreaterThan(0));
  });
});

describe('splitVariables', () => {
  it('splits text and [Variable] chips, keeping the text exact', () => {
    expect(splitVariables('Hi [Contact],\nat [Company]')).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'var', token: '[Contact]', name: 'Contact' },
      { kind: 'text', text: ',\nat ' },
      { kind: 'var', token: '[Company]', name: 'Company' },
    ]);
  });
  it('takes any short bracketed name, but not empty or long brackets', () => {
    expect(splitVariables('[Hiring manager] [] [x]').filter((s) => s.kind === 'var')).toEqual([
      { kind: 'var', token: '[Hiring manager]', name: 'Hiring manager' },
      { kind: 'var', token: '[x]', name: 'x' },
    ]);
    const long = '[' + 'a'.repeat(41) + ']';
    expect(splitVariables(long)).toEqual([{ kind: 'text', text: long }]);
  });
  it('round-trips', () => {
    const s = 'Dear [Contact],\n\n[Angle]\n[Your name]\n';
    expect(
      splitVariables(s)
        .map((p) => (p.kind === 'text' ? p.text : p.token))
        .join(''),
    ).toBe(s);
  });
});

describe('templateVariables', () => {
  it('lists each variable once, in order, matched without case', () => {
    expect(templateVariables('[role] at [Company], [Role]; [Your name] [Pet]')).toEqual([
      'Role',
      'Company',
      'Your name',
      'Pet',
    ]);
  });
});

describe('rowChips', () => {
  it('orders known variables like TOKEN_CHIPS, custom ones after, in text order', () => {
    expect(rowChips(['Contact', 'Pet', 'Role', 'Company'], 9)).toEqual({
      shown: ['Company', 'Role', 'Contact', 'Pet'],
      more: 0,
    });
  });
  it('shows three and counts the rest', () => {
    expect(rowChips(['Contact', 'Role', 'Company', 'Angle', 'Your name'])).toEqual({
      shown: ['Company', 'Role', 'Contact'],
      more: 2,
    });
  });
  it('shows nothing for no variables', () => {
    expect(rowChips([])).toEqual({ shown: [], more: 0 });
  });
});
