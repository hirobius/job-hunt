// refocusAccount's deferred check never throws once the page is gone (a test's teardown, a
// closing tab): it ran after jsdom teardown as "document is not defined" (companiesList.test).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refocusAccount } from './accountContext';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('refocusAccount', () => {
  it('focuses the Account button when focus fell to the body', () => {
    vi.useFakeTimers();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    refocusAccount(trigger)();
    vi.runAllTimers();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('does nothing, and does not throw, when the document is gone by then', () => {
    vi.useFakeTimers();
    refocusAccount(document.createElement('button'))();
    vi.stubGlobal('document', undefined);
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
