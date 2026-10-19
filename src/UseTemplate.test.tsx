import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import UseTemplate from './UseTemplate';
import { replaceSnippets } from './copyDeckStore';
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

beforeEach(() => replaceSnippets(SNIPS));
afterEach(cleanup);

describe('UseTemplate', () => {
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
    await user.click(screen.getByRole('button', { name: 'Plain note' }));
    const preview = screen.getByLabelText('Preview') as HTMLTextAreaElement;
    expect(preview.value).toContain('about Fabricator at Acme Metals');
    expect(preview.value).toContain('[Contact]');
    expect(screen.getByText(/Still unfilled: \[Contact\]/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(preview.value);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('links to the picked template in Templates (#132)', async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    expect(screen.getByRole('link', { name: 'Manage templates' })).toHaveAttribute(
      'href',
      '#/copy-deck/b',
    );
    await user.click(screen.getByRole('button', { name: 'Plain note' }));
    expect(screen.getByRole('link', { name: 'Manage templates' })).toHaveAttribute(
      'href',
      '#/copy-deck/a',
    );
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
