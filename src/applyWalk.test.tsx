// The phone's walk control (#542): the view picker (a Menu with the seven views and "All jobs") and
// the pager, which only steps. No filters chip since the control-free list (2026-11-13).
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

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  resetPipelineView();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
  addJob('https://acme.example/jobs/1', 'Acme Designer');
  addJob('https://bolt.example/jobs/2', 'Bolt Designer');
  addJob('https://cask.example/jobs/3', 'Cask Designer');
  updateJob('https://cask.example/jobs/3', { status: 'Applied' });
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

describe('the walk row on a phone', () => {
  it('names the open view; the picker lists the seven views and All jobs', async () => {
    const user = userEvent.setup();
    renderApp();
    const picker = await screen.findByRole('button', { name: 'View: To apply' });
    await user.click(picker);
    const menu = await screen.findByRole('menu');
    const radios = within(menu).getAllByRole('menuitemradio');
    expect(radios.map((r) => r.textContent)).toEqual([
      'To apply (2)',
      'Follow up (0)',
      'This week (0)',
      'Interviewing (0)',
      'Applied (1)',
      'Recently closed (0)',
      'Passed (0)',
    ]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'All jobs' })).toBeVisible();
    await user.click(radios[4]);
    expect(getPipelineView().filter).toBe('applied');
    expect(await screen.findByRole('button', { name: 'View: Applied' })).toBeInTheDocument();
  });

  it('All jobs opens the All jobs sheet', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'View: To apply' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All jobs' }));
    expect(await screen.findByRole('dialog', { name: 'All jobs' })).toBeInTheDocument();
  });

  it('has no filters chip, and the sheet has no search, filters or Sort', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('button', { name: 'View: To apply' });
    expect(screen.queryByRole('button', { name: /filters?, open All jobs/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sort:/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View: To apply' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All jobs' }));
    const sheet = await screen.findByRole('dialog', { name: 'All jobs' });
    expect(within(sheet).queryByRole('textbox')).toBeNull();
    expect(within(sheet).queryByRole('button', { name: /^Sort:/ })).toBeNull();
    expect(within(sheet).queryByRole('group', { name: 'Filters' })).toBeNull();
    expect(within(sheet).getByRole('group', { name: 'Views' })).toBeInTheDocument();
  });

  it('the pager only steps', async () => {
    renderApp();
    const pager = await screen.findByRole('navigation', { name: 'Jobs in the list' });
    expect(within(pager).queryByRole('menu')).toBeNull();
    expect(
      within(pager)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(expect.arrayContaining(['Previous page', 'Next page']));
  });
});

describe('an empty view on a phone (prod audit 2026-11-12)', () => {
  it('shows the view\'s empty state, not the last job under "Not in this filter"', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'View: To apply' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Recently closed (0)' }));
    expect(await screen.findByText('Nothing under “Recently closed”')).toBeInTheDocument();
    expect(screen.queryByText('Not in this filter')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: /Designer/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show to apply' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Designer/ })).toBeInTheDocument();
  });
});
