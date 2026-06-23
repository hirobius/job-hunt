import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { axe } from 'vitest-axe';
import TrackerView from './TrackerView';
import { makeTheme } from './theme';
import { getAllJobs, removeJob } from './store';

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderTracker = () =>
  render(
    <ThemeProvider theme={makeTheme('dark')}>
      <TrackerView />
    </ThemeProvider>,
  );

describe('TrackerView', () => {
  it('adds a pasted job URL to the queue', async () => {
    const user = userEvent.setup();
    renderTracker();
    await user.type(screen.getByLabelText(/job url/i), 'https://boards.greenhouse.io/acme/jobs/42');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByRole('link', { name: /boards/i })).toBeInTheDocument();
  });

  it('has no detectable WCAG A/AA violations', async () => {
    const { container } = renderTracker();
    const results = await axe(container, {
      // component-in-isolation: check WCAG conformance, skip page-structure best-practices
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    // axe-core assertion — on failure this prints the offending rule ids
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
