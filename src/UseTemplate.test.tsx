import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import UseTemplate from './UseTemplate';
import { setOutreachMessages } from './test/outreach';
import type { Job } from './types';

const job = {
  url: 'https://x.test/1',
  label: 'Fabricator',
  company: 'Acme Metals',
  status: 'Saved',
} as Job;

const SNIPS = [
  { id: 'a', label: 'Plain note', body: 'Hello [Contact], about [Role] at [Company]. [Your name]' },
  { id: 'b', label: 'Pinned note', body: 'Pinned for [Company]', pinned: true },
];

const wrap = () =>
  render(
    <ToastProvider>
      <UseTemplate job={job} />
    </ToastProvider>,
  );

// The templates are the library's Outreach messages (#227).
beforeEach(() => setOutreachMessages(SNIPS));
afterEach(cleanup);

describe('UseTemplate', () => {
  // The messages are toggle chips; the picked one is pressed (rev-3 A: Copy message is the only
  // primary).
  const pick = (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(screen.getByRole('button', { name }));

  it('opens, picks a template, previews the job company and copies', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    wrap();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    // pinned first -> selected by default
    expect(screen.getByRole('button', { name: 'Pinned note' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await pick(user, 'Plain note');
    expect(screen.getByRole('button', { name: 'Plain note' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Pinned note' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview).toHaveTextContent('about Fabricator at Acme Metals');
    // The blank is a chip that fills in place (rev-3 A), counted under the text.
    expect(within(preview).getByRole('button', { name: 'Fill Contact' })).toBeInTheDocument();
    expect(within(preview).getByText(/^\d+ blanks? left$/)).toBeInTheDocument();
    // One Close (the dialog's X), and Copy message is the one primary (rule A, like Follow up).
    expect(screen.getAllByRole('button', { name: /close/i })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('[Contact]'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('lists the messages pinned first, as chips that are never a primary', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    const group = screen.getByRole('group', { name: 'Templates' });
    const chips = within(group).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Pinned note', 'Plain note']);
    for (const c of chips) expect(c).not.toHaveAttribute('data-variant', 'primary');
  });

  it('links to the picked message in Documents (#132, #227)', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    expect(screen.getByRole('link', { name: 'Edit message' })).toHaveAttribute(
      'href',
      '#/copy-deck/snippet-b',
    );
    // A 40px tertiary button with a pencil, not a 24px inline link.
    expect(screen.getByRole('link', { name: 'Edit message' }).querySelector('svg')).not.toBeNull();
    await pick(user, 'Plain note');
    expect(screen.getByRole('link', { name: 'Edit message' })).toHaveAttribute(
      'href',
      '#/copy-deck/snippet-a',
    );
  });

  it("Copy is the one primary; Edit message is the Preview card's last row (rev-3 A)", async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    const copy = screen.getByRole('button', { name: 'Copy message' });
    expect(copy).toHaveAttribute('data-variant', 'primary');
    const dialog = screen.getByRole('dialog');
    // The picker is never a primary: Copy message is the only one in the dialog.
    expect(dialog.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
    expect(within(dialog).queryAllByRole('button', { name: 'Close' }).length).toBeLessThanOrEqual(
      1,
    );
    const link = screen.getByRole('link', { name: 'Edit message' });
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(preview.contains(link)).toBe(true);
    expect(link.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no axe violations when open', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    const results = await axe(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
