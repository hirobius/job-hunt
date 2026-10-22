// The guided first run (#132 slice 4): three steps (pick a track, where, first job) in one narrow
// column, with Back and Skip on every step. Tested at the route seam through App: the shell's gate
// shows it on Companies for a first run, and Finish lands on Companies.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  expect(screen.getByRole('progressbar', { name: `Step ${n} of 3` })).toBeInTheDocument();
// The lead (Suggested) pack starts ticked (rev-3), so "picking" it is checking it is still on.
const pickFirstPack = async () => expect(screen.getAllByRole('checkbox')[0]).toBeChecked();

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
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

describe('step 1: pick a track', () => {
  it('a first visit opens on Step 1 of 3 with the packs, the lead pack suggested, and sample data on offer', () => {
    renderApp();
    step(1);
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Set up your board' })).toBeInTheDocument();
    expect(screen.getByText('Just looking?')).toBeInTheDocument();
    const first = screen.getAllByRole('checkbox')[0];
    expect(first).toHaveAccessibleName('Implementation Consulting');
    expect(first).toBeChecked(); // the Suggested pack starts ticked
    expect(
      screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked),
    ).toHaveLength(1);
    expect(first.closest('li')).toHaveTextContent('Suggested');
    expect(screen.getAllByText('Suggested')).toHaveLength(1);
  });

  it('Continue is never disabled; no Back on the first step; Skip is there', () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
  });

  it('"Build your own" asks for a first title before Continue', async () => {
    renderApp();
    await click('Build your own', 'checkbox');
    await click('Continue');
    step(1);
    expect(screen.getByText('Add a first job title for your own track.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/First job title/), 'Design Engineer');
    await click('Continue');
    step(2);
  });

  it('sample data ends the first run: the Pipeline shows the sample and a Sample track', async () => {
    renderApp();
    await click('Try with sample data');
    expect(
      await screen.findByRole('tab', { name: 'Pipeline', selected: true }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: 'Sample data' })).toBeInTheDocument();
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['Sample']);
  });

  it('after sample data, Find the next company opens a board, not the first-run gate', async () => {
    renderApp();
    await click('Try with sample data');
    await click('Find the next company');
    await waitFor(() => expect(window.location.hash).toBe('#/discover'));
    expect(screen.queryByRole('progressbar', { name: /Step 1 of 3/ })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Sample' })).toBeInTheDocument();
  });

  it('Clear sample data removes the Sample track with the sample jobs', async () => {
    renderApp();
    await click('Try with sample data');
    await click('Clear sample data');
    await waitFor(() => expect(getCurationState().categories).toHaveLength(0));
    expect(getAllJobs()).toHaveLength(0);
  });
});

describe('steps 2 and 3', () => {
  it('Continue goes to where you want to work; Back returns with the pick kept', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    step(2);
    expect(screen.getByRole('textbox', { name: 'City, state or Remote' })).toBeInTheDocument();
    await click('Back');
    step(1);
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
  });

  it('Finish seeds the pick with the location, saves the job and stays on Companies', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'City, state or Remote' }),
      'Tacoma, WA',
    );
    await click('Continue');
    step(3);
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Job link' }),
      'https://acme.example/jobs/42',
    );
    await click('Finish');
    await waitFor(() => expect(window.location.hash).toBe('#/discover'));
    expect(screen.queryByRole('heading', { name: 'Set up your board' })).toBeNull();
    expect(getCurationState().categories.map((c) => [c.label, c.location])).toEqual([
      ['Implementation Consulting', 'Tacoma, WA'],
    ]);
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://acme.example/jobs/42']);
  });

  it('a link that is not a link is refused, and nothing is seeded yet', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    await click('Continue');
    await userEvent.type(screen.getByRole('textbox', { name: 'Job link' }), 'not a link');
    await click('Finish');
    expect(await screen.findByText(/doesn't look like a link/)).toBeInTheDocument();
    expect(getCurationState().categories).toHaveLength(0);
  });

  it('"I\'ll do it later" finishes with the track and no job', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    await click('Continue');
    await click("I'll do it later");
    await waitFor(() => expect(getCurationState().categories).toHaveLength(1));
    expect(getCurationState().categories).toHaveLength(1);
    expect(getAllJobs()).toHaveLength(0);
  });
});

describe('a clean first run (Adrian 2026-10-22: nothing the user did not create)', () => {
  /** Every visible text field's placeholder, by its label. */
  const placeholders = () =>
    screen
      .queryAllByRole('textbox')
      .map((el) => [
        el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent,
        el.getAttribute('placeholder'),
      ]);

  it('each field shows only its own name as the placeholder: no "e.g." and no made-up example', async () => {
    renderApp();
    await click('Build your own', 'checkbox');
    expect(screen.getByLabelText(/First job title/)).toHaveAttribute('placeholder', 'Job title');
    await userEvent.type(screen.getByLabelText(/First job title/), 'Welder');
    await click('Continue');
    expect(screen.getByRole('textbox', { name: 'City, state or Remote' })).toHaveAttribute(
      'placeholder',
      'City, state or Remote',
    );
    await click('Continue');
    expect(screen.getByRole('textbox', { name: 'Job link' })).toHaveAttribute(
      'placeholder',
      'Job link',
    );
    for (const [, ph] of placeholders()) expect(ph ?? '').not.toMatch(/e\.g\.|example|acme/i);
  });

  it('finishing setup adds no starter messages or documents', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    await click('Continue');
    await click("I'll do it later");
    await waitFor(() => expect(getCurationState().categories).toHaveLength(1));
    expect(getAllDocuments()).toEqual([]);
  });
});

describe('Skip', () => {
  it('skipping a step with a pick already made keeps the pick', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    await click('Skip'); // step 2 -> 3, location left blank
    step(3);
    await click("I'll do it later");
    await waitFor(() => expect(getCurationState().categories).toHaveLength(1));
  });

  it('skipping all three seeds nothing and the gate stays on Step 1', async () => {
    renderApp();
    await click('Skip');
    step(2);
    await click('Skip');
    step(3);
    await click("I'll do it later");
    step(1);
    expect(getCurationState().categories).toHaveLength(0);
    expect(getAllJobs()).toHaveLength(0);
  });
});

describe('Discover with no track', () => {
  it('Choose a track opens the same steps and Finish stays on Discover', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer'); // a first run (no jobs) skips the gate
    window.location.hash = '#/discover';
    renderApp();
    await click('Choose a track');
    step(1);
    expect(screen.queryByText('Just looking?')).toBeNull(); // sample data is a first-run offer
    await pickFirstPack();
    await click('Continue');
    await click('Continue');
    await click('Finish');
    await waitFor(() => expect(getCurationState().categories).toHaveLength(1));
    expect(window.location.hash).toBe('#/discover');
  });
});

describe('a11y', () => {
  const audit = async (el: Element) => {
    const r = await axe(el, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(r.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  };
  it('each of the three steps has no WCAG A/AA violations', async () => {
    const { container } = renderApp();
    await audit(container);
    await pickFirstPack();
    await click('Continue');
    await audit(container);
    await click('Continue');
    await audit(container);
  });
});
