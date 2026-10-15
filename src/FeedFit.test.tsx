import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceEditor } from './FeedFit';
import { EVIDENCE_MAX } from './radar/evidenceStore';

describe('EvidenceEditor size note', () => {
  it('shows a visible note only at the cap', async () => {
    const { rerender } = render(<EvidenceEditor text="short" count={1} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^Your evidence/ }));
    expect(screen.queryByText(/character limit/)).toBeNull();
    rerender(<EvidenceEditor text={'x'.repeat(EVIDENCE_MAX)} count={1} onChange={() => {}} />);
    expect(screen.getByText(/20,000 character limit/)).toBeInTheDocument();
  });
});
