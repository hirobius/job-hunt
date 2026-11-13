// The To apply view's done state (#554): every job applied to, the Apply tab shows the empty-state icon tile,
// "That is the list", the week's line, one filled key for the next step and the grey All jobs key.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, removeJob, updateJob } from './store';
import { getPipelineView, resetPipelineView } from './pipelineView';
import { dismissNotice } from './saveNotice';
import { ymd } from './jobEvents';

const A = 'https://acme.example/jobs/1';
const B = 'https://bolt.example/jobs/2';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86400000));

beforeEach(() => {
  localStorage.clear();
  resetPipelineView();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
  addJob(A, 'Acme Designer');
  addJob(B, 'Bolt Designer');
  updateJob(A, { status: 'Applied', applied: daysAgo(1) });
  updateJob(B, { status: 'Applied', applied: daysAgo(2) });
});
afterEach(() => {
  cleanup();
  act(() => dismissNotice());
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  localStorage.clear();
  resetPipelineView();
});

describe('Apply done state (#554)', () => {
  it('shows the icon tile (no flame), the week and two keys, on the page background', async () => {
    renderApp();
    const done = await screen.findByRole('region', { name: 'That is the list' });
    expect(within(done).getByText('That is the list')).toBeTruthy();
    expect(within(done).getByText('You applied to 2 jobs this week.')).toBeTruthy();
    // The standard EmptyState icon tile (2026-11-13), no flame.
    expect(done.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
    expect(done.querySelector('.rjb-flame')).toBeNull();
    // No card around it (#553).
    expect(done.closest('[data-padding][data-variant]')).toBeNull();
    const next = within(done).getByRole('button', { name: 'Find more jobs' });
    const all = within(done).getByRole('button', { name: 'All jobs' });
    expect(next.className).not.toBe(all.className);
    // The page keeps its h1 (focus lands there after the last Mark applied).
    expect(screen.getByRole('heading', { level: 1, name: 'Apply' })).toBeTruthy();
  });

  it('Find more jobs goes to Find', async () => {
    renderApp();
    const done = await screen.findByRole('region', { name: 'That is the list' });
    await userEvent.click(within(done).getByRole('button', { name: 'Find more jobs' }));
    expect(window.location.hash).toMatch(/^#\/find/);
  });

  it('All jobs opens the All jobs view, and its first job', async () => {
    renderApp();
    const done = await screen.findByRole('region', { name: 'That is the list' });
    await userEvent.click(within(done).getByRole('button', { name: 'All jobs' }));
    expect(getPipelineView().filter).toBe('all');
    expect(screen.queryByRole('region', { name: 'That is the list' })).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: /Designer/ })).toBeTruthy();
  });

  it('with a follow-up due, the filled key is Follow up', async () => {
    updateJob(A, { applied: daysAgo(10) });
    renderApp();
    const done = await screen.findByRole('region', { name: 'That is the list' });
    expect(
      within(done).getByText('You applied to 1 job this week. 1 follow-up is due.'),
    ).toBeTruthy();
    await userEvent.click(within(done).getByRole('button', { name: 'Follow up (1)' }));
    expect(getPipelineView().filter).toBe('followUp');
  });

  it('a job still to apply to opens instead', async () => {
    updateJob(B, { status: 'Saved', applied: undefined });
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Bolt Designer' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'That is the list' })).toBeNull();
  });
});
