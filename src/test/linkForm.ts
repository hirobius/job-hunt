// The job page's Documents and Decks show only with a link (#540, #593 item 11): the first one is
// added from the job's ⋯ menu. Opens that panel's form from the menu and returns the panel.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** The job page header's ⋯ menu trigger. */
export const jobMenuTrigger = () =>
  document.querySelector<HTMLButtonElement>('main header button[aria-label^="More actions:"]')!;

export async function openLinkForm(kind: 'document' | 'deck'): Promise<HTMLElement> {
  await userEvent.click(jobMenuTrigger());
  await userEvent.click(await screen.findByRole('menuitem', { name: `Add a ${kind} link…` }));
  return screen.findByRole('region', { name: kind === 'deck' ? 'Decks' : 'Documents' });
}
