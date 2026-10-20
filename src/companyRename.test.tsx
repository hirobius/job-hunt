// Renaming a Job's company (#230): its Company page follows (derived), and the old name's company
// Notes follow too when no Job keeps that name, so no page is left orphaned.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import JobOverview from './JobOverview';
import { addJob, getAllJobs, removeJob, updateJob, useJobs } from './store';
import { getAllDocuments, replaceDocuments } from './documents';
import { addCompanyNote, companyBySlug } from './companies';

const URL_A = 'https://acme.example/jobs/7';

function Harness() {
  const job = useJobs().find((j) => j.url === URL_A)!;
  return <JobOverview job={job} />;
}

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceDocuments([]);
});

describe('renaming a job company (#230)', () => {
  it("moves the old company's notes to the new name when the field is left", async () => {
    addJob(URL_A, 'Design Engineer');
    updateJob(URL_A, { company: 'Acme' });
    addCompanyNote('Acme', 'Met Sam');
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Edit/ }));
    const field = screen.getByLabelText('Company');
    await userEvent.clear(field);
    await userEvent.type(field, 'Zenith Labs');
    // Mid-typing nothing moves; leaving the field does.
    expect(getAllDocuments()[0].company).toBe('Acme');
    await userEvent.tab();
    expect(getAllDocuments()[0].company).toBe('Zenith Labs');
    const page = companyBySlug('zenith-labs', getAllJobs(), getAllDocuments());
    expect(page?.jobs).toHaveLength(1);
    expect(page?.notes).toHaveLength(1);
    expect(companyBySlug('acme', getAllJobs(), getAllDocuments())).toBeUndefined();
  });
});
