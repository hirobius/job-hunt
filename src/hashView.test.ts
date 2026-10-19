import { afterEach, describe, expect, it } from 'vitest';
import { readView, withView } from './hashView';

afterEach(() => {
  window.location.hash = '';
});

describe('readView', () => {
  it.each([
    ['#/discover/live?view=companies', 'companies'],
    ['#/discover/live?pillar=abc&view=companies', 'companies'],
    ['#/discover/live', null],
    ['#/discover/live?view=', null],
    ['', null],
  ])('%j', (hash, view) => {
    expect(readView(hash)).toBe(view);
  });
});

describe('withView', () => {
  it('adds, replaces and removes the view, keeping the rest of the hash', () => {
    expect(withView('#/discover/live', 'companies')).toBe('#/discover/live?view=companies');
    expect(withView('#/discover/live?pillar=abc', 'companies')).toBe(
      '#/discover/live?pillar=abc&view=companies',
    );
    expect(withView('#/discover/live?view=companies', null)).toBe('#/discover/live');
    expect(withView('#/discover/live?pillar=abc&view=companies', null)).toBe(
      '#/discover/live?pillar=abc',
    );
  });
});
