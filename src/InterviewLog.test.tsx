import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';
import InterviewLog, { AddToCalendar } from './InterviewLog';
import { addJob, getAllJobs, removeJob, updateJob } from './store';

const URL_ = 'https://example.com/jobs/welder';
const current = () => getAllJobs().find((j) => j.url === URL_)!;

function Harness() {
  // Re-render from the store so the component sees persisted events.
  const job = current();
  return (
    <ToastProvider>
      <AddToCalendar job={job} />
      <InterviewLog job={job} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 0));
  addJob(URL_, 'Welder');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('InterviewLog', () => {
  it('adds an interview, persists it, and removes it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    expect(screen.getByRole('button', { name: 'Add interview' })).toBeDisabled();

    await user.type(screen.getByLabelText('Event date'), '2026-10-20');
    await user.type(screen.getByLabelText('Event note'), 'Panel round');
    await user.click(screen.getByRole('button', { name: 'Add interview' }));

    expect(current().events).toEqual([
      expect.objectContaining({ kind: 'interview', date: '2026-10-20', note: 'Panel round' }),
    ]);
    rerender(<Harness />);
    expect(screen.getByText(/2026-10-20/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove interview on 2026-10-20' }));
    expect(current().events).toEqual([]);
  });

  it('Add to calendar downloads an .ics with a VEVENT', async () => {
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:x'));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    updateJob(URL_, {
      events: [{ id: 'e1', kind: 'interview', date: '2026-10-20', time: '14:00' }],
    });
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add to calendar' }));

    expect(click).toHaveBeenCalled();
    expect(blobs).toHaveLength(1);
    const text = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsText(blobs[0]);
    });
    expect(text).toContain('BEGIN:VEVENT');
    expect(text).toContain('SUMMARY:Interview: Welder');
    click.mockRestore();
  });

  it('disables Add to calendar when nothing is upcoming', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeDisabled();
  });

  it('has no WCAG A/AA violations', async () => {
    updateJob(URL_, { events: [{ id: 'e1', kind: 'call', date: '2026-10-20' }] });
    const { container } = render(<Harness />);
    await waitFor(() => expect(screen.getByText(/2026-10-20/)).toBeInTheDocument());
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
