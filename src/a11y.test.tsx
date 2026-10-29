import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import DocumentsView from './DocumentsView';
import { setOutreachMessages } from './test/outreach';
import { STARTER_SNIPPETS } from './copyDeckStore';
import DiscoverView from './DiscoverView';
import { Onboarding } from './Onboarding';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import { addJob, getAllJobs, removeJob } from './store';
import { loadSample } from './demo/loadSample';
import { replaceCurationState } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';

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

// Discover renders first-run Onboarding on an empty curation store; seed a track so we audit the
// actual Discover surface (Onboarding is covered separately by its own render below).
beforeEach(() => {
  replaceCurationState({ categories: [], groups: [], tiles: [] });
  seedPack('consulting');
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
    ['DiscoverView', <DiscoverView />],
  ];

  it.each(views)('%s', async (_name, ui) => {
    const { container } = withTheme(ui);
    await auditA11y(container);
  });
});

describe('a11y — the Pipeline agenda with the sample pipeline (#236, was Today)', () => {
  it('To apply, Follow up (due first) and the next 7 days', async () => {
    loadSample();
    const { container, getByRole } = withTheme(<TrackerView />);
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
    ['the desktop table', true],
    ['the phone cards', false],
  ])('%s', async (_name, wide) => {
    wideViewport(wide);
    loadSample();
    const { container } = withTheme(<TrackerView />);
    await auditA11y(container);
  });
});

/** Onboarding reads sync's settled flag: signed out here, so it never waits. */
const signedOut = (ui: React.ReactNode) => (
  <CloudSyncContext.Provider value={{ settled: true } as CloudSyncApi}>
    {ui}
  </CloudSyncContext.Provider>
);

describe('a11y — first-run Onboarding (#104, #388)', () => {
  it('the titles step with no title left says why', async () => {
    const { container, getAllByRole, getByRole } = withTheme(signedOut(<Onboarding />));
    for (const b of getAllByRole('button', { name: /^Remove / })) act(() => b.click());
    await act(async () => getByRole('button', { name: 'Continue' }).click());
    expect(getByRole('alert')).toBeInTheDocument();
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

describe('a11y — the first-run steps and the Pipeline after the first job (#132, #388)', () => {
  it('each step of the Search profile form', async () => {
    const { container, getByRole } = withTheme(signedOut(<Onboarding offerSample />));
    await auditA11y(container);
    await act(async () => getByRole('button', { name: 'Continue' }).click());
    await auditA11y(container);
    await act(async () => getByRole('switch', { name: 'Remote only' }).click());
    await auditA11y(container);
  });

  // Getting started left the Pipeline (#416); the page after the first job is still audited.
  it('the Pipeline after the first job', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    const { container, getByRole } = withTheme(<TrackerView />);
    expect(getByRole('region', { name: /To apply/ })).toBeInTheDocument();
    await auditA11y(container);
  });
});
