import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackerView from './TrackerView';
import { addJob, getAllJobs, markAppliedByUrl, removeJob } from './store';

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderTracker = () => render(<TrackerView />);

describe('TrackerView', () => {
  it('adds a pasted job URL from the Add job dialog', async () => {
    const user = userEvent.setup();
    renderTracker();
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a job' });
    await user.type(
      within(dialog).getByLabelText(/job url/i),
      'https://boards.greenhouse.io/acme/jobs/42',
    );
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    expect(await screen.findByRole('link', { name: /boards/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// #115 / #129: one compact toolbar (search · status · sort · add) instead of a full-width URL
// field plus an 8-option status strip.
describe('Pipeline toolbar', () => {
  it('has no status strip; status is one menu button showing the current view', () => {
    renderTracker();
    expect(screen.queryByRole('radiogroup', { name: /status/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^Status: Active/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search saved jobs' })).toBeInTheDocument();
  });

  it('groups the status options with counts, and picking one filters the list', async () => {
    const user = userEvent.setup();
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    addJob('https://acme.example/jobs/2', 'Product Designer');
    markAppliedByUrl('https://acme.example/jobs/2', 'Product Designer');
    renderTracker();

    await user.click(screen.getByRole('button', { name: /^Status:/ }));
    const menu = await screen.findByRole('menu');
    for (const group of ['Views', 'In progress', 'Closed'])
      expect(within(menu).getByText(group)).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitemradio', { name: /^Applied\s*1$/ }));

    expect(screen.getByRole('button', { name: /^Status: Applied/ })).toBeInTheDocument();
    expect(screen.getByText('Product Designer')).toBeInTheDocument();
    expect(screen.queryByText('Design Engineer')).toBeNull();
  });
});
