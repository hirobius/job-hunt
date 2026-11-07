// Every route names itself in the tab and history (#10 quick wins): "<page> · <brand>".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { BRAND } from './brand';
import { pageTitle } from './pageTitle';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';
import { addCategory, replaceCurationState } from './curation/curationStore';

const URL_A = 'https://acme.example/jobs/1';
const renderAt = (hash: string) => {
  window.location.hash = hash;
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );
};

beforeEach(() => {
  localStorage.clear();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  addCategory({ label: 'Welding' });
  addJob(URL_A, 'Acme Welder');
  updateJob(URL_A, { company: 'Acme' });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  window.location.hash = '';
});

describe('pageTitle', () => {
  it('names the page, then the product', () => {
    expect(pageTitle('Apply')).toBe(`Apply · ${BRAND.name}`);
    expect(pageTitle()).toBe(BRAND.name);
  });
});

describe('each route sets the document title', () => {
  it.each<[string, () => string, string]>([
    ['Find (home)', () => '', 'Find'],
    ['an old Companies link (Find now)', () => '#/discover', 'Find'],
    ['the Apply tab', () => '#/apply', 'Apply'],
    ['a job page', () => `#/apply/${jobIdOf(URL_A)}`, 'Acme Welder'],
    ['an old job link (#471)', () => `#/queue/${jobIdOf(URL_A)}`, 'Acme Welder'],
    ['a Company page', () => '#/company/acme', 'Acme'],
    ['Documents', () => '#/copy-deck', 'Documents'],
    ['the Privacy policy', () => '#/legal/privacy', 'Privacy policy'],
    ['the Terms', () => '#/legal/terms', 'Terms of use'],
    ['an unknown route', () => '#/nope', 'Page not found'],
  ])('%s', async (_, hash, page) => {
    renderAt(hash());
    await waitFor(() => expect(document.title).toBe(`${page} · ${BRAND.name}`));
  });
});
