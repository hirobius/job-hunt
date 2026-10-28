// The open state of two dialogs mounted once (#416): Add interview (the job's ⋯ menu, an
// Interviewing job's primary) and Recently removed (the Account menu). In memory only.
import { createStore } from './createStore';

// The URL of the job whose Add interview dialog is open, or null.
const interviewFor = createStore<string | null>(null);
export const useAddInterviewTarget = interviewFor.use;
export const openAddInterview = (url: string) => interviewFor.set(url);
export const closeAddInterview = () => interviewFor.set(null);

const removedShown = createStore(false);
export const useRecentlyRemovedOpen = removedShown.use;
export const openRecentlyRemoved = () => removedShown.set(true);
export const closeRecentlyRemoved = () => removedShown.set(false);
