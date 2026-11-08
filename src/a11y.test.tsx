import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView, { JobsList } from './TrackerView';
import CloudSyncProvider from './account/CloudSyncProvider';
import DocumentsView from './DocumentsView';
import { setOutreachMessages } from './test/outreach';
import { STARTER_SNIPPETS } from './copyDeckStore';
import { TitlesField, WhereFields } from './ProfileFields';
import { NEW_PROFILE } from './searchDefaults';
import { addJob, getAllJobs, removeJob } from './store';
import { loadSample } from './demo/loadSample';
import { replaceCurationState } from './curation/curationStore';

/**
 * Accessibility audit — every primary surface must be free of WCAG 2.0/2.1
 * A & AA violations (axe-core). Scoped to WCAG conformance tags so we test the
 * component in isolation and skip page-structure best-practices (landmarks,
 * single-h1) that only apply to a full document.
 */

const withTheme = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

async function auditA11y(el: Element) {
  const results = await axe(el, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  });
  // On failure this prints the offending rule ids (+ how many nodes each hit).
  expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
}

beforeEach(() => {
  replaceCurationState({ categories: [], groups: [], tiles: [] });
});

afterEach(() => {
  cleanup();
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  // Some views read the shared store; keep tests isolated.
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('a11y — primary views (no WCAG A/AA violations)', () => {
  const views: [string, React.ReactNode][] = [
    ['TrackerView', <TrackerView />],
    ['DocumentsView', <DocumentsView />],
  ];

  it.each(views)('%s', async (_name, ui) => {
    const { container } = withTheme(ui);
    await auditA11y(container);
  });
});

describe('a11y — the Pipeline agenda with the sample pipeline (#236, was Today)', () => {
  it('To apply, Follow up (due first) and the next 7 days', async () => {
    loadSample();
    // The Apply list (on a phone the All jobs sheet's body, Proposal A).
    const { container, getByRole } = withTheme(<JobsList />);
    expect(getByRole('region', { name: /^Follow up \(/ })).toBeInTheDocument();
    expect(getByRole('region', { name: /^Next 7 days/ })).toBeInTheDocument();
    await auditA11y(container);
  });
});

describe('a11y — the Pipeline list with the sample pipeline (#129)', () => {
  const wideViewport = (wide: boolean) =>
    (window.matchMedia = vi.fn().mockImplementation((media: string) => ({
      matches: wide,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })));
  afterEach(() => {
    // @ts-expect-error -- jsdom has no matchMedia; restore that
    delete window.matchMedia;
  });

  it.each([
    // From lg, the list beside the first job's Apply view (#471).
    ['the desktop list beside a job', true],
    ['the phone cards', false],
  ])('%s', async (_name, wide) => {
    wideViewport(wide);
    loadSample();
    const { container } = withTheme(
      <CloudSyncProvider>
        <TrackerView />
      </CloudSyncProvider>,
    );
    await auditA11y(container);
  });
});

describe('a11y — the Search profile fields (#388)', () => {
  it('titles with the error, and the place fields with Remote only off', async () => {
    const { container } = withTheme(
      <>
        <TitlesField titles={[]} onChange={() => {}} error />
        <WhereFields draft={{ ...NEW_PROFILE, remoteOnly: false }} onChange={() => {}} />
      </>,
    );
    await auditA11y(container);
  });
});

describe('a11y — Documents (#227)', () => {
  beforeEach(() => setOutreachMessages([...STARTER_SNIPPETS]));
  afterEach(() => {
    window.location.hash = '';
  });

  it.each([
    ['the library', '#/copy-deck'],
    ['an Outreach message opened by id', '#/copy-deck/snippet-tpl-cover'],
  ])('%s', async (_name, hash) => {
    window.location.hash = hash;
    const { container } = withTheme(<DocumentsView />);
    await auditA11y(container);
  });
});

describe('a11y — the Pipeline after the first job (#132)', () => {
  // Getting started left the Pipeline (#416); the page after the first job is still audited.
  it('the Pipeline after the first job', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    const { container, getByRole } = withTheme(<JobsList />);
    expect(getByRole('region', { name: /^Jobs$/ })).toBeInTheDocument();
    await auditA11y(container);
  });
});
