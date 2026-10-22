// Return paths: each top tab reopens where it was left (the Pipeline on the job page, Apply mode
// or the list; Companies on its last tool or section), and tapping the open tab goes to its root.
import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { lastRouteOf, openTab, resetTabMemory } from './tabMemory';

const visit = async (hash: string) => {
  window.location.hash = hash;
  await waitFor(() => expect(window.location.hash).toBe(hash));
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(resetTabMemory);

describe('tab memory', () => {
  it('remembers the last route of each top tab', async () => {
    await visit('#/queue/abc?section=screening');
    await visit('#/discover/ats');
    await visit('#/copy-deck');
    expect(lastRouteOf('queue')).toBe('#/queue/abc?section=screening');
    expect(lastRouteOf('discover')).toBe('#/discover/ats');
  });

  it('counts Apply mode and a Company page as the Pipeline', async () => {
    await visit('#/apply/xyz');
    expect(lastRouteOf('queue')).toBe('#/apply/xyz');
    await visit('#/company/acme');
    expect(lastRouteOf('queue')).toBe('#/company/acme');
  });

  it('falls back to the tab root before anything was visited', () => {
    expect(lastRouteOf('queue')).toBe('#/queue');
    expect(lastRouteOf('discover')).toBe('#/discover');
  });

  it('openTab goes back to where the tab was left', async () => {
    await visit('#/discover/live');
    await visit('#/queue');
    openTab('discover');
    await waitFor(() => expect(window.location.hash).toBe('#/discover/live'));
  });
});
