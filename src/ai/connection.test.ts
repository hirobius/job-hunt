import { afterEach, describe, expect, it } from 'vitest';
import { forgetKey, getKey, getModel, saveKey, saveModel, validKey } from './connection';

afterEach(() => localStorage.clear());

describe('AI connection (this browser only)', () => {
  it('stores, reads and forgets the key', () => {
    expect(saveKey(' sk-or-v1-abcdefghijklmnop ')).toBe(true);
    expect(getKey()).toBe('sk-or-v1-abcdefghijklmnop');
    forgetKey();
    expect(getKey()).toBeNull();
  });

  it('refuses a malformed key', () => {
    expect(validKey('short')).toBeNull();
    expect(validKey('has spaces in the middle of it')).toBeNull();
    expect(validKey(42)).toBeNull();
    expect(saveKey('x')).toBe(false);
  });

  it('remembers a valid model and ignores a bad one', () => {
    saveModel('anthropic/claude-sonnet-4.5');
    saveModel('<script>');
    expect(getModel()).toBe('anthropic/claude-sonnet-4.5');
  });

  it('keeps the key out of sync and backups: its storage name is in no synced store', async () => {
    const fs = await import('node:fs');
    for (const file of [
      'src/syncBlob.ts',
      'src/backup.ts',
      'src/blobFields.ts',
      'src/csv.ts',
      'src/exportLinks.ts',
    ])
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/rjb_ai|ai\/connection/);
  });
});
