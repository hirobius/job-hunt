// Recently removed: emptying the list keeps focus on the page (#306), and each row says how long
// it has left (#307). Through App at #/apply, like jobPage.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, jobIdOf, removeJob } from './store';
import { replaceTrash } from './trash';
import { dismissNotice } from './saveNotice';

const URL_A = 'https://acme.example/jobs/7';
const URL_B = 'https://zenith.example/jobs/2';
const DAY = 86_400_000;

const renderPipeline = () => {
  window.location.hash = '#/apply';
  return render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );
};

const removed = (url: string, label: string, daysAgo = 0) => ({
  job: { url, label, status: 'Saved' as const },
  removedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
});

// The Account menu opens it (#416: off the Jobs page).
const openRemoved = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
  const menu = await screen.findByRole('menu');
  await userEvent.click(within(menu).getByRole('menuitem', { name: /^Recently removed/ }));
  return screen.findByRole('dialog', { name: 'Recently removed' });
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceTrash([]);
  dismissNotice();
});

describe('Recently removed keeps focus when it empties (#306)', () => {
  // On a phone the Apply tab is one job (Proposal A, Adrian 2026-11-08): no list on the page, so focus
  // goes back to the Account button the dialog was opened from.
  it('restoring the last one hands focus back to the Account button', async () => {
    addJob(URL_B, 'Welder');
    replaceTrash([removed(URL_A, 'Design Engineer')]);
    renderPipeline();
    const dialog = await openRemoved();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore: Design Engineer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Account/ })),
    );
    expect(jobIdOf(URL_A)).toBeTruthy();
  });

  it('deleting the last one hands focus back to the Account button', async () => {
    addJob(URL_B, 'Welder');
    replaceTrash([removed(URL_A, 'Design Engineer')]);
    renderPipeline();
    const dialog = await openRemoved();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Design Engineer' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Account/ })),
    );
  });
});

describe('Recently removed focus after a restore then a delete (review)', () => {
  it('the delete that empties it focuses the Account button, not the job restored earlier', async () => {
    addJob(URL_B, 'Welder');
    replaceTrash([removed(URL_A, 'Design Engineer'), removed('https://c.example/3', 'Machinist')]);
    renderPipeline();
    const dialog = await openRemoved();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore: Design Engineer' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete forever: Machinist' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Account/ })),
    );
  });
});

describe('Recently removed says how long each job has left (#307)', () => {
  it('shows the days until it is deleted', async () => {
    replaceTrash([removed(URL_A, 'Design Engineer', 27)]);
    renderPipeline();
    const dialog = await openRemoved();
    expect(within(dialog).getByText('Removed 27d ago · Deleted in 3 days')).toBeInTheDocument();
  });
});
