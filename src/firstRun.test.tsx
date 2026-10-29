// The first run is the Search profile form (#388, after #132): two steps (job titles, then where and
// what to leave out) in one narrow column. Tested at the route seam through App: the shell's gate
// shows it on Today for a first run; Finish saves the profile, follows the starter design-system
// companies and opens Today's Review new.
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
const step = (n: number) =>
  expect(screen.getByRole('progressbar', { name: `Step ${n} of 2` })).toBeInTheDocument();
/** The titles on step 1, as their Remove buttons name them. */
const titles = () =>
  screen
    .queryAllByRole('button', { name: /^Remove / })
    .map((b) => b.getAttribute('aria-label')?.replace(/^Remove /, ''));
const removeAllTitles = async () => {
  for (const b of screen.queryAllByRole('button', { name: /^Remove / })) await userEvent.click(b);
};

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

describe('step 1: job titles', () => {
  it('a first visit opens on Step 1 of 2 with the design-system titles and sample data on offer', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Set up your search' })).toBeInTheDocument();
    step(1);
    expect(screen.getByRole('heading', { name: 'What roles do you want?' })).toBeInTheDocument();
    expect(titles()).toEqual(DESIGN_SYSTEMS_TITLES);
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument();
    // Continue is never disabled, and the first step has no Back.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('a title is added with Enter and removed with its X', async () => {
    renderApp();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Job title' }),
      'Design Technologist{Enter}',
    );
    expect(titles()).toContain('Design Technologist');
    await click('Remove Staff Design Systems');
    expect(titles()).not.toContain('Staff Design Systems');
  });

  it('with no title, Continue says why, stays on step 1 and focuses the field', async () => {
    renderApp();
    await removeAllTitles();
    await click('Continue');
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one job title.');
    step(1);
    expect(screen.getByRole('textbox', { name: 'Job title' })).toHaveFocus();
  });

  it('sample data stays opt-in: it ends the first run with the sample Pipeline', async () => {
    renderApp();
    await click('Try with sample data');
    expect(await screen.findByRole('tab', { name: 'Jobs', selected: true })).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: 'Sample data' })).toBeInTheDocument();
    expect(getProfile()).toBeNull();
    expect(getSources()).toEqual([]);
  });

  it('Clear sample data removes the sample jobs', async () => {
    renderApp();
    await click('Try with sample data');
    await click('Clear sample data');
    await waitFor(() => expect(getAllJobs()).toHaveLength(0));
    expect(getCurationState().categories).toHaveLength(0);
  });
});

describe('step 2: where, and what to leave out', () => {
  it('remote only is on by default; Back returns with the titles kept', async () => {
    renderApp();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Job title' }),
      'Design Technologist{Enter}',
    );
    await click('Continue');
    step(2);
    expect(screen.getByRole('switch', { name: 'Remote only' })).toBeChecked();
    expect(
      screen.getByText('On-site and hybrid roles are counted, not listed.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'City, state or region' })).toBeNull();
    await click('Back');
    step(1);
    expect(titles()).toContain('Design Technologist');
  });

  it('Finish saves the profile, follows the starter companies and opens Review new', async () => {
    renderApp();
    await click('Continue');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Word to leave out' }),
      'Contract{Enter}',
    );
    await click('Finish');
    expect(getProfile()).toMatchObject({
      titles: DESIGN_SYSTEMS_TITLES,
      mode: 'remote',
      location: '',
      leaveOut: ['Contract'],
      include: { terms: ['design system'] },
      scorer: 'design-systems',
      // The broad searches too, so no feed is read for fewer terms than the old pack.
      atsRoles: DESIGN_SYSTEMS_ATS_ROLES,
    });
    // The seed list, followed with no extra step.
    expect(getSources()).toHaveLength(seedSources().length);
    expect(seedSources().length).toBeGreaterThan(20);
    expect(await screen.findByText('Your search is set up')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/today');
    expect(await screen.findByRole('region', { name: /^Review new/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Browse', checked: true })).toBeInTheDocument();
  });

  it('remote only off asks where, and searches anywhere when left blank', async () => {
    renderApp();
    await click('Continue');
    await click('Remote only', 'switch');
    expect(
      screen.getByText('Remote, hybrid and on-site roles are all listed.'),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'City, state or region' }),
      'Spokane, WA',
    );
    await click('Finish');
    expect(getProfile()).toMatchObject({ mode: 'any', location: 'Spokane, WA' });
  });
});

describe('a clean first run (Adrian 2026-10-22: nothing the user did not create)', () => {
  /** Every visible text field's placeholder. */
  const placeholders = () =>
    screen.queryAllByRole('textbox').map((el) => el.getAttribute('placeholder'));

  it('each field shows only its own name as the placeholder: no "e.g." and no made-up example', async () => {
    renderApp();
    expect(screen.getByRole('textbox', { name: 'Job title' })).toHaveAttribute(
      'placeholder',
      'Job title',
    );
    await click('Continue');
    await click('Remote only', 'switch');
    expect(screen.getByRole('textbox', { name: 'City, state or region' })).toHaveAttribute(
      'placeholder',
      'City, state or region',
    );
    for (const ph of placeholders()) expect(ph ?? '').not.toMatch(/e\.g\.|example|acme/i);
  });

  it('finishing setup adds no starter messages, documents, jobs or tracks', async () => {
    renderApp();
    await click('Continue');
    await click('Finish');
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(getAllDocuments()).toEqual([]);
    expect(getAllJobs()).toEqual([]);
    expect(getCurationState().categories).toEqual([]);
  });
});

describe('Today with no Search profile', () => {
  it('Set up your search opens the same form and Finish stays on Today', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer'); // a first run (no jobs) skips the gate
    window.location.hash = '#/today';
    renderApp();
    await click('Set up your search');
    step(1);
    expect(screen.queryByText('Just looking?')).toBeNull(); // sample data is a first-run offer
    await click('Continue');
    await click('Finish');
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(window.location.hash).toBe('#/today');
  });

  it('Not now leaves the form and shows Today again', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/today';
    renderApp();
    await click('Set up your search');
    step(1);
    await click('Not now');
    expect(screen.getByRole('button', { name: 'Set up your search' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /^Apply/ })).toBeInTheDocument();
  });
});

describe('Account menu → Search profile', () => {
  it('edits the profile in use: titles, remote only and leave out', async () => {
    saveProfile({ titles: ['Design Systems Lead'], mode: 'remote', leaveOut: ['Intern'] });
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    window.location.hash = '#/queue';
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
    window.location.hash = '#/queue';
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
  const audit = async (el: Element) => {
    const r = await axe(el, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(r.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  };
  it('each step has no WCAG A/AA violations', async () => {
    const { container } = renderApp();
    await audit(container);
    await click('Continue');
    await audit(container);
    await click('Remote only', 'switch');
    await audit(container);
  });

  // A step change swaps the panel under the pressed button: focus goes to the new step's heading,
  // so a screen reader hears where it is and Tab starts at the top of the step.
  it('Continue and Back move focus to the step they open', async () => {
    renderApp();
    await click('Continue');
    expect(screen.getByRole('heading', { name: 'Where, and what to leave out' })).toHaveFocus();
    await click('Back');
    expect(screen.getByRole('heading', { name: 'What roles do you want?' })).toHaveFocus();
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
