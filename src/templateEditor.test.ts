import { describe, expect, it } from 'vitest';
import { insertAt, TOKEN_CHIPS } from './templateEditor';

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
