import { beforeEach, describe, expect, it } from 'vitest';
import { dropTrackData } from './trackData';
import { getAllTargets, saveTarget } from './feed/targets';
import { getAllFilters, saveFilter } from './feed/savedFilters';
import { getAllModes, writeMode } from './trackModes';
import { addCategory, removeCategory, replaceCurationState } from './curation/curationStore';

const t = {
  login: 'acme',
  company: 'Acme',
  repo: 'acme/ds',
  repoUrl: 'https://github.com/acme/ds',
  stars: 1,
};
const f = {
  name: 'S',
  term: 't',
  where: '',
  mode: 'any' as const,
  exclude: [],
  seniority: 'any' as const,
  salaryOnly: false,
  contractOnly: false,
};
const fill = (ids: string[]) =>
  ids.forEach((id) => {
    saveTarget(id, t);
    saveFilter(id, f);
    writeMode(id, 'remote');
  });

beforeEach(() => {
  localStorage.clear();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

describe('per-track data follows its track', () => {
  it('dropTrackData removes one track from all three stores', () => {
    fill(['a', 'b']);
    dropTrackData('a');
    expect(Object.keys(getAllTargets())).toEqual(['b']);
    expect(Object.keys(getAllFilters())).toEqual(['b']);
    expect(Object.keys(getAllModes())).toEqual(['b']);
  });

  it('deleting a track in the curation store drops its data', () => {
    const id = addCategory({ label: 'Gone' });
    fill([id, 'other']);
    removeCategory(id);
    expect(Object.keys(getAllTargets())).toEqual(['other']);
    expect(getAllModes()[id]).toBeUndefined();
  });
});
