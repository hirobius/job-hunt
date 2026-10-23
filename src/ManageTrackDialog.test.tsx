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
import NoticeHost from './NoticeHost';
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
    await user.click(within(dialog).getByRole('button', { name: 'Design Systems' }));
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

// #212: a removed link or a deleted section goes at once, says so, and Undo puts it back in place
// (a section with its links, in order).
describe('ManageTrackDialog · remove with Undo', () => {
  const open = async (id: string) => {
    render(
      <ToastProvider>
        <NoticeHost />
        <ManageTrackDialog categoryId={id} open onClose={() => {}} onDeleted={() => {}} />
      </ToastProvider>,
    );
    return screen.findByRole('dialog');
  };
  const names = (groupId: string) =>
    getCurationState()
      .tiles.filter((t) => t.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => t.name);

  it('Remove on a link says so, and Undo puts it back in its place', async () => {
    const id = addCategory({ label: 'Welding', titles: [], atsRoles: [] });
    const group = addGroup(id, { label: 'Shops' });
    for (const n of ['Alpha', 'Beta', 'Gamma'])
      addTile(group, { name: n, url: `https://${n.toLowerCase()}.example/` });
    const dialog = await open(id);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Beta' }));
    expect(names(group)).toEqual(['Alpha', 'Gamma']);
    expect(await screen.findByText('Removed “Beta”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(names(group)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(within(dialog).getByRole('button', { name: 'Remove Beta' })).toBeInTheDocument();
  });

  it('Delete section says so, and Undo restores the section in place with its links in order', async () => {
    const id = addCategory({ label: 'Welding', titles: [], atsRoles: [] });
    const first = addGroup(id, { label: 'First' });
    const shops = addGroup(id, { label: 'Shops' });
    addGroup(id, { label: 'Last' });
    for (const n of ['Alpha', 'Beta', 'Gamma'])
      addTile(shops, { name: n, url: `https://${n.toLowerCase()}.example/` });
    addTile(first, { name: 'Other', url: 'https://other.example/' });
    const before = getCurationState().groups.find((g) => g.id === shops)!;
    const dialog = await open(id);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Shops section' }));
    expect(getCurationState().groups.map((g) => g.label)).toEqual(['First', 'Last']);
    expect(await screen.findByText('Deleted the “Shops” section')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const groups = getCurationState()
      .groups.filter((g) => g.categoryId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(groups.map((g) => g.label)).toEqual(['First', 'Shops', 'Last']);
    expect(groups[1]).toEqual(before);
    expect(names(shops)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(
      within(dialog)
        .getAllByRole('textbox', { name: 'Section name' })
        .map((i) => (i as HTMLInputElement).value),
    ).toEqual(['First', 'Shops', 'Last']);
  });
});

describe('ManageTrackDialog · Undo after closing', () => {
  it('a Remove raised in the dialog moves to the toast when it closes', async () => {
    const id = addCategory({ label: 'Welding', titles: [], atsRoles: [] });
    const group = addGroup(id, { label: 'Shops' });
    addTile(group, { name: 'Alpha', url: 'https://alpha.example/' });
    const ui = (open: boolean) => (
      <ToastProvider>
        <NoticeHost />
        <ManageTrackDialog categoryId={id} open={open} onClose={() => {}} onDeleted={() => {}} />
      </ToastProvider>
    );
    const { rerender } = render(ui(true));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Alpha' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Removed “Alpha”');
    rerender(ui(false));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(getCurationState().tiles.map((t) => t.name)).toEqual(['Alpha']);
  });
});
