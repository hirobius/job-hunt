// Slice 3 of #132: token chips, the filled preview and Copy on the Templates editor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

const body = () => screen.getByRole('textbox', { name: 'Snippet text' }) as HTMLTextAreaElement;
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
    body().setSelectionRange(5, 5);
    await userEvent.click(screen.getByRole('button', { name: '[Role]' }));
    expect(getSnippets()[0].body).toBe('Hello[Role] world');
    await waitFor(() => expect(body()).toHaveFocus());
    expect(body().selectionStart).toBe(11);
  });

  it('a chip says which job field fills it', async () => {
    await renderApp();
    screen.getByRole('button', { name: '[Company]' }).focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/company/i);
  });
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
