// Return paths: each top tab reopens where it was left (the Pipeline on the job page, Apply mode
// or the list), and tapping the open tab goes to its root.
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
    await visit('#/apply/abc?section=screening');
    await visit('#/find');
    // An old Documents link opens the dialog over Find; the tab is still left at Find.
    await visit('#/copy-deck');
    expect(lastRouteOf('apply')).toBe('#/apply/abc?section=screening');
    expect(lastRouteOf('find')).toBe('#/find');
  });

  it('counts Apply mode and a Company page as the Pipeline', async () => {
    await visit('#/apply/xyz');
    expect(lastRouteOf('apply')).toBe('#/apply/xyz');
    await visit('#/apply/company/acme');
    expect(lastRouteOf('apply')).toBe('#/apply/company/acme');
  });

  it('falls back to the tab root before anything was visited', () => {
    expect(lastRouteOf('apply')).toBe('#/apply');
    expect(lastRouteOf('find')).toBe('#/find');
  });

  // Review blocker (2026-10-22): a removed job's page stayed the Pipeline's place, so every tap on
  // the tab reopened it and its fallback sent the user to the origin again.
  it('a remembered job page or Apply mode whose job is no longer saved reopens the list', async () => {
    await visit('#/apply/gone123?from=%2Ffind');
    await visit('#/find');
    openTab('apply');
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    await visit('#/apply/gone456');
    await visit('#/find');
    openTab('apply');
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
  });

  it('a remembered job page whose job is saved reopens the job', async () => {
    const url = 'https://acme.example/jobs/tab-memory';
    addJob(url, 'Fabricator');
    try {
      await visit(`#/apply/${jobIdOf(url)}?section=screening`);
      await visit('#/find');
      openTab('apply');
      await waitFor(() =>
        expect(window.location.hash).toBe(`#/apply/${jobIdOf(url)}?section=screening`),
      );
    } finally {
      removeJob(url);
    }
  });

  it('openTab goes back to where the tab was left', async () => {
    await visit('#/apply/company/acme');
    await visit('#/find');
    openTab('apply');
    await waitFor(() => expect(window.location.hash).toBe('#/apply/company/acme'));
  });
});
