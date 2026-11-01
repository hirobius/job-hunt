// The open state of two dialogs mounted once (#416): Add interview (the job's ⋯ menu, an
// Interviewing job's primary) and Recently removed (the Account menu). In memory only.
import { createStore } from './createStore';

// The URL of the job whose Add interview dialog is open, or null, and the control to give focus
// back to on close (the menu item that opened it is gone by then).
const interviewFor = createStore<string | null>(null);
let interviewOpener: HTMLElement | null = null;
export const useAddInterviewTarget = interviewFor.use;
export const openAddInterview = (url: string, opener?: HTMLElement | null) => {
  interviewOpener = opener ?? null;
  interviewFor.set(url);
};
export const closeAddInterview = () => interviewFor.set(null);
/** For the dialog's `onCloseAutoFocus`: focus its opener when it is still on the page. */
export function focusInterviewOpener(e: Event) {
  const el = interviewOpener;
  interviewOpener = null;
  if (!el?.isConnected) return;
  e.preventDefault();
  el.focus();
}

const removedShown = createStore(false);
export const useRecentlyRemovedOpen = removedShown.use;
export const openRecentlyRemoved = () => removedShown.set(true);
export const closeRecentlyRemoved = () => removedShown.set(false);
