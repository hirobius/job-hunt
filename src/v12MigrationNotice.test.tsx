// The v11 → v12 move at the App seam: once sync settles (signed out: at once) the profile and the
// Sources are written from the tracks, the links that are not boards are offered once as a .txt,
// and a reload offers nothing again.
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
const downloads = vi.hoisted(() => [] as { name: string; text: string }[]);
vi.mock('./download', () => ({
  download: (name: string, text: string) => downloads.push({ name, text }),
}));

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addCategory, addGroup, addTile, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { getProfile, replaceProfiles } from './profile';
import { getSources, sourceKey, replaceSources } from './sources';
import { linksNotice } from './v12Migration';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  downloads.length = 0;
  replaceProfiles([]);
  replaceSources([]);
  replaceCurationState(EMPTY_CURATION);
  const trades = addCategory({ label: 'Welding', titles: ['Welder'], atsRoles: ['welder'] });
  const g = addGroup(trades, { label: 'Shops' });
  addTile(g, { name: 'Acme jobs', url: 'https://boards.greenhouse.io/acme', meta: '' });
  addTile(g, { name: 'Local 66 JATC', url: 'https://local66.example.org/', meta: 'Union' });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/queue';
});
afterEach(cleanup);

describe('v12 move (simplify 4/9)', () => {
  it('writes the profile and Sources, offers the links once, and downloads them', async () => {
    renderApp();
    expect(await screen.findByText(linksNotice(1))).toBeInTheDocument();
    expect(getProfile()).toMatchObject({ label: 'Welding', titles: ['Welder'] });
    expect(getSources().map(sourceKey)).toContain('greenhouse:acme');
    await userEvent.click(screen.getByRole('button', { name: 'Download links' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/-links-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(downloads[0].text).toContain('Local 66 JATC\nhttps://local66.example.org/');
    cleanup();
    renderApp();
    await screen.findAllByRole('tab');
    await waitFor(() => expect(getProfile()).not.toBeNull());
    expect(screen.queryByText(linksNotice(1))).toBeNull();
  });

  it('says it in the singular and the plural', () => {
    expect(linksNotice(1)).toBe(
      "1 link on your old boards isn't a job board, so it isn't in Sources.",
    );
    expect(linksNotice(3)).toBe(
      "3 links on your old boards aren't job boards, so they aren't in Sources.",
    );
  });
});
