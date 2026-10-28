// Return paths: each top tab reopens where it was left (the Pipeline on the job page, Apply mode
// or the list; Companies on its last tool or section), and tapping the open tab goes to its root.
import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { lastRouteOf, openTab, resetTabMemory } from './tabMemory';
import { addJob, jobIdOf, removeJob } from './store';

const visit = async (hash: string) => {
  window.location.hash = hash;
  await waitFor(() => expect(window.location.hash).toBe(hash));
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(resetTabMemory);

describe('tab memory', () => {
  it('remembers the last route of each top tab', async () => {
    await visit('#/queue/abc?section=screening');
    await visit('#/today');
    await visit('#/copy-deck');
    expect(lastRouteOf('queue')).toBe('#/queue/abc?section=screening');
    expect(lastRouteOf('today')).toBe('#/today');
  });

  it('counts Apply mode and a Company page as the Pipeline', async () => {
    await visit('#/apply/xyz');
    expect(lastRouteOf('queue')).toBe('#/apply/xyz');
    await visit('#/company/acme');
    expect(lastRouteOf('queue')).toBe('#/company/acme');
  });

  it('falls back to the tab root before anything was visited', () => {
    expect(lastRouteOf('queue')).toBe('#/queue');
    expect(lastRouteOf('today')).toBe('#/today');
  });

  // Review blocker (2026-10-22): a removed job's page stayed the Pipeline's place, so every tap on
  // the tab reopened it and its fallback sent the user to the origin (Companies) again.
  it('a remembered job page or Apply mode whose job is no longer saved reopens the list', async () => {
    await visit('#/queue/gone123?from=%2Fdiscover%2Fats');
    await visit('#/discover/ats');
    openTab('queue');
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    await visit('#/apply/gone456');
    await visit('#/discover/ats');
    openTab('queue');
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
  });

  it('a remembered job page whose job is saved reopens the job', async () => {
    const url = 'https://acme.example/jobs/tab-memory';
    addJob(url, 'Fabricator');
    try {
      await visit(`#/queue/${jobIdOf(url)}?section=screening`);
      await visit('#/discover/ats');
      openTab('queue');
      await waitFor(() =>
        expect(window.location.hash).toBe(`#/queue/${jobIdOf(url)}?section=screening`),
      );
    } finally {
      removeJob(url);
    }
  });

  it('openTab goes back to where the tab was left', async () => {
    await visit('#/company/acme');
    await visit('#/today');
    openTab('queue');
    await waitFor(() => expect(window.location.hash).toBe('#/company/acme'));
  });
});
