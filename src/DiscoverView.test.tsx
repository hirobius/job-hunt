import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

// The curation store builds a Supabase client at import time — stub it (no network in tests).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', () => feed);

import DiscoverView from './DiscoverView';
import { getCurationState, replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import { EMPTY_CURATION } from './curation/types';

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

const renderDiscover = () =>
  render(
    <ToastProvider>
      <DiscoverView />
    </ToastProvider>,
  );

beforeEach(() => {
  feed.fetchFeed.mockReset().mockResolvedValue({ postings: [], sources: [], boardsSkipped: 0 });
  replaceCurationState(EMPTY_CURATION);
  localStorage.clear();
  seedPack('designsystems');
  seedPack('consulting');
  go('#/discover');
});
afterEach(() => {
  cleanup();
  replaceCurationState(EMPTY_CURATION);
});

const trackNames = () => getCurationState().categories.map((c) => c.label);

describe('Discover segments and URL slugs', () => {
  it('opens on Links and keeps the existing slugs: Links #/discover, Search #/discover/titles, Postings #/discover/live', async () => {
    const user = userEvent.setup();
    renderDiscover();
    const seg = screen.getByRole('radiogroup', { name: 'Discover sections' });
    expect(within(seg).getByRole('radio', { name: 'Links' })).toBeChecked();

    await user.click(within(seg).getByRole('radio', { name: 'Search' }));
    expect(window.location.hash).toBe('#/discover/titles');
    expect(within(seg).getByRole('radio', { name: 'Search' })).toBeChecked();

    await user.click(within(seg).getByRole('radio', { name: 'Postings' }));
    expect(window.location.hash).toBe('#/discover/live');

    await user.click(within(seg).getByRole('radio', { name: 'Links' }));
    expect(window.location.hash).toBe('#/discover');
  });

  it('By title / By company board switch between #/discover/titles and #/discover/ats', async () => {
    const user = userEvent.setup();
    go('#/discover/titles');
    renderDiscover();
    const by = screen.getByRole('radiogroup', { name: 'Search by' });
    expect(within(by).getByRole('radio', { name: 'By title' })).toBeChecked();
    // Title view: aggregator rows with Search actions.
    expect(screen.getByRole('list', { name: 'Search boards' })).toBeInTheDocument();

    await user.click(within(by).getByRole('radio', { name: 'By company board' }));
    expect(window.location.hash).toBe('#/discover/ats');
    expect(screen.getByRole('link', { name: 'Search all platforms' })).toBeInTheDocument();
    // The Search segment stays selected while switching.
    expect(
      within(screen.getByRole('radiogroup', { name: 'Discover sections' })).getByRole('radio', {
        name: 'Search',
      }),
    ).toBeChecked();

    await user.click(within(by).getByRole('radio', { name: 'By title' }));
    expect(window.location.hash).toBe('#/discover/titles');
  });

  it('a deep link to #/discover/ats lands on Search → By company board; #/discover/live on Postings', () => {
    go('#/discover/ats');
    renderDiscover();
    expect(screen.getByRole('radio', { name: 'By company board' })).toBeChecked();
    cleanup();
    go('#/discover/live');
    renderDiscover();
    expect(screen.getByRole('radio', { name: 'Postings' })).toBeChecked();
  });

  it('shares ONE work-mode + location block between Search and Postings', async () => {
    const user = userEvent.setup();
    go('#/discover/titles');
    renderDiscover();
    await user.click(screen.getByRole('radio', { name: 'Hybrid' }));
    await user.type(screen.getByLabelText('Location (optional)'), 'Spokane');
    await user.click(screen.getByRole('radio', { name: 'Postings' }));
    expect(screen.getByRole('radio', { name: 'Hybrid' })).toBeChecked();
    expect(screen.getByLabelText('Location (optional)')).toHaveValue('Spokane');
    expect(screen.getAllByRole('radiogroup', { name: 'Work mode' })).toHaveLength(1);
  });
});

describe('Track sheet', () => {
  it('shows the active track, and picking another from the sheet switches (and persists) it', async () => {
    const user = userEvent.setup();
    renderDiscover();
    const names = trackNames();
    const trigger = screen.getByRole('button', { name: new RegExp(`Track.*${names[0]}`) });
    await user.click(trigger);

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('button', { name: new RegExp(names[0]) })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await user.click(within(sheet).getByRole('button', { name: new RegExp(names[1]) }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: new RegExp(`Track.*${names[1]}`) })).toBeVisible();
    const id = getCurationState().categories.find((c) => c.label === names[1])!.id;
    expect(localStorage.getItem('rjb_active_category')).toBe(id);
  });

  it('New track offers the starter packs and a blank track', async () => {
    const user = userEvent.setup();
    renderDiscover();
    await user.click(screen.getByRole('button', { name: /^Track/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'New track' }));
    await user.click(screen.getByRole('button', { name: 'ServiceNow' }));
    expect(trackNames()).toContain('ServiceNow');
    expect(screen.getByRole('button', { name: /^Track.*ServiceNow/ })).toBeVisible();
  });
});

describe('Manage track sheet', () => {
  const openManage = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /^Track/ }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Manage this track' }),
    );
  };

  it('adds and removes a title-search term, and the terms persist in the store', async () => {
    const user = userEvent.setup();
    renderDiscover();
    await openManage(user);
    const sheet = await screen.findByRole('dialog', { name: 'Manage track' });
    const cat = () => getCurationState().categories[0];

    await user.type(within(sheet).getByLabelText('Add title search terms'), 'design tokens');
    await user.click(within(sheet).getByRole('button', { name: 'Add' }));
    expect(cat().titles).toContain('design tokens');
    expect(within(sheet).getByRole('button', { name: 'Remove design tokens' })).toBeVisible();

    await user.click(within(sheet).getByRole('button', { name: 'Remove design tokens' }));
    expect(cat().titles).not.toContain('design tokens');
  });

  it('Done closes the sheet; Delete track asks first and removes the track', async () => {
    const user = userEvent.setup();
    renderDiscover();
    await openManage(user);
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const before = trackNames().length;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openManage(user);
    await user.click(await screen.findByRole('button', { name: 'Delete track' }));
    expect(confirm).toHaveBeenCalled();
    expect(trackNames()).toHaveLength(before - 1);
    confirm.mockRestore();
  });
});
