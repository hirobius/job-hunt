// Recently removed: emptying the list keeps focus on the page (#306), and each row says how long
// it has left (#307). Through App at #/queue, like jobPage.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { getAllJobs, removeJob } from './store';
import { replaceTrash } from './trash';
import { dismissNotice } from './saveNotice';

const URL_A = 'https://acme.example/jobs/7';
const DAY = 86_400_000;

const renderPipeline = () => {
  window.location.hash = '#/queue';
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

const openRemoved = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Recently removed/ }));
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

describe('Recently removed says how long each job has left (#307)', () => {
  it('shows the days until it is deleted', async () => {
    replaceTrash([removed(URL_A, 'Design Engineer', 27)]);
    renderPipeline();
    const dialog = await openRemoved();
    expect(within(dialog).getByText('Removed 27d ago · Deleted in 3 days')).toBeInTheDocument();
  });
});
