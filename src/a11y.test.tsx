import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import CopyDeckView from './CopyDeckView';
import DiscoverView from './DiscoverView';
import { Onboarding } from './Onboarding';
import { getAllJobs, removeJob } from './store';
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

describe('a11y — first-run Onboarding (#104)', () => {
  it('pack picker with a pack and "Build your own" selected', async () => {
    const { container, getByRole } = withTheme(<Onboarding />);
    getByRole('checkbox', { name: 'ServiceNow' }).click();
    getByRole('checkbox', { name: 'Build your own' }).click();
    await auditA11y(container);
  });
});
