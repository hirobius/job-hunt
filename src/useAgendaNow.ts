// The clock the Pipeline's agenda reads (#309). A tab left open overnight never re-renders on its
// own, so "Today", the Follow-up due badges and the Next 7 days window would keep yesterday's
// dates: this re-reads the time at the next local midnight and whenever the tab comes back into
// view (a sleeping laptop's timer fires late, or not at all), and as each of today's interviews or
// calls ends, so it leaves Next 7 days then.
import { useEffect, useState } from 'react';
import { nextEventEnd } from './jobEvents';
import type { Job } from './types';

/** Milliseconds from `now` to the next local midnight (a daylight-saving day included). */
export function msToMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** The current time, read fresh on every render; re-renders at each local midnight, when one of
 *  today's timed events in `jobs` ends (#311) and when the tab becomes visible. */
export function useAgendaNow(jobs: readonly Job[]): Date {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    // Re-armed after each tick, so every midnight is caught, not only the first.
    const now = new Date();
    const end = nextEventEnd(jobs, now);
    const timer = setTimeout(bump, end ? end.getTime() - now.getTime() : msToMidnight(now) + 1);
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tick, jobs]);
  return new Date();
}
