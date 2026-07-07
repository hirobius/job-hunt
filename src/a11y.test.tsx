import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import TrackerView from './TrackerView';
import CopyDeckView from './CopyDeckView';
import DiscoverView from './DiscoverView';
import CaseStudyView from './CaseStudyView';
import AiIntakeDialog from './ai/AiIntakeDialog';
import TailorDialog from './ai/TailorDialog';
import AiNotConfigured from './ai/AiNotConfigured';
import { getAllJobs, removeJob } from './store';
import type { Job } from './types';

/**
 * Accessibility audit — every primary surface must be free of WCAG 2.0/2.1
 * A & AA violations (axe-core). Scoped to WCAG conformance tags so we test the
 * component in isolation and skip page-structure best-practices (landmarks,
 * single-h1) that only apply to a full document.
 */

const withTheme = (ui: React.ReactNode) => render(<>{ui}</>);

async function auditA11y(el: Element) {
  const results = await axe(el, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  });
  // On failure this prints the offending rule ids (+ how many nodes each hit).
  expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
}

const JOB: Job = {
  url: 'https://boards.greenhouse.io/acme/jobs/42',
  label: 'Senior Frontend Engineer',
  status: 'Saved',
  note: 'React, TypeScript, design systems.',
  salary: '$180k–$210k',
};

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
    ['CaseStudyView', <CaseStudyView slug="apply-board" />],
  ];

  it.each(views)('%s', async (_name, ui) => {
    const { container } = withTheme(ui);
    await auditA11y(container);
  });
});

describe('a11y — AI surfaces (no WCAG A/AA violations)', () => {
  // Dialogs portal to document.body, so audit baseElement, not container.
  it('AiIntakeDialog (input state)', async () => {
    const { baseElement } = withTheme(<AiIntakeDialog open onClose={() => {}} />);
    await auditA11y(baseElement);
  });

  it('TailorDialog (input state)', async () => {
    const { baseElement } = withTheme(<TailorDialog open onClose={() => {}} job={JOB} />);
    await auditA11y(baseElement);
  });

  it('AiNotConfigured (no-key panel)', async () => {
    const { container } = withTheme(<AiNotConfigured feature="“Add with AI”" />);
    await auditA11y(container);
  });
});
