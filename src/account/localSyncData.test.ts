// The local side of sync (#814): every SyncData field maps to a store, and a blob applied here
// reads back the same.
import { beforeEach, describe, expect, it } from 'vitest';
import { addJobOutcome, getAllJobs, replaceAll } from '../store';
import { emptyBlob, readBlob, writeBlob } from '../syncBlob';
import { applyLocalSyncData, localSyncJson, readLocalSyncData } from './localSyncData';

beforeEach(() => {
  localStorage.clear();
  replaceAll([]);
});

describe('localSyncData', () => {
  it('reads every field the blob carries, so a new synced store cannot be left out', () => {
    expect(Object.keys(readLocalSyncData()).sort()).toEqual(Object.keys(emptyBlob()).sort());
  });

  it('applies a blob to the stores and reads the same blob back', () => {
    addJobOutcome('https://jobs.example.com/a', 'Design Systems Engineer');
    const saved = readBlob(writeBlob(readLocalSyncData()));
    expect(saved.jobs).toHaveLength(1);
    replaceAll([]);
    expect(getAllJobs()).toHaveLength(0);
    applyLocalSyncData(saved);
    expect(readBlob(writeBlob(readLocalSyncData()))).toEqual(saved);
  });

  it('gives the same JSON while nothing changes, and new JSON after an edit', () => {
    const before = localSyncJson();
    expect(localSyncJson()).toBe(before);
    addJobOutcome('https://jobs.example.com/b', 'Design Engineer');
    expect(localSyncJson()).not.toBe(before);
  });
});
