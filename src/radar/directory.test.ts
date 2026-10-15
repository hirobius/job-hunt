import { describe, expect, it } from 'vitest';
import { STARTER_DIRECTORY } from './directory';
import { boardsFromUrls } from '../feed/sources/ats';

describe('starter directory', () => {
  it('every entry is a distinct company board', () => {
    expect(STARTER_DIRECTORY.length).toBeGreaterThan(20);
    expect(boardsFromUrls([...STARTER_DIRECTORY], Infinity)).toHaveLength(STARTER_DIRECTORY.length);
  });
});
