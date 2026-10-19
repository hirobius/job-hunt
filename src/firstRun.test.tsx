// The guided first run (#132 slice 4): three steps (pick a track, where, first job) in one narrow
// column, with Back and Skip on every step. Tested at the route seam through App: the shell's gate
// shows it on Today for a first run, and Finish lands on Today.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { getAllJobs, removeJob } from './store';
import { getCurationState, replaceCurationState } from './curation/curationStore';

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
const pickFirstPack = () => userEvent.click(screen.getAllByRole('checkbox')[0]);

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/today';
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
    expect(within(first).getByText('Suggested')).toBeInTheDocument();
    expect(screen.getAllByText('Suggested')).toHaveLength(1);
  });

  it('Continue needs a pack; Back is there but has nowhere to go; Skip is there', () => {
    renderApp();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
  });

  it('"Build your own" asks for a first title before Continue', async () => {
    renderApp();
    await click('Build your own', 'checkbox');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/First job title/), 'Design Engineer');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('sample data ends the first run: Today shows the sample pipeline, no tracks yet', async () => {
    renderApp();
    await click('Try with sample data');
    expect(await screen.findByRole('region', { name: /^Follow-ups due/ })).toBeInTheDocument();
    expect(getCurationState().categories).toHaveLength(0);
  });
});

describe('steps 2 and 3', () => {
  it('Continue goes to where you want to work; Back returns with the pick kept', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    step(2);
    expect(screen.getByRole('textbox', { name: 'Location' })).toBeInTheDocument();
    await click('Back');
    step(1);
    expect(screen.getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('Finish seeds the pick with the location, saves the job and lands on Today', async () => {
    renderApp();
    await pickFirstPack();
    await click('Continue');
    await userEvent.type(screen.getByRole('textbox', { name: 'Location' }), 'Tacoma, WA');
    await click('Continue');
    step(3);
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Job link' }),
      'https://acme.example/jobs/42',
    );
    await click('Finish');
    expect(await screen.findByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/today');
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
    expect(await screen.findByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    expect(getCurationState().categories).toHaveLength(1);
    expect(getAllJobs()).toHaveLength(0);
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
    window.location.hash = '#/discover';
    renderApp();
    await click('Choose a track');
    step(1);
    expect(screen.queryByText('Just looking?')).toBeNull(); // sample data is a Today offer
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
