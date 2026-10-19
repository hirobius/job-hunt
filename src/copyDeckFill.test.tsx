// Slice 3 of #132: token chips, the filled preview and Copy on the Templates editor; #221: variables
// as atomic chips, the Insert variable menu and the Variables panel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

const h = vi.hoisted(() => ({ fake: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, removeJob, updateJob } from './store';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import { getSnippets, replaceSnippets, restoreStarterSnippets } from './copyDeckStore';

const renderApp = async () => {
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );
  await waitFor(() => expect(screen.queryByLabelText('Loading')).toBeNull());
};

function viewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

// Radix Select measures and scrolls; jsdom has neither.
beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const body = () => screen.getByRole('textbox', { name: 'Snippet text' });

/** Put the caret in the chip editor `at` characters into its first text node (or at a child index). */
function caretAt(node: Node, at: number) {
  const r = document.createRange();
  r.setStart(node, at);
  r.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  document.dispatchEvent(new Event('selectionchange'));
}
const preview = () => screen.getByRole('region', { name: 'Preview' });

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  seedPack('consulting');
  replaceSnippets([]);
  restoreStarterSnippets();
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/copy-deck/tpl-outreach';
});
afterEach(() => {
  cleanup();
  // @ts-expect-error -- jsdom has no matchMedia; tests that need one install it
  delete window.matchMedia;
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('token chips', () => {
  beforeEach(() => viewport(1440));

  it('there is a chip per token, plus Your name', async () => {
    await renderApp();
    for (const t of ['[Company]', '[Role]', '[Contact]', '[Angle]', '[Your name]'])
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
  });

  it('clicking a chip inserts its token at the cursor', async () => {
    window.location.hash = '#/copy-deck/tpl-cover';
    replaceSnippets([{ id: 'tpl-cover', label: 'Cover letter', body: 'Hello world' }]);
    await renderApp();
    body().focus();
    caretAt(body().firstChild!, 5);
    await userEvent.click(screen.getByRole('button', { name: '[Role]' }));
    expect(getSnippets()[0].body).toBe('Hello [Role] world');
    await waitFor(() => expect(body()).toHaveFocus());
    // The caret lands after the chip, at the start of " world".
    const sel = window.getSelection()!;
    expect(sel.anchorNode?.textContent).toBe(' world');
    expect(sel.anchorOffset).toBe(0);
  });

  it('a chip says which job field fills it', async () => {
    await renderApp();
    screen.getByRole('button', { name: '[Company]' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/company/i);
  });
});

describe('variable chips (#221)', () => {
  beforeEach(() => {
    viewport(1440);
    window.location.hash = '#/copy-deck/tpl-cover';
    replaceSnippets([
      { id: 'tpl-cover', label: 'Cover letter', body: 'Hi [Contact], at [Company]' },
    ]);
  });

  it('shows each variable as one named chip that cannot be edited inside', async () => {
    await renderApp();
    const chip = screen.getByRole('img', { name: 'Contact variable' });
    expect(chip).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByRole('img', { name: 'Company variable' })).toBeInTheDocument();
    expect(body()).toHaveTextContent('Hi Contact, at Company');
  });

  it('Backspace right after a chip removes the whole chip', async () => {
    await renderApp();
    const after = screen.getByRole('img', { name: 'Contact variable' }).nextSibling!;
    body().focus();
    caretAt(after, 0);
    await userEvent.keyboard('{Backspace}');
    expect(getSnippets()[0].body).toBe('Hi , at [Company]');
    expect(screen.queryByRole('img', { name: 'Contact variable' })).toBeNull();
  });

  it('Delete right before a chip removes the whole chip', async () => {
    await renderApp();
    body().focus();
    caretAt(body().firstChild!, 3);
    await userEvent.keyboard('{Delete}');
    expect(getSnippets()[0].body).toBe('Hi , at [Company]');
  });

  it('a [Name] typed by hand becomes a chip', async () => {
    await renderApp();
    const last = body().lastChild!;
    body().append(document.createTextNode(' [Pet]'));
    caretAt(last, 0);
    fireEvent.input(body());
    expect(getSnippets()[0].body).toBe('Hi [Contact], at [Company] [Pet]');
    expect(screen.getByRole('img', { name: 'Pet variable' })).toBeInTheDocument();
  });

  it('Insert variable puts the chip at the cursor', async () => {
    await renderApp();
    body().focus();
    caretAt(body().firstChild!, 3);
    await userEvent.click(screen.getByRole('button', { name: 'Insert variable' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Role' }));
    expect(getSnippets()[0].body).toBe('Hi [Role] [Contact], at [Company]');
  });
});

describe('Variables panel (#221)', () => {
  beforeEach(() => {
    viewport(1440);
    window.location.hash = '#/copy-deck/tpl-cover';
    replaceSnippets([
      { id: 'tpl-cover', label: 'Cover letter', body: 'Hi [Contact] at [Company]. [Pet]' },
    ]);
  });
  const vars = () => screen.getByRole('region', { name: 'Variables' });

  it('lists every variable the template uses', async () => {
    await renderApp();
    for (const n of ['Contact', 'Company', 'Pet'])
      expect(within(vars()).getByRole('textbox', { name: n })).toBeInTheDocument();
  });

  it('a value set there fills the preview and the copy, and is kept on the template', async () => {
    userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await renderApp();
    await userEvent.type(within(vars()).getByRole('textbox', { name: 'Pet' }), 'Rex');
    expect(preview()).toHaveTextContent('Hi [Contact] at [Company]. Rex');
    expect(getSnippets()[0].body).toBe('Hi [Contact] at [Company]. [Pet]');
    expect(getSnippets()[0].values).toEqual({ pet: 'Rex' });
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText.mock.calls[0][0]).toBe('Hi [Contact] at [Company]. Rex');
  });

  it('with a job picked, its fields fill and edits are saved on the job', async () => {
    addJob('https://acme.example/jobs/1', 'Fabricator');
    updateJob('https://acme.example/jobs/1', { company: 'Acme Metals' });
    await renderApp();
    await userEvent.click(screen.getByRole('combobox', { name: /^Fill for/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Fabricator/ }));
    expect(within(vars()).getByRole('textbox', { name: 'Company' })).toHaveValue('Acme Metals');
    await userEvent.type(within(vars()).getByRole('textbox', { name: 'Contact' }), 'Jo');
    expect(getAllJobs()[0].contact).toBe('Jo');
    expect(preview()).toHaveTextContent('Hi Jo at Acme Metals. [Pet]');
  });
});

it('a variable named [constructor] or [__proto__] renders and can be set', async () => {
  viewport(1440);
  window.location.hash = '#/copy-deck/tpl-cover';
  replaceSnippets([{ id: 'tpl-cover', label: 'Cover', body: '[constructor] [__proto__]' }]);
  await renderApp();
  const vars = screen.getByRole('region', { name: 'Variables' });
  await userEvent.type(within(vars).getByRole('textbox', { name: '__proto__' }), 'P');
  expect(preview()).toHaveTextContent('[constructor] P');
  expect(Object.prototype.hasOwnProperty.call(getSnippets()[0].values, '__proto__')).toBe(true);
});

describe('preview', () => {
  beforeEach(() => viewport(1440));

  it('with no job it shows the [Token] text as written', async () => {
    await renderApp();
    expect(preview()).toHaveTextContent('Hi [Contact],');
    expect(preview()).toHaveTextContent('[Your name]');
  });

  it('picking a job fills the tokens and lists the ones still unfilled', async () => {
    addJob('https://acme.example/jobs/1', 'Fabricator');
    updateJob('https://acme.example/jobs/1', { company: 'Acme Metals' });
    await renderApp();
    await userEvent.click(screen.getByRole('combobox', { name: /^Fill for/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Fabricator/ }));
    expect(preview()).toHaveTextContent('the Fabricator opening at Acme Metals');
    expect(preview()).toHaveTextContent('Hi [Contact],');
    expect(
      screen.getByText(/Still unfilled for this job: \[Contact\], \[Angle\]/),
    ).toBeInTheDocument();
  });

  it('on a phone, Write and Preview are tabs', async () => {
    viewport(390);
    await renderApp();
    expect(screen.getByRole('tab', { name: 'Write', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(preview()).toHaveTextContent('Hi [Contact],');
  });
});

describe('Copy', () => {
  beforeEach(() => viewport(1440));

  it('copies the filled text and says Copied', async () => {
    addJob('https://acme.example/jobs/1', 'Fabricator');
    updateJob('https://acme.example/jobs/1', { company: 'Acme Metals' });
    userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await renderApp();
    await userEvent.click(screen.getByRole('combobox', { name: /^Fill for/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Fabricator/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('the Fabricator opening at Acme Metals');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('with no job it copies the text with its tokens', async () => {
    userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText.mock.calls[0][0]).toContain('[Company]');
  });
});
