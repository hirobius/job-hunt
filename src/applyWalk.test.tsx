// The phone's walk control (#542): the view picker (a Menu with the six views and "All jobs and
// filters"), the "N filters" chip only while a filter is on, and the pager, which only steps.
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
import {
  DEFAULT_VIEW,
  filtersOn,
  getPipelineView,
  resetPipelineView,
  setPipelineView,
} from './pipelineView';
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

describe('filtersOn', () => {
  it('counts the search and Remote only, never the view or sort', () => {
    expect(filtersOn(DEFAULT_VIEW)).toBe(0);
    expect(filtersOn({ ...DEFAULT_VIEW, filter: 'applied', sort: 'company' as never })).toBe(0);
    expect(filtersOn({ ...DEFAULT_VIEW, q: '  ' })).toBe(0);
    expect(filtersOn({ ...DEFAULT_VIEW, q: 'acme' })).toBe(1);
    expect(filtersOn({ ...DEFAULT_VIEW, q: 'acme', remoteOnly: true })).toBe(2);
  });
});

describe('the walk row on a phone', () => {
  it('names the open view; the picker lists the six views and All jobs and filters', async () => {
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
    ]);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'All jobs and filters' })).toBeVisible();
    await user.click(radios[4]);
    expect(getPipelineView().filter).toBe('applied');
    expect(await screen.findByRole('button', { name: 'View: Applied' })).toBeInTheDocument();
  });

  it('All jobs and filters opens the All jobs sheet', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'View: To apply' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All jobs and filters' }));
    expect(await screen.findByRole('dialog', { name: 'All jobs' })).toBeInTheDocument();
  });

  it('shows the N filters chip only while a filter is on; it opens the sheet', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('button', { name: 'View: To apply' });
    expect(screen.queryByRole('button', { name: /filters?, open All jobs/ })).toBeNull();
    act(() => setPipelineView({ q: 'Designer' }));
    expect(screen.getByRole('button', { name: '1 filter, open All jobs' })).toHaveTextContent(
      '1 filter',
    );
    act(() => setPipelineView({ remoteOnly: true }));
    const chip = screen.getByRole('button', { name: '2 filters, open All jobs' });
    await user.click(chip);
    expect(await screen.findByRole('dialog', { name: 'All jobs' })).toBeInTheDocument();
  });

  it('the job page has no filter bar (#543): search and Sort are in the All jobs sheet', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('button', { name: 'View: To apply' });
    expect(screen.queryByRole('region', { name: 'Filter jobs' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sort:/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'View: To apply' }));
    await user.click(await screen.findByRole('menuitem', { name: 'All jobs and filters' }));
    const sheet = await screen.findByRole('dialog', { name: 'All jobs' });
    expect(within(sheet).getByRole('textbox', { name: 'Search saved jobs' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /^Sort:/ })).toBeInTheDocument();
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
