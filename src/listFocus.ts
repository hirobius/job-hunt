// Keep keyboard focus in the Pipeline's Jobs list when the focused job leaves it (audit
// 2026-10-27): Mark applied, Remove, Retire or a status change that filters the card out used to
// drop focus on <body>, sending a keyboard or screen reader user back to the top of the page.
// The card under it (or the one above, for the last) takes focus instead; with none left, the
// fallback does (the search). A card that stays but loses the focused button (Mark applied on a
// starred job) keeps focus on its own title. Cards carry `data-pipeline-job` with their job's URL.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export const JOB_ATTR = 'data-pipeline-job';

const lost = () => !document.activeElement || document.activeElement === document.body;

export function useListFocusKeeper(shown: string[], fallback: RefObject<HTMLElement>) {
  // The job whose card last held focus, and where it sat in the list.
  const last = useRef<{ url: string; index: number } | null>(null);
  const shownRef = useRef(shown);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const card = (e.target as Element | null)?.closest?.(`[${JOB_ATTR}]`);
      const url = card?.getAttribute(JOB_ATTR);
      last.current = url ? { url, index: shownRef.current.indexOf(url) } : null;
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);

  useLayoutEffect(() => {
    shownRef.current = shown;
    const was = last.current;
    if (!was || !lost()) return;
    last.current = null;
    // A card that stays but lost its focused control (Mark applied on a starred job) keeps it.
    const url = shown.includes(was.url) ? was.url : shown[Math.min(was.index, shown.length - 1)];
    const card = url
      ? [...document.querySelectorAll(`[${JOB_ATTR}]`)].find(
          (c) => c.getAttribute(JOB_ATTR) === url,
        )
      : undefined;
    const link = card?.querySelector<HTMLElement>('h3 a');
    (link ?? fallback.current)?.focus();
  }, [shown, fallback]);
}
