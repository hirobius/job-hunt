import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '../test/fakeSupabase';

const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('../supabase', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  fake.current = createFakeSupabase();
  const client = fake.current.client;
  return {
    loadSupabase: async () => client,
    loadedSupabase: () => client,
    hasPersistedSession: () => false,
  };
});

import { syncOnLogin, takeLocalLegacyTiles, foldIntoStore, pushRestoredCuration } from './sync';
import { setCurationSyncedAt } from './syncStatus';
import { addCategory, getCurationState, replaceCurationState } from './curationStore';
import { getCurationSyncStatus } from './syncStatus';
import { categoryToRow } from './map';
import { MY_LINKS } from './legacyTiles';
import { setTabAccount, tabFrozen } from '../tabAccount';

const f = () => fake.current!;
const NOW = '2026-10-01T00:00:00.000Z';
const cloudCategory = (id: string, label: string) =>
  categoryToRow(
    {
      id,
      label,
      titles: ['Design Engineer'],
      atsRoles: [],
      seniority: 'any',
      location: '',
      tailorRole: null,
      sortOrder: 0,
      archived: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
    'u1',
  );

beforeEach(() => {
  f().reset();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('syncOnLogin against a fake Supabase', () => {
  it('restores cloud tracks into an empty local store (new device / after sign-out)', async () => {
    f().tables.categories = [cloudCategory('c1', 'Design')];
    expect(await syncOnLogin('u1')).toBe(true);
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['Design']);
    expect(getCurationSyncStatus()).toBe('done');
  });

  it('only pulls the signed-in user’s rows', async () => {
    f().tables.categories = [
      cloudCategory('c1', 'Mine'),
      { ...cloudCategory('c2', 'Theirs'), user_id: 'u2' },
    ];
    await syncOnLogin('u1');
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['Mine']);
  });

  it('uploads tracks that only existed locally', async () => {
    addCategory({ label: 'Offline track' }); // signed out → local only
    await syncOnLogin('u1');
    expect(f().tables.categories.map((r) => r.label)).toEqual(['Offline track']);
    expect(f().tables.categories[0].user_id).toBe('u1');
  });

  it('a failed pull reports error and leaves the local store untouched', async () => {
    addCategory({ label: 'Keep me' });
    f().failNext('groups', 'select');
    expect(await syncOnLogin('u1')).toBe(false);
    expect(getCurationSyncStatus()).toBe('error');
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['Keep me']);
  });

  it('a failed upload reports error (no silent "done")', async () => {
    addCategory({ label: 'Local' });
    f().failNext('categories', 'upsert');
    expect(await syncOnLogin('u1')).toBe(false);
    expect(getCurationSyncStatus()).toBe('error');
  });
});

describe('deletions made elsewhere stay deleted (#99 review)', () => {
  it('a stale local track missing from the cloud is dropped, not re-uploaded', async () => {
    f().tables.categories = [cloudCategory('kept', 'Kept elsewhere')];
    addCategory({ label: 'Deleted on another device', createdAt: '2026-01-01T00:00:00.000Z' });
    setCurationSyncedAt('2026-06-01T00:00:00.000Z');
    expect(await syncOnLogin('u1')).toBe(true);
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['Kept elsewhere']);
    expect(f().tables.categories.map((c) => c.label)).toEqual(['Kept elsewhere']);
  });

  it('an empty cloud keeps and uploads even stale local tracks (never wipes a board)', async () => {
    addCategory({ label: 'Only here', createdAt: '2026-01-01T00:00:00.000Z' });
    setCurationSyncedAt('2026-06-01T00:00:00.000Z');
    expect(await syncOnLogin('u1')).toBe(true);
    expect(getCurationState().categories.map((c) => c.label)).toEqual(['Only here']);
    expect(f().tables.categories.map((c) => c.label)).toEqual(['Only here']);
  });

  it('a populated board re-syncs without flipping the onboarding gate to syncing', async () => {
    addCategory({ label: 'Mine' });
    const p = syncOnLogin('u1');
    expect(getCurationSyncStatus()).not.toBe('syncing');
    await p;
  });
});

describe('legacy user tiles', () => {
  it('takeLocalLegacyTiles reads + clears rjb_user_tiles once; the fold lands in "My links"', () => {
    localStorage.setItem(
      'rjb_user_tiles',
      JSON.stringify([{ name: 'Acme', meta: 'Added by you', url: 'https://acme.example/jobs' }, 7]),
    );
    const tiles = takeLocalLegacyTiles();
    expect(tiles.map((t) => t.url)).toEqual(['https://acme.example/jobs']);
    expect(localStorage.getItem('rjb_user_tiles')).toBeNull();
    expect(takeLocalLegacyTiles()).toEqual([]);
    foldIntoStore(tiles);
    expect(getCurationState().groups.map((g) => g.label)).toEqual([MY_LINKS]);
  });
});

describe('pushRestoredCuration', () => {
  it('replace makes the cloud match the restored board exactly', async () => {
    f().tables.categories = [cloudCategory('old', 'Old cloud track')];
    f().signIn('u1');
    setTabAccount('u1'); // through CloudSync's sign-in path
    addCategory({ label: 'Restored' });
    expect(await pushRestoredCuration('replace')).toBe(true);
    expect(f().tables.categories.map((r) => r.label)).toEqual(['Restored']);
  });

  it("another tab's account in the shared session gets nothing, and this tab stops (#288)", async () => {
    f().tables.categories = [cloudCategory('theirs', 'Their track')];
    setTabAccount('u1');
    f().signIn('u2'); // another tab signed in as someone else
    addCategory({ label: 'Restored' });
    expect(await pushRestoredCuration('replace')).toBe(false);
    expect(f().tables.categories.map((r) => r.label)).toEqual(['Their track']);
    expect(tabFrozen()).toBe('switched');
  });

  it('signed out → nothing to mirror', async () => {
    addCategory({ label: 'Restored' });
    expect(await pushRestoredCuration('merge')).toBe(true);
    expect(f().tables.categories ?? []).toEqual([]);
  });
});
