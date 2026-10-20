// The follow-up flow (2026-10-17): a due follow-up is a message to send, not a box to tick. Any
// "Follow up" button opens the one dialog (FollowUp.tsx) for a job; this module holds which job
// that is, and which template the message starts from. Pure apart from the tiny open-state store.
import { createStore } from './createStore';
import type { Snippet } from './copyDeckStore';

type Template = Pick<Snippet, 'id' | 'label' | 'body' | 'values'> & { pinned?: boolean };

/** The starter "Follow-up after applying" template. */
const FOLLOWUP_TEMPLATE_ID = 'tpl-followup';

/** The template a follow-up starts from: the starter one, else the first whose name says
 *  follow-up (pinned first), else none. */
export function pickFollowUpTemplate<T extends Template>(snippets: readonly T[]): T | undefined {
  const starter = snippets.find((s) => s.id === FOLLOWUP_TEMPLATE_ID);
  if (starter) return starter;
  const named = snippets.filter((s) => /follow[\s-]?up/i.test(s.label));
  return named.find((s) => s.pinned) ?? named[0];
}

// The URL of the job whose follow-up dialog is open, or null. In memory only: closing, reloading
// or navigating away simply forgets it.
const target = createStore<string | null>(null);
export const useFollowUpTarget = target.use;
export const openFollowUp = (url: string) => target.set(url);
export const closeFollowUp = () => target.set(null);
