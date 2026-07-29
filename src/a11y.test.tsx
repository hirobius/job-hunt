import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import TrackerView from './TrackerView';
import CopyDeckView from './CopyDeckView';
import DiscoverView from './DiscoverView';
import { getAllJobs, removeJob } from './store';

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

afterEach(() => {
  cleanup();
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
