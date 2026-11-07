// The first run has no setup screen (Adrian 2026-10-29): a new user gets the design-systems Search
// profile (its titles, remote only) and the starter companies followed on their own, and the app
// opens on Today's Review new. Account → Search profile edits it. Sample data is offered from the
// Jobs page's empty state. Tested at the route seam through App.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';

const h = vi.hoisted(() => ({ fake: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, removeJob } from './store';
import { getCurationState, replaceCurationState } from './curation/curationStore';
import { getAllDocuments } from './documents';
import { getProfile, replaceProfiles, saveProfile } from './profile';
import { getSources, replaceSources } from './sources';
import { DESIGN_SYSTEMS_ATS_ROLES, DESIGN_SYSTEMS_TITLES, seedSources } from './searchDefaults';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const click = (name: string | RegExp, role = 'button') =>
  userEvent.click(screen.getByRole(role, { name }));
/** The titles in the Search profile form, as their Remove buttons name them. */
const titles = () =>
  screen
    .queryAllByRole('button', { name: /^Remove / })
    .map((b) => b.getAttribute('aria-label')?.replace(/^Remove /, ''));

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  replaceProfiles([]);
  replaceSources([]);
  window.history.replaceState(null, '', '/');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('a first visit', () => {
  it('makes the design-systems profile, follows the starter companies and opens on Review new', async () => {
    renderApp();
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(getProfile()).toMatchObject({
      titles: DESIGN_SYSTEMS_TITLES,
      mode: 'remote',
      location: '',
      include: { terms: ['design system'] },
      scorer: 'design-systems',
      // The broad searches too, so no feed is read for fewer terms than the old pack.
      atsRoles: DESIGN_SYSTEMS_ATS_ROLES,
    });
    // The seed list, followed with no step at all.
    expect(getSources()).toHaveLength(seedSources().length);
    expect(seedSources().length).toBeGreaterThan(20);
    expect(window.location.hash).toBe('#/find');
    expect(await screen.findByRole('region', { name: /^Review new/ })).toBeInTheDocument();
    // No setup screen and no step counter anywhere.
    expect(screen.queryByText('Set up your search')).toBeNull();
    expect(screen.queryByRole('progressbar', { name: /^Step / })).toBeNull();
  });

  it('adds no starter messages, documents, jobs or tracks', async () => {
    renderApp();
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(getAllDocuments()).toEqual([]);
    expect(getAllJobs()).toEqual([]);
    expect(getCurationState().categories).toEqual([]);
  });

  it('jobs saved before a profile existed get the profile too, with no setup screen', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/find';
    renderApp();
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(screen.queryByText('Set up your search')).toBeNull();
    expect(screen.getByRole('region', { name: /^Apply/ })).toBeInTheDocument();
  });

  it('keeps a profile that is already there', async () => {
    saveProfile({ titles: ['Design Systems Lead'], mode: 'hybrid' });
    renderApp();
    await screen.findByRole('region', { name: /^Review new/ });
    expect(getProfile()).toMatchObject({ titles: ['Design Systems Lead'], mode: 'hybrid' });
    // No starter companies followed over it (the keyless feeds are the move's own).
    expect(getSources().filter((x) => x.kind !== 'feed')).toEqual([]);
  });
});

describe('sample data, from the Jobs empty state', () => {
  it('stays opt-in: it fills the Pipeline and adds no track', async () => {
    window.location.hash = '#/apply';
    renderApp();
    await click('Try with sample data');
    expect(await screen.findByRole('status', { name: 'Sample data' })).toBeInTheDocument();
    expect(getAllJobs().length).toBeGreaterThan(0);
    expect(getCurationState().categories).toHaveLength(0);
  });

  it('Clear sample data removes the sample jobs', async () => {
    window.location.hash = '#/apply';
    renderApp();
    await click('Try with sample data');
    await click('Clear sample data');
    await waitFor(() => expect(getAllJobs()).toHaveLength(0));
  });
});

describe('Account menu → Search profile', () => {
  it('edits the profile in use: titles, remote only and leave out', async () => {
    saveProfile({ titles: ['Design Systems Lead'], mode: 'remote', leaveOut: ['Intern'] });
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/apply';
    renderApp();
    await click('Account');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Search profile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search profile' });
    expect(titles()).toEqual(['Design Systems Lead', 'Intern']);
    expect(screen.getByRole('switch', { name: 'Remote only' })).toBeChecked();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Job title' }),
      'Design Technologist{Enter}',
    );
    await click('Remove Intern');
    await click('Save');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(getProfile()).toMatchObject({
      titles: ['Design Systems Lead', 'Design Technologist'],
      mode: 'remote',
      leaveOut: [],
    });
  });
});

describe('Account menu → Search profile, opened before the profile arrives', () => {
  it('follows the stored profile until edited, so Save never writes the defaults over it', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/apply';
    renderApp();
    await click('Account');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Search profile' }));
    await screen.findByRole('dialog', { name: 'Search profile' });
    expect(titles()).toEqual(DESIGN_SYSTEMS_TITLES);
    // A pull lands with this account's profile while the dialog is open.
    act(() => void saveProfile({ titles: ['Design Ops Lead'], mode: 'hybrid' }));
    expect(titles()).toEqual(['Design Ops Lead']);
    await click('Save');
    expect(getProfile()).toMatchObject({ titles: ['Design Ops Lead'], mode: 'hybrid' });
  });
});

describe('a11y', () => {
  it('the first visit has no WCAG A/AA violations', async () => {
    const { container } = renderApp();
    await screen.findByRole('region', { name: /^Review new/ });
    const r = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(r.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('the first visit does not steal focus', () => {
    renderApp();
    expect(document.body).toHaveFocus();
  });

  // Dev runs under StrictMode (main.tsx), which runs a mount effect twice.
  it('the first visit does not steal focus under StrictMode either', () => {
    render(
      <ColorModeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ColorModeProvider>,
      { reactStrictMode: true },
    );
    expect(document.body).toHaveFocus();
  });
});
