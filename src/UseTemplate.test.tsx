import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { useState } from 'react';
import { Button, ToastProvider } from '@hirobius/design-system';
import { UseTemplateSheet } from './UseTemplate';
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

// Opens the sheet from a trigger, the way the job page does.
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Use template</Button>
      {open && <UseTemplateSheet job={job} open onOpenChange={setOpen} />}
    </>
  );
}

const wrap = () =>
  render(
    <ToastProvider>
      <Harness />
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
    // Contact is missing on the job: it gets an inline field instead of a note.
    expect(screen.getByLabelText('Contact is missing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(preview.value);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('a missing token is an inline field that fills the copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    wrap();
    await user.click(screen.getByRole('button', { name: 'Use template' }));
    await user.click(screen.getByRole('button', { name: 'Plain note' }));
    const preview = screen.getByLabelText('Preview') as HTMLTextAreaElement;
    expect(preview.value).toContain('Hello [Contact]');
    await user.type(screen.getByLabelText('Contact is missing'), 'Sam');
    expect(preview.value).toContain('Hello Sam,');
    // The field stays while you type (it does not vanish once the token is filled).
    expect(screen.getByLabelText('Contact is missing')).toHaveValue('Sam');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Hello Sam,'));
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
