import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAnswerGuard, tooSoon } from './answerGuard';

// A double tap's second tap after Mark applied / Not a fit / Save / Skip can land on whatever the
// next job put under the finger (its menu, Sort). For the guard's window, presses inside `main` are
// swallowed; outside it (the Account menu, notices) they are not.
describe('the double-tap guard', () => {
  afterEach(() => {
    resetAnswerGuard();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('swallows presses inside main for 700 ms after an answer, then lets them through', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main><button id="in">In</button></main><button id="out">Out</button>';
    const hits: string[] = [];
    for (const id of ['in', 'out'])
      document.getElementById(id)!.addEventListener('click', () => hits.push(id));
    expect(tooSoon()).toBe(false); // an answer
    document.getElementById('in')!.click();
    document.getElementById('out')!.click();
    expect(hits).toEqual(['out']);
    vi.advanceTimersByTime(700);
    document.getElementById('in')!.click();
    expect(hits).toEqual(['out', 'in']);
  });
});
