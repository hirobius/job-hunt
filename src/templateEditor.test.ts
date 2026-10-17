import { describe, expect, it } from 'vitest';
import {
  insertAt,
  removeChipAt,
  snapOutOfChip,
  splitVariables,
  stepOver,
  templateVariables,
  TOKEN_CHIPS,
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

describe('chip-aware editing', () => {
  const v = 'Hi [Contact], ok';
  it('Backspace right after a chip removes the whole chip', () => {
    expect(removeChipAt(v, 12, 'back')).toEqual({ value: 'Hi , ok', caret: 3 });
  });
  it('Delete right before a chip removes the whole chip', () => {
    expect(removeChipAt(v, 3, 'forward')).toEqual({ value: 'Hi , ok', caret: 3 });
  });
  it('away from a chip it leaves editing to the browser', () => {
    expect(removeChipAt(v, 2, 'back')).toBeNull();
    expect(removeChipAt(v, 13, 'forward')).toBeNull();
  });
  it('arrow keys step over a chip in one press', () => {
    expect(stepOver(v, 3, 'forward')).toBe(12);
    expect(stepOver(v, 12, 'back')).toBe(3);
    expect(stepOver(v, 2, 'forward')).toBeNull();
  });
  it('a caret inside a chip snaps to its end', () => {
    expect(snapOutOfChip(v, 6)).toBe(12);
    expect(snapOutOfChip(v, 3)).toBe(3);
  });
});
