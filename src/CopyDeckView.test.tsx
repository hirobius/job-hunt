import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import CopyDeckView from './CopyDeckView';
import { getSnippets, replaceSnippets } from './copyDeckStore';

const row = (name: string) => screen.getByRole('listitem', { name });
type U = ReturnType<typeof userEvent.setup>;
const openMenu = async (u: U, name: string) => {
  await u.click(within(row(name)).getByRole('button', { name: `Actions for ${name}` }));
};
const sheet = () => screen.getByRole('dialog');

beforeEach(() => {
  window.location.hash = '#/copy-deck';
  replaceSnippets([
    {
      id: 'a',
      label: 'Alpha note',
      body: 'Hello [Contact], first line of alpha for [Company] and [Contact].',
    },
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

describe('rows', () => {
  it('has a Templates heading, New template, a Pinned label and pinned-first rows', () => {
    expect(screen.getByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New template' })).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('Beta note');
    expect(screen.getByText('Beta body text')).toBeInTheDocument();
  });

  it('shows each distinct [Token] in the body once as a chip', () => {
    const chips = within(row('Alpha note'))
      .getAllByTestId('token-chip')
      .map((c) => c.textContent);
    expect(chips).toEqual(['[Contact]', '[Company]']);
    expect(within(row('Beta note')).queryAllByTestId('token-chip')).toHaveLength(0);
  });

  it('keeps Preview and Copy visible and the rest behind the menu', () => {
    const r = row('Alpha note');
    expect(within(r).getByRole('button', { name: 'Preview' })).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(within(r).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('copies the raw template and says Copied', async () => {
    const u = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await u.click(within(row('Beta note')).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('Beta body text');
    expect(await within(row('Beta note')).findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('Preview opens a sheet with the full body and Copy', async () => {
    const u = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await u.click(within(row('Alpha note')).getByRole('button', { name: 'Preview' }));
    expect(within(sheet()).getByText(/first line of alpha for \[Company\]/)).toBeInTheDocument();
    await u.click(within(sheet()).getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalled();
  });
});

describe('menu sheet', () => {
  it('lists the actions in order with Delete last', async () => {
    const u = userEvent.setup();
    await openMenu(u, 'Alpha note');
    expect(within(sheet()).getByText('Alpha note')).toBeInTheDocument();
    const labels = within(sheet())
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(labels).toEqual(['Copy', 'Use with a job…', 'Edit', 'Pin', 'Duplicate', 'Delete']);
  });

  it('Pin and Unpin', async () => {
    const u = userEvent.setup();
    await openMenu(u, 'Alpha note');
    await u.click(within(sheet()).getByRole('button', { name: 'Pin' }));
    expect(getSnippets().find((s) => s.id === 'a')?.pinned).toBe(true);
    await openMenu(u, 'Beta note');
    expect(within(sheet()).getByRole('button', { name: 'Unpin' })).toBeInTheDocument();
  });

  it('Duplicate adds a template', async () => {
    const u = userEvent.setup();
    await openMenu(u, 'Alpha note');
    await u.click(within(sheet()).getByRole('button', { name: 'Duplicate' }));
    expect(getSnippets()).toHaveLength(3);
  });

  it('Use with a job goes to the Tracker and toasts', async () => {
    const u = userEvent.setup();
    await openMenu(u, 'Alpha note');
    await u.click(within(sheet()).getByRole('button', { name: 'Use with a job…' }));
    expect(window.location.hash).toBe('#/queue');
    expect(await screen.findByText('Open a job, then tap Use a template')).toBeInTheDocument();
  });

  it('Delete confirms, then removes', async () => {
    const u = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openMenu(u, 'Alpha note');
    await u.click(within(sheet()).getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalled();
    expect(getSnippets()).toHaveLength(2);
    confirm.mockReturnValue(true);
    await openMenu(u, 'Alpha note');
    await u.click(within(sheet()).getByRole('button', { name: 'Delete' }));
    expect(getSnippets().map((s) => s.id)).toEqual(['b']);
  });
});

describe('edit sheet', () => {
  const openEdit = async (u: U) => {
    await openMenu(u, 'Alpha note');
    await u.click(within(sheet()).getByRole('button', { name: 'Edit' }));
  };

  it('applies edits only on Save', async () => {
    const u = userEvent.setup();
    await openEdit(u);
    const name = within(sheet()).getByLabelText('Name');
    await u.clear(name);
    await u.type(name, 'Renamed');
    await u.click(within(sheet()).getByRole('button', { name: 'Cancel' }));
    expect(getSnippets().find((s) => s.id === 'a')?.label).toBe('Alpha note');
    await openEdit(u);
    const name2 = within(sheet()).getByLabelText('Name');
    await u.clear(name2);
    await u.type(name2, 'Renamed');
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    expect(getSnippets().find((s) => s.id === 'a')?.label).toBe('Renamed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('inserts a token at the cursor of the body', async () => {
    const u = userEvent.setup();
    await openEdit(u);
    const body = within(sheet()).getByLabelText('Body') as HTMLTextAreaElement;
    body.focus();
    body.setSelectionRange(5, 5);
    await u.click(within(sheet()).getByRole('button', { name: '[Your name]' }));
    expect(body.value.startsWith('Hello[Your name] [Contact]')).toBe(true);
    await u.click(within(sheet()).getByRole('button', { name: 'Save' }));
    expect(
      getSnippets()
        .find((s) => s.id === 'a')
        ?.body.startsWith('Hello[Your name]'),
    ).toBe(true);
  });

  it('New template creates one and opens its edit sheet', async () => {
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'New template' }));
    expect(getSnippets()).toHaveLength(3);
    expect(within(sheet()).getByLabelText('Name')).toHaveValue('New template');
  });
});
