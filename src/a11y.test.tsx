import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import TodayView from './TodayView';
import CopyDeckView from './CopyDeckView';
import DiscoverView from './DiscoverView';
import { Onboarding } from './Onboarding';
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
    ['CopyDeckView', <CopyDeckView />],
    ['DiscoverView', <DiscoverView />],
  ];

  it.each(views)('%s', async (_name, ui) => {
    const { container } = withTheme(ui);
    await auditA11y(container);
  });
});

describe('a11y — Today with the sample pipeline (#128)', () => {
  it('due follow-ups and the next 7 days', async () => {
    loadSample();
    const { container } = withTheme(<TodayView />);
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
    localStorage.setItem('rjb_ui_insights_open', '1'); // audit the open Insights band too
    const { container } = withTheme(<TrackerView />);
    await auditA11y(container);
  });
});

describe('a11y — first-run Onboarding (#104)', () => {
  it('pack picker with a pack and "Build your own" selected', async () => {
    const { container, getByRole } = withTheme(<Onboarding />);
    getByRole('checkbox', { name: 'ServiceNow' }).click();
    getByRole('checkbox', { name: 'Build your own' }).click();
    await auditA11y(container);
  });
});

describe('a11y — Templates (#132)', () => {
  const viewport = (width: number) =>
    (window.matchMedia = vi.fn().mockImplementation((query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    }));
  afterEach(() => {
    // @ts-expect-error -- jsdom has no matchMedia; restore that
    delete window.matchMedia;
    window.location.hash = '';
  });

  it.each([
    ['the desktop list beside a template', 1440, '#/copy-deck'],
    ['a desktop template opened by id', 1440, '#/copy-deck/tpl-cover'],
    ['the phone list', 390, '#/copy-deck'],
    ['a phone template (Write tab)', 390, '#/copy-deck/tpl-cover'],
  ])('%s', async (_name, width, hash) => {
    viewport(width);
    window.location.hash = hash;
    const { container } = withTheme(<CopyDeckView />);
    await auditA11y(container);
  });

  it('the Delete confirmation', async () => {
    viewport(1440);
    window.location.hash = '#/copy-deck/tpl-cover';
    const { getByRole, findByRole } = withTheme(<CopyDeckView />);
    await userEvent.click(getByRole('button', { name: 'More actions' }));
    await userEvent.click(await findByRole('menuitem', { name: 'Delete' }));
    await findByRole('alertdialog');
    await auditA11y(document.body);
  });
});

describe('a11y — the three first-run steps and Getting started (#132)', () => {
  it('each step of the guided first run', async () => {
    const { container, getByRole } = withTheme(<Onboarding offerSample />);
    await auditA11y(container);
    getByRole('checkbox', { name: 'ServiceNow' }).click();
    await act(async () => getByRole('button', { name: 'Continue' }).click());
    await auditA11y(container);
    await act(async () => getByRole('button', { name: 'Continue' }).click());
    await auditA11y(container);
  });

  it('the Getting started card on Today', async () => {
    addJob('https://acme.example/jobs/1', 'Design Engineer');
    const { container, getByRole } = withTheme(<TodayView />);
    expect(getByRole('region', { name: 'Getting started' })).toBeInTheDocument();
    await auditA11y(container);
  });
});
