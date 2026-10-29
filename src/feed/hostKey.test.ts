import { describe, expect, it } from 'vitest';
import { hostKey } from './hostKey.ts';
import { hostKey as probeHostKey } from './probe';

describe('hostKey: the registrable domain', () => {
  it.each([
    ['https://boards-api.greenhouse.io/v1/boards/x/jobs', 'greenhouse.io'],
    ['https://acme.recruitee.com/api/offers/', 'recruitee.com'],
    ['https://api.eu.lever.co/v0/postings/x', 'lever.co'],
    ['not a url', 'not a url'],
  ])('%s → %s', (url, want) => expect(hostKey(url)).toBe(want));

  it('is the probe’s rule', () => expect(probeHostKey).toBe(hostKey));
});
