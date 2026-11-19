// The sync stack (#832): everything cloud sync needs that a signed-out visit never runs: the blob
// format and its merge, the three-way merge base, the tracker row and the local stores' snapshot.
// CloudSyncProvider loads it lazily, beside the Supabase client (supabase.ts), so the entry chunk
// carries none of it (entryChunk.test.ts).
export { readBlob, writeBlob, mergeBlob, emptyBlob, BLOB_VERSION } from '../syncBlob';
export { readSyncBase, readSyncHashes, writeSyncBase, keysOf, hashesOf } from '../syncBase';
export { readTrackerRow, writeTrackerRow } from './trackerRow';
export { readLocalSyncData, localSyncJson, applyLocalSyncData } from './localSyncData';
export { deviceData, mergeQuestion } from './deviceData';
export { createSyncEngine } from './syncEngine';
