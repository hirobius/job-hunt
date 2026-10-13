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
import { addCategory, getCurationState, replaceCurationState } from './curation/curationStore';

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
    expect(await screen.findByText(/Added \d+ terms and \d+ links/)).toBeInTheDocument();
  });
});
