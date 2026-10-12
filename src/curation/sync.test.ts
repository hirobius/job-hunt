import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '../test/fakeSupabase';

const fake = vi.hoisted(() => ({ current: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('../supabase', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  fake.current = createFakeSupabase();
  return { supabase: fake.current.client, hasPersistedSession: () => false };
});

import { syncOnLogin, migrateLocalLegacyTiles } from './sync';
import { addCategory, getCurationState, replaceCurationState } from './curationStore';
import { getCurationSyncStatus } from './syncStatus';
import { categoryToRow } from './map';
import { MY_LINKS } from './legacyTiles';

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

describe('migrateLocalLegacyTiles', () => {
  it('folds rjb_user_tiles into "My links" once and clears the key', () => {
    localStorage.setItem(
      'rjb_user_tiles',
      JSON.stringify([{ name: 'Acme', meta: 'Added by you', url: 'https://acme.example/jobs' }]),
    );
    migrateLocalLegacyTiles();
    const s = getCurationState();
    expect(s.groups.map((g) => g.label)).toEqual([MY_LINKS]);
    expect(s.tiles.map((t) => t.url)).toEqual(['https://acme.example/jobs']);
    expect(localStorage.getItem('rjb_user_tiles')).toBeNull();
    migrateLocalLegacyTiles(); // second run: nothing to do
    expect(getCurationState().tiles).toHaveLength(1);
  });
});
