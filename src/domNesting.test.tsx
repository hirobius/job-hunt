// Valid DOM nesting on the pages that hand HDS PageHeader a `description`: PageHeader wraps it in a
// <p>, so a <p> or a block (<div>) inside it is invalid HTML and React logs validateDOMNesting on
// every render (Apply mode's meta line, Discover's "where · Change" row).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';

const A = 'https://acme.example/jobs/1';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

/** Every block or paragraph that sits inside a paragraph. */
const badNesting = () =>
  [...document.querySelectorAll('p p, p div, p ul, p section')].map((el) =>
    el.outerHTML.slice(0, 80),
  );

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  replaceCurationState(EMPTY_CURATION);
  window.history.replaceState(null, '', '/');
  addJob(A, 'Acme Designer');
  updateJob(A, { company: 'Acme', location: 'Remote' });
  errors = vi.spyOn(console, 'error');
});
afterEach(() => {
  cleanup();
  errors.mockRestore();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const nestingErrors = () =>
  errors.mock.calls.filter((c: unknown[]) => String(c[0]).includes('validateDOMNesting'));

describe('PageHeader descriptions hold inline content only', () => {
  it('Apply mode: the meta line is not a <p> inside the header <p>', async () => {
    window.location.hash = `#/apply/${jobIdOf(A)}`;
    renderApp();
    expect(await screen.findByText('Acme')).toBeVisible();
    expect(badNesting()).toEqual([]);
    expect(nestingErrors()).toEqual([]);
  });

  it('Companies: the where · Change row is not a <div> inside the header <p>', async () => {
    addCategory({ label: 'Design systems', titles: ['Design engineer'] });
    window.location.hash = '#/discover';
    renderApp();
    expect(await screen.findByRole('button', { name: /^Change where/ })).toBeVisible();
    expect(badNesting()).toEqual([]);
    expect(nestingErrors()).toEqual([]);
  });
});
