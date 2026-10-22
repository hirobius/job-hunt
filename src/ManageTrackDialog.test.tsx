// An existing track can pull in what a starter pack gained since it was seeded (topUpFromPack,
// additive only) — how the 2026-10 design-systems round reaches tracks made before it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import ManageTrackDialog from './ManageTrackDialog';
import {
  addCategory,
  addGroup,
  addTile,
  getCurationState,
  replaceCurationState,
} from './curation/curationStore';

afterEach(() => {
  cleanup();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('ManageTrackDialog · starter-pack update', () => {
  it('adds the pack terms a track lacks and keeps the user’s own', async () => {
    const user = userEvent.setup();
    const id = addCategory({ label: 'My DS track', titles: ['My own title'], atsRoles: [] });
    render(
      <ToastProvider>
        <ManageTrackDialog categoryId={id} open onClose={() => {}} onDeleted={() => {}} />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Update from a starter pack/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Design Systems / Design Eng' }));
    const cat = getCurationState().categories.find((c) => c.id === id)!;
    expect(cat.titles[0]).toBe('My own title');
    expect(cat.titles.length).toBeGreaterThan(1);
    expect(
      await screen.findByText(/Added \d+ terms, \d+ links and \d+ outreach targets/),
    ).toBeInTheDocument();
  });
});

describe('ManageTrackDialog · term chips', () => {
  it('only the X removes a term; the chip text is not a button', async () => {
    const user = userEvent.setup();
    const id = addCategory({ label: 'T', titles: ['Welder', 'Fitter'], atsRoles: [] });
    render(
      <ToastProvider>
        <ManageTrackDialog categoryId={id} open onClose={() => {}} onDeleted={() => {}} />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    const text = within(dialog).getByText('Welder');
    expect(text.closest('button')).toBeNull();
    await user.click(text);
    expect(getCurationState().categories.find((c) => c.id === id)!.titles).toContain('Welder');
    await user.click(within(dialog).getByRole('button', { name: 'Remove Welder' }));
    expect(getCurationState().categories.find((c) => c.id === id)!.titles).toEqual(['Fitter']);
    expect(within(dialog).getByRole('textbox', { name: 'Add a title' })).toBeInTheDocument();
  });
});

describe('ManageTrackDialog · section links', () => {
  it('each link opens its page in a new tab, to check it before keeping it (Adrian 2026-10-22)', async () => {
    const id = addCategory({ label: 'Welding', titles: [], atsRoles: [] });
    const group = addGroup(id, { label: 'Shops' });
    addTile(group, { name: 'Travis Pattern & Foundry', url: 'https://www.travispattern.com/' });
    // Typed without a scheme: a relative link would open the app itself, so it stays text.
    addTile(group, { name: 'Acme careers', url: 'acme.example/careers' });
    render(
      <ToastProvider>
        <ManageTrackDialog categoryId={id} open onClose={() => {}} onDeleted={() => {}} />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    const link = within(dialog).getByRole('link', { name: /^Travis Pattern & Foundry/ });
    expect(link).toHaveAttribute('href', 'https://www.travispattern.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(
      within(dialog).getByRole('button', { name: 'Remove Travis Pattern & Foundry' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Acme careers').closest('a')).toBeNull();
  });
});
