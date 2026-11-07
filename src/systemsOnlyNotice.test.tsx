// The one-time move to systems-only (feed/systemsOnly.ts), at the App seam: an existing Design
// Systems track gets must include "design system" (title only) and one notice, once; a reload says nothing again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
import {
  addCategory,
  addGroup,
  addTile,
  getCurationState,
  replaceCurationState,
} from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { readMustInclude } from './feed/mustInclude';
import { SYSTEMS_ONLY_NOTICE } from './feed/systemsOnly';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

let ds: string;
beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  replaceCurationState(EMPTY_CURATION);
  ds = addCategory({
    label: 'Design Systems / Design Eng',
    titles: ['Design Systems Engineer', 'Design Engineer'],
    atsRoles: ['design systems', 'design engineer'],
  });
  addTile(addGroup(ds, { label: 'Watched companies' }), {
    name: 'Board',
    url: 'https://jobs.lever.co/acme',
    meta: '',
  });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/apply';
});
afterEach(cleanup);

describe('systems-only move (2026-10-23)', () => {
  it('moves the track once, says so once, and keeps its links', async () => {
    const tiles = getCurationState().tiles.length;
    renderApp();
    expect(await screen.findByText(SYSTEMS_ONLY_NOTICE)).toBeInTheDocument();
    expect(screen.getAllByText(SYSTEMS_ONLY_NOTICE)).toHaveLength(1);
    expect(readMustInclude(ds)).toEqual({
      terms: ['design system'],
      atsOff: ['design engineer'],
      phrase: true,
    });
    expect(getCurationState().tiles).toHaveLength(tiles);
    cleanup();
    renderApp();
    await screen.findAllByRole('tab');
    expect(screen.queryByText(SYSTEMS_ONLY_NOTICE)).toBeNull();
  });

  it('a track the user already set says nothing', async () => {
    localStorage.setItem('rjb_must_include', JSON.stringify({ [ds]: { terms: [] } }));
    renderApp();
    await screen.findAllByRole('tab');
    expect(screen.queryByText(SYSTEMS_ONLY_NOTICE)).toBeNull();
    expect(readMustInclude(ds).terms).toEqual([]);
  });
});
