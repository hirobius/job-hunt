import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import CopyDeckView from './CopyDeckView';
import { getSnippets, replaceSnippets } from './copyDeckStore';

const row = (name: string) => screen.getByRole('listitem', { name });
const openMenu = async (u: ReturnType<typeof userEvent.setup>, name: string) => {
  await u.click(within(row(name)).getByRole('button', { name: 'More actions' }));
};

beforeEach(() => {
  replaceSnippets([
    { id: 'a', label: 'Alpha note', body: 'Hello [Contact], first line of alpha.' },
    { id: 'b', label: 'Beta note', body: 'Beta body text', pinned: true },
  ]);
  render(
    <ToastProvider>
      <CopyDeckView />
    </ToastProvider>,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CopyDeckView rows', () => {
  it('has a Templates heading, a New snippet button and a list of rows with previews', () => {
    expect(screen.getByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New snippet' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Beta body text')).toBeInTheDocument();
    // pinned first
    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('Beta note');
  });

  it('shows one visible action (Copy) and keeps the rest in the menu', () => {
    const r = row('Alpha note');
    expect(within(r).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(within(r).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(r).queryByRole('button', { name: 'Duplicate' })).toBeNull();
  });

  it('copies to the clipboard and says Copied', async () => {
    const u = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await u.click(within(row('Alpha note')).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('Hello [Contact], first line of alpha.');
    expect(await within(row('Alpha note')).findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('menu: Edit reveals the label and text editors, Hide closes them', async () => {
    const u = userEvent.setup();
    await openMenu(u, 'Alpha note');
    await u.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(getSnippets().find((s) => s.id === 'a')?.open).toBe(true);
    const text = within(row('Alpha note')).getByLabelText('Snippet text');
    await u.type(text, '!');
    expect(getSnippets().find((s) => s.id === 'a')?.body).toMatch(/alpha\.!$/);
    await openMenu(u, 'Alpha note');
    await u.click(screen.getByRole('menuitem', { name: 'Hide' }));
    expect(within(row('Alpha note')).queryByLabelText('Snippet text')).toBeNull();
  });

  it('menu: Pin and Unpin', async () => {
    const u = userEvent.setup();
    await openMenu(u, 'Alpha note');
    await u.click(screen.getByRole('menuitem', { name: 'Pin' }));
    expect(getSnippets().find((s) => s.id === 'a')?.pinned).toBe(true);
    await openMenu(u, 'Beta note');
    expect(screen.getByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument();
  });

  it('menu: Duplicate adds a snippet', async () => {
    const u = userEvent.setup();
    await openMenu(u, 'Alpha note');
    await u.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(getSnippets()).toHaveLength(3);
  });

  it('menu: Delete is last, confirms, and removes', async () => {
    const u = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openMenu(u, 'Alpha note');
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items[items.length - 1]).toBe('Delete');
    await u.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalled();
    expect(getSnippets()).toHaveLength(2);
    confirm.mockReturnValue(true);
    await openMenu(u, 'Alpha note');
    await u.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(getSnippets().map((s) => s.id)).toEqual(['b']);
  });
});
