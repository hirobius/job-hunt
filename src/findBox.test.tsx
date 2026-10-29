// One Find box (Simplify 3/9, #384): paste anything and it goes to the existing action. Reached
// from the Pipeline's Add job dialog ("Paste a company, board or title instead") until Today hosts
// it. The classifier itself is table-tested in find/classifyFind.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import NoticeHost from './NoticeHost';
import FindBox from './FindBox';
import { getAllJobs, removeJob } from './store';
import { dismissNotice } from './saveNotice';
import { getProfile, replaceProfiles, saveProfile } from './profile';
import { addSources, getSources } from './sources';

/** Board APIs by URL: figma (Greenhouse) has a board; everything else 404s. */
const fakeFetch = vi.fn(async (url: string) =>
  url.startsWith('https://boards-api.greenhouse.io/v1/boards/figma/jobs')
    ? new Response(JSON.stringify({ jobs: [] }), { status: 200 })
    : new Response('{}', { status: 404 }),
);

/** The followed boards, as kind:slug. */
const followed = () =>
  getSources()
    .filter((x) => x.kind !== 'company')
    .map((x) => `${x.kind}:${x.ref}`);
const titles = () => getProfile()?.titles ?? [];

beforeEach(() => {
  localStorage.clear();
  fakeFetch.mockClear();
  vi.stubGlobal('fetch', fakeFetch);
  saveProfile({ titles: ['Design Systems Engineer'] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  dismissNotice();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderPipeline = () =>
  render(
    <ToastProvider>
      <TrackerView />
      <NoticeHost />
    </ToastProvider>,
  );

/** Add job → "Paste a company, board or title instead" → the Find dialog. */
async function openFind(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Add job' })[0]);
  const add = await screen.findByRole('dialog', { name: 'Add a job' });
  await user.click(
    within(add).getByRole('button', { name: 'Paste a company, board or title instead' }),
  );
  const dialog = await screen.findByRole('dialog', { name: 'Find' });
  // The Find box is a lazy chunk.
  await within(dialog).findByRole('textbox', { name: 'Find' });
  return dialog;
}

async function find(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, text: string) {
  await user.type(within(dialog).getByRole('textbox', { name: 'Find' }), text);
  await user.click(within(dialog).getByRole('button', { name: 'Find' }));
}

describe('Find box from the Pipeline', () => {
  it('Add job keeps its own field; Find is one tap away in the same dialog', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    const field = within(dialog).getByRole('textbox', { name: 'Find' });
    expect(field).toHaveAttribute('placeholder', 'Job link, company, board or title');
    expect(field).toHaveFocus();
    // Cancel closes it; Add job opens on its own field again.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getAllByRole('button', { name: 'Add job' })[0]);
    expect(await screen.findByRole('dialog', { name: 'Add a job' })).toBeInTheDocument();
  });

  it('a job link saves the job to To apply and closes', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'https://jobs.lever.co/northwind/1a2b');
    expect(getAllJobs().map((j) => j.url)).toEqual(['https://jobs.lever.co/northwind/1a2b']);
    expect(await screen.findByText('Saved to Pipeline · To apply')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a board link is followed at once', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'https://jobs.lever.co/northwind');
    expect(followed()).toEqual(['lever:northwind']);
    expect(await screen.findByText('Following Northwind')).toBeInTheDocument();
    expect(getAllJobs()).toHaveLength(0);
  });

  it('a board already followed says so and adds nothing', async () => {
    addSources([{ kind: 'lever', ref: 'northwind', label: 'Northwind' }]);
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'jobs.lever.co/northwind');
    expect(await screen.findByText('Already following Northwind')).toBeInTheDocument();
    expect(followed()).toHaveLength(1);
  });

  it('a company name is looked up on the systems we check; a board found is one Watch away', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    expect(dialog).not.toHaveTextContent('Look up');
    await user.type(within(dialog).getByRole('textbox', { name: 'Find' }), 'Figma');
    expect(dialog).toHaveTextContent('Looks up Figma’s job board');
    await user.click(within(dialog).getByRole('button', { name: 'Find' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Watch Figma' }));
    await waitFor(() => expect(followed()).toContain('greenhouse:figma'));
  });

  it('a company with no public board can be kept as a target (a starred company)', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'Nobody Inc');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Keep Nobody Inc as a target' }),
    );
    expect(getSources()).toEqual([
      expect.objectContaining({ kind: 'company', label: 'Nobody Inc', star: true }),
    ]);
  });

  it('a title is added to the Search profile’s titles, with Undo', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Find' }), 'Design Technologist');
    expect(dialog).toHaveTextContent('Adds “Design Technologist” to your titles');
    await user.click(within(dialog).getByRole('button', { name: 'Find' }));
    expect(titles()).toEqual(['Design Systems Engineer', 'Design Technologist']);
    expect(await screen.findByText('Added “Design Technologist” to your titles')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(titles()).toEqual(['Design Systems Engineer']);
  });

  it('a title already listed says so', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'design systems engineer');
    expect(
      await screen.findByText('“design systems engineer” is already in your titles'),
    ).toBeVisible();
    expect(titles()).toEqual(['Design Systems Engineer']);
  });

  it('a title listed but switched off is turned on, with Undo', async () => {
    saveProfile({ titles: ['Design Systems Engineer', 'UX Designer'], titlesOff: ['UX Designer'] });
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'ux designer');
    expect(await screen.findByText('Turned “ux designer” on in your titles')).toBeVisible();
    expect(getProfile()?.titlesOff).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getProfile()?.titlesOff).toEqual(['UX Designer']);
  });

  it('a name read as a company can be searched as a title instead, and back', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Find' }), 'Figma');
    await user.click(within(dialog).getByRole('button', { name: 'Search as a title instead' }));
    expect(dialog).toHaveTextContent('Adds “Figma” to your titles');
    await user.click(within(dialog).getByRole('button', { name: 'Look up as a company instead' }));
    expect(dialog).toHaveTextContent('Looks up Figma’s job board');
    await user.click(within(dialog).getByRole('button', { name: 'Search as a title instead' }));
    await user.click(within(dialog).getByRole('button', { name: 'Find' }));
    expect(titles()).toContain('Figma');
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('what was typed in Add job carries over into Find', async () => {
    const user = userEvent.setup();
    renderPipeline();
    await user.click(screen.getAllByRole('button', { name: 'Add job' })[0]);
    const add = await screen.findByRole('dialog', { name: 'Add a job' });
    await user.type(within(add).getByRole('textbox', { name: 'Job link' }), 'Figma');
    await user.click(
      within(add).getByRole('button', { name: 'Paste a company, board or title instead' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Find' });
    expect(await within(dialog).findByRole('textbox', { name: 'Find' })).toHaveValue('Figma');
    expect(dialog).toHaveTextContent('Looks up Figma’s job board');
  });

  it('editing the field clears a lookup made for the old name', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'Nobody Inc');
    await within(dialog).findByRole('button', { name: 'Keep Nobody Inc as a target' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Find' }), 'X');
    expect(within(dialog).queryByRole('button', { name: /as a target/ })).toBeNull();
  });

  it('a name the board probe cannot read says so instead of showing nothing', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await find(user, dialog, 'Acme/Labs');
    expect(within(dialog).getByRole('textbox', { name: 'Find' })).toHaveAccessibleDescription(
      'Type a company name or paste its job-board link.',
    );
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('an empty field shows a field error and keeps the dialog open', async () => {
    const user = userEvent.setup();
    renderPipeline();
    const dialog = await openFind(user);
    await user.click(within(dialog).getByRole('button', { name: 'Find' }));
    const field = within(dialog).getByRole('textbox', { name: 'Find' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(
      'Paste a job link, a job board or a company, or type a job title',
    );
  });
});

describe('Find box without a Search profile', () => {
  beforeEach(() => replaceProfiles([]));
  const renderBox = () =>
    render(
      <ToastProvider>
        <FindBox />
        <NoticeHost />
      </ToastProvider>,
    );

  it('still saves a job link and follows a board', async () => {
    const user = userEvent.setup();
    renderBox();
    await user.type(screen.getByRole('textbox', { name: 'Find' }), 'https://jobs.lever.co/x/1');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(getAllJobs()).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Find' })).toHaveValue('');
    await user.type(
      screen.getByRole('textbox', { name: 'Find' }),
      'https://jobs.lever.co/northwind',
    );
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(followed()).toEqual(['lever:northwind']);
  });

  it('a title says a Search profile is needed first', async () => {
    const user = userEvent.setup();
    renderBox();
    const field = screen.getByRole('textbox', { name: 'Find' });
    await user.type(field, 'Pipe welder');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(field).toHaveAccessibleDescription(
      'Your search is still loading. Try again in a moment.',
    );
    expect(getProfile()).toBeNull();
  });
});
